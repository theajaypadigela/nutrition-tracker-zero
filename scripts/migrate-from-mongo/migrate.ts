/**
 * One-off import from the old MongoDB into D1 (PLAN.md §10).
 *
 *   MONGODB_URI=… npx tsx migrate.ts --dry-run     # counts + a few sample rows, writes nothing
 *   MONGODB_URI=… npx tsx migrate.ts               # writes out/import.sql
 *   cd ../../worker && npx wrangler d1 execute nutrition-zero --remote --file ../scripts/migrate-from-mongo/out/import.sql
 *
 * MONGODB_URI is read from the environment only and never printed. The connection is read-only use:
 * only find() is called.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import { buildSql } from './sql';
import { transform } from './transform';

const dryRun = process.argv.includes('--dry-run');
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('Set MONGODB_URI in the environment (it is never printed or written anywhere).');
  process.exit(1);
}

function randomToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
}

const client = new MongoClient(uri, { readPreference: 'secondaryPreferred', appName: 'ntz-migration' });
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || undefined);
  const find = (name: string) => db.collection(name).find({}).toArray() as Promise<any[]>;
  const [users, schedules, logs, entries, preferences] = await Promise.all([
    find('users'),
    find('meal_schedules'),
    find('food_logs'),
    find('food_entries'),
    find('user_nutrient_preferences'),
  ]);
  console.log(`Read ${users.length} users, ${schedules.length} schedules, ${logs.length} logs, ${entries.length} entries, ${preferences.length} preferences from "${db.databaseName}".`);

  const result = transform({ users, schedules, logs, entries, preferences }, { now: new Date().toISOString(), token: randomToken });
  const { stats } = result;
  console.log(`\nUsers: ${stats.users}${stats.renamedUsers.length ? ` (renamed for uniqueness: ${stats.renamedUsers.join('; ')})` : ''}`);
  console.log(`Items: ${stats.items}  (merged duplicate day logs: ${stats.mergedDuplicateLogs})`);
  console.log(`logDate styles: ${JSON.stringify(stats.dateStyles)}  ← check these look right before importing`);
  for (const s of stats.skippedEntries) console.log(`Skipped entries (${s.reason}): ${s.count}`);
  console.log(`Goals: ${stats.goals}`);

  const topNames = new Map<string, number>();
  for (const i of result.items) topNames.set(i.normalized_name, (topNames.get(i.normalized_name) ?? 0) + 1);
  console.log(`Distinct foods: ${topNames.size}. Most logged: ${[...topNames].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, c]) => `${n} (${c})`).join(', ')}`);

  if (dryRun) {
    console.log('\nProfiles to create:', result.users.map((u) => `${u.name} @ ${u.call_time ?? 'no time'} ${u.timezone}`).join(' | '));
    console.log('Sample items:', result.items.slice(0, 5).map((i) => `${i.local_date} ${i.meal ?? '-'} ${i.quantity} ${i.unit} ${i.raw_name}`));
    console.log('\nDry run: nothing written.');
  } else {
    const statements = buildSql(result);
    const outDir = join(dirname(fileURLToPath(import.meta.url)), 'out');
    mkdirSync(outDir, { recursive: true });
    const file = join(outDir, 'import.sql');
    writeFileSync(file, `-- Generated ${new Date().toISOString()} by scripts/migrate-from-mongo. Safe to re-run.\n${statements.join('\n\n')}\n`);
    console.log(`\nWrote ${statements.length} statements to ${file}`);
    console.log('Next: cd ../../worker && npx wrangler d1 execute nutrition-zero --remote --file ../scripts/migrate-from-mongo/out/import.sql');
    console.log('Then: curl -X POST https://<worker>/maintenance/resolve-pending -H "authorization: Bearer $APP_TOKEN"');
  }
} finally {
  await client.close();
}
