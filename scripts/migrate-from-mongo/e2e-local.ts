// Applies the generated SQL to a throwaway local D1 to prove it runs (used by `npm run test:e2e`).
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildSql } from './sql';
import { transform } from './transform';
import { sample } from './fixtures';

const dir = mkdtempSync(join(tmpdir(), 'ntz-migrate-'));
const worker = join(import.meta.dirname, '../../worker');
const wrangler = (...args: string[]) =>
  execFileSync('npx', ['wrangler', ...args, '--local', '--persist-to', dir], { cwd: worker, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const sql = buildSql(transform(sample, { now: new Date().toISOString(), token: () => crypto.randomUUID() })).join('\n\n');
const file = join(dir, 'import.sql');
writeFileSync(file, sql);
wrangler('d1', 'migrations', 'apply', 'nutrition-zero');
wrangler('d1', 'execute', 'nutrition-zero', '--file', file);
wrangler('d1', 'execute', 'nutrition-zero', '--file', file); // re-run must be a no-op
const out = JSON.parse(
  wrangler('d1', 'execute', 'nutrition-zero', '--json', '--command',
    "SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM log_items) AS items, (SELECT COUNT(*) FROM user_goals) AS goals"),
)[0].results[0];
console.log(out);
if (out.users !== 3 || out.items !== 3 || out.goals !== 2) {
  console.error('unexpected counts');
  process.exit(1);
}
console.log('import.sql applies cleanly and is idempotent');
