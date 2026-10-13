// A SQLite driver over Node's built-in sqlite, shaped like the one the app uses on the phone (src/embedded/opSqlite.ts).
import type { SqlDriver } from '@/embedded/d1';

export function nodeSqliteDriver(): SqlDriver {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  return {
    run(sql, params) {
      const stmt = db.prepare(sql);
      const columns = stmt.columns().length;
      if (columns > 0) {
        return { rows: stmt.all(...params).map((r: object) => ({ ...r })), changes: 0, lastRowId: 0 };
      }
      const res = stmt.run(...params);
      return { rows: [], changes: Number(res.changes), lastRowId: Number(res.lastInsertRowid) };
    },
  };
}
