/**
 * A Cloudflare D1 look-alike on top of any synchronous SQLite driver, so the Worker's code runs unchanged inside the app
 * (see runtime.ts). Only the parts of D1 the Worker uses are here: prepare / bind / first / all / run / raw, batch and exec.
 *
 * Everything below is synchronous underneath. JavaScript cannot interleave another request into a `batch`, which is what makes a batch
 * atomic here, as it is on D1. No `await` may ever be added between BEGIN and COMMIT.
 */

export interface SqlResult {
  /** Rows as objects keyed by column name. Present for SELECT and for INSERT / UPDATE / DELETE ... RETURNING. */
  rows: Record<string, unknown>[];
  /** Rows changed by the statement. Only read for INSERT / UPDATE / DELETE. */
  changes: number;
  lastRowId: number;
}

export interface SqlDriver {
  run(sql: string, params: unknown[]): SqlResult;
}

export interface D1Meta {
  duration: number;
  changes: number;
  last_row_id: number;
  rows_read: number;
  rows_written: number;
  size_after: number;
  changed_db: boolean;
  served_by: string;
}

export interface D1ResultLike<T = Record<string, unknown>> {
  success: true;
  results: T[];
  meta: D1Meta;
}

const WRITES = /^\s*(insert|update|delete|replace)\b/i;

/**
 * Whatever the driver throws, as an Error of this runtime with SQLite's own message: the Worker tells a duplicate name from other
 * failures by reading that message, and `instanceof Error` must hold whichever native layer raised it.
 */
function asError(e: unknown): Error {
  const message = typeof e === 'object' && e !== null && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  return e instanceof Error ? e : new Error(message);
}

function runSql(driver: SqlDriver, sql: string, params: unknown[]): SqlResult {
  try {
    return driver.run(sql, params);
  } catch (e) {
    throw asError(e);
  }
}

/** D1 takes strings, numbers, null, booleans and byte arrays; `undefined` is an error there too, and a quiet NULL here would hide a bug. */
function toParam(value: unknown, index: number): unknown {
  if (value === undefined) throw new TypeError(`D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined' (parameter ${index + 1})`);
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

function meta(sql: string, res: SqlResult): D1Meta {
  const wrote = WRITES.test(sql);
  return {
    duration: 0,
    changes: wrote ? res.changes : 0,
    last_row_id: wrote ? res.lastRowId : 0,
    rows_read: res.rows.length,
    rows_written: wrote ? res.changes : 0,
    size_after: 0,
    changed_db: wrote && res.changes > 0,
    served_by: 'on-device',
  };
}

export class Statement {
  constructor(
    private readonly driver: SqlDriver,
    readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...values: unknown[]): Statement {
    return new Statement(this.driver, this.sql, values.map(toParam));
  }

  /** Runs the statement now, for batch(): same as run() without the promise. */
  execute(): D1ResultLike {
    const res = runSql(this.driver, this.sql, this.params);
    return { success: true, results: res.rows, meta: meta(this.sql, res) };
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const row = this.execute().results[0];
    if (row === undefined) return null;
    if (column === undefined) return row as T;
    if (!(column in row)) throw new Error(`D1_ERROR: No such column: ${column}`);
    return row[column] as T;
  }

  async all<T = Record<string, unknown>>(): Promise<D1ResultLike<T>> {
    return this.execute() as D1ResultLike<T>;
  }

  async run<T = Record<string, unknown>>(): Promise<D1ResultLike<T>> {
    return this.execute() as D1ResultLike<T>;
  }

  async raw<T = unknown[]>(): Promise<T[]> {
    return this.execute().results.map((r) => Object.values(r)) as T[];
  }
}

export class OnDeviceD1 {
  constructor(private readonly driver: SqlDriver) {}

  prepare(sql: string): Statement {
    return new Statement(this.driver, sql);
  }

  /** All statements or none: a failure rolls the lot back and rethrows, like D1's batch. */
  async batch(statements: Statement[]): Promise<D1ResultLike[]> {
    runSql(this.driver, 'BEGIN', []);
    try {
      const out = statements.map((s) => s.execute());
      runSql(this.driver, 'COMMIT', []);
      return out;
    } catch (err) {
      try {
        runSql(this.driver, 'ROLLBACK', []);
      } catch {
        // The failed statement may already have ended the transaction; the original error is the one to report.
      }
      throw err;
    }
  }

  /** Statements separated by `;` (migrations, tests). */
  async exec(sql: string): Promise<{ count: number; duration: number }> {
    const parts = splitStatements(sql);
    for (const part of parts) runSql(this.driver, part, []);
    return { count: parts.length, duration: 0 };
  }
}

/**
 * Splits a SQL script into statements: drops `--` comments, then cuts at `;` outside quotes. Enough for this project's migrations
 * (plain DDL, no triggers); a trigger body would need a real parser, and migrations.test.ts fails if one ever slips in.
 */
export function splitStatements(script: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: string | null = null;
  for (let i = 0; i < script.length; i++) {
    const ch = script[i]!;
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      cur += ch;
    } else if (ch === '-' && script[i + 1] === '-') {
      while (i < script.length && script[i] !== '\n') i++;
      cur += '\n';
    } else if (ch === ';') {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export interface Migration {
  name: string;
  sql: string;
}

/** Applies each migration once, in order, each in its own transaction, and remembers which ran (D1 does the same on a server). */
export function migrate(driver: SqlDriver, migrations: Migration[]): string[] {
  driver.run('CREATE TABLE IF NOT EXISTS d1_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)', []);
  const done = new Set(driver.run('SELECT name FROM d1_migrations', []).rows.map((r) => String(r.name)));
  const applied: string[] = [];
  for (const m of migrations) {
    if (done.has(m.name)) continue;
    driver.run('BEGIN', []);
    try {
      for (const stmt of splitStatements(m.sql)) driver.run(stmt, []);
      driver.run('INSERT INTO d1_migrations (name, applied_at) VALUES (?1, ?2)', [m.name, new Date().toISOString()]);
      driver.run('COMMIT', []);
    } catch (err) {
      try {
        driver.run('ROLLBACK', []);
      } catch {
        // see batch()
      }
      throw new Error(`Migration ${m.name} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    applied.push(m.name);
  }
  return applied;
}
