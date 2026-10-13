import { open, type Scalar } from '@op-engineering/op-sqlite';
import type { SqlDriver } from './d1';

/**
 * The phone's SQLite file, in the app's private storage. Synchronous calls on purpose: a batch must not let another request in
 * between its statements (see d1.ts), and every query here is a few rows on local flash.
 */
export function openDeviceDatabase(name = 'nutrition.db'): SqlDriver {
  const db = open({ name });
  // D1 enforces foreign keys; the Worker's deletes rely on it (ON DELETE CASCADE).
  db.executeSync('PRAGMA foreign_keys = ON');
  return {
    run(sql, params) {
      const res = db.executeSync(sql, params as Scalar[]);
      return { rows: (res.rows ?? []) as Record<string, unknown>[], changes: res.rowsAffected ?? 0, lastRowId: res.insertId ?? 0 };
    },
  };
}
