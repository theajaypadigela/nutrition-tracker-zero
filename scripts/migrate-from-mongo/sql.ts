/**
 * SQL for `wrangler d1 execute --file`: no BEGIN/COMMIT, every statement under ~90 KB, idempotent
 * (INSERT OR IGNORE on deterministic mig_ ids), and rows whose user didn't land are filtered out so
 * a profile-name clash can never break the import with a foreign-key error.
 */
import type { GoalRow, ItemRow, UserRow } from './transform';

const MAX_STATEMENT = 90_000;

export function literal(v: string | number | null): string {
  if (v === null) return 'NULL';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`non-finite number ${v}`);
    return String(v);
  }
  return `'${v.replace(/'/g, "''")}'`;
}

function chunked(prefix: string, suffix: string, tuples: string[]): string[] {
  const out: string[] = [];
  let batch: string[] = [];
  let size = prefix.length + suffix.length;
  for (const t of tuples) {
    if (batch.length && size + t.length + 2 > MAX_STATEMENT) {
      out.push(`${prefix}${batch.join(',\n')}${suffix}`);
      batch = [];
      size = prefix.length + suffix.length;
    }
    batch.push(t);
    size += t.length + 2;
  }
  if (batch.length) out.push(`${prefix}${batch.join(',\n')}${suffix}`);
  return out;
}

const tuple = (values: (string | number | null)[]) => `(${values.map(literal).join(', ')})`;

export function buildSql(rows: { users: UserRow[]; items: ItemRow[]; goals: GoalRow[] }): string[] {
  const statements: string[] = [];
  statements.push(
    ...chunked(
      'INSERT OR IGNORE INTO users (id, name, timezone, call_time, call_enabled, webhook_token, created_at, updated_at) VALUES\n',
      ';',
      rows.users.map((u) => tuple([u.id, u.name, u.timezone, u.call_time, u.call_enabled, u.webhook_token, u.created_at, u.updated_at])),
    ),
  );
  // SQLite names VALUES columns column1, column2, …; column2 is user_id.
  statements.push(
    ...chunked(
      'INSERT OR IGNORE INTO log_items (id, user_id, local_date, meal, raw_name, normalized_name, quantity, unit, status, source, created_at)\nSELECT * FROM (VALUES\n',
      '\n) WHERE column2 IN (SELECT id FROM users);',
      rows.items.map((i) => tuple([i.id, i.user_id, i.local_date, i.meal, i.raw_name, i.normalized_name, i.quantity, i.unit, i.status, i.source, i.created_at])),
    ),
  );
  statements.push(
    ...chunked(
      'INSERT OR IGNORE INTO user_goals (user_id, nutrient, target)\nSELECT * FROM (VALUES\n',
      '\n) WHERE column1 IN (SELECT id FROM users);',
      rows.goals.map((g) => tuple([g.user_id, g.nutrient, g.target])),
    ),
  );
  return statements;
}
