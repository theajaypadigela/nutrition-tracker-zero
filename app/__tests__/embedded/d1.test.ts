import { OnDeviceD1, migrate, splitStatements } from '@/embedded/d1';
import { MIGRATIONS } from '@/embedded/migrations.generated';
import { nodeSqliteDriver } from '../../testing/nodeSqlite';

function fresh() {
  const driver = nodeSqliteDriver();
  driver.run('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT UNIQUE, n REAL)', []);
  return { driver, db: new OnDeviceD1(driver) };
}

describe('splitStatements', () => {
  it('cuts at semicolons outside quotes and drops comments', () => {
    const sql = "-- header; not a statement\nCREATE TABLE a (x TEXT DEFAULT 'a;b'); -- trailing\nINSERT INTO a VALUES ('--not a comment');\n";
    expect(splitStatements(sql)).toEqual(["CREATE TABLE a (x TEXT DEFAULT 'a;b')", "INSERT INTO a VALUES ('--not a comment')"]);
  });

  it('keeps every migration free of trigger bodies it could not split', () => {
    for (const m of MIGRATIONS) expect(m.sql).not.toMatch(/\bCREATE\s+TRIGGER\b/i);
  });
});

describe('the D1 look-alike', () => {
  it('binds, reads first / all / raw, and reports changes like D1', async () => {
    const { db } = fresh();
    const ins = await db.prepare('INSERT INTO t (name, n) VALUES (?1, ?2)').bind('a', 1.5).run();
    expect(ins.meta.changes).toBe(1);
    expect(ins.meta.last_row_id).toBe(1);
    expect(await db.prepare('SELECT name, n FROM t WHERE id = ?1').bind(1).first()).toEqual({ name: 'a', n: 1.5 });
    expect(await db.prepare('SELECT name FROM t WHERE id = ?1').bind(1).first('name')).toBe('a');
    expect(await db.prepare('SELECT name FROM t WHERE id = ?1').bind(99).first()).toBeNull();
    const all = await db.prepare('SELECT * FROM t').all();
    expect(all.results).toHaveLength(1);
    expect(all.meta.changes).toBe(0);
    expect(await db.prepare('SELECT name, n FROM t').raw()).toEqual([['a', 1.5]]);
    const upd = await db.prepare('UPDATE t SET n = ?1 WHERE name = ?2').bind(2, 'zzz').run();
    expect(upd.meta.changes).toBe(0);
  });

  it('returns rows from INSERT ... RETURNING and supports ON CONFLICT and json_each', async () => {
    const { db } = fresh();
    const [r] = await db.batch([db.prepare('INSERT INTO t (name, n) VALUES (?1, ?2) RETURNING id').bind('a', 1)]);
    expect(r!.results).toEqual([{ id: 1 }]);
    await db.prepare('INSERT INTO t (name, n) VALUES (?1, ?2) ON CONFLICT (name) DO UPDATE SET n = excluded.n').bind('a', 9).run();
    expect(await db.prepare('SELECT n FROM t WHERE name = ?1').bind('a').first('n')).toBe(9);
    const rows = await db.prepare("SELECT j.value ->> '$.k' AS k FROM json_each(?1) AS j").bind(JSON.stringify([{ k: 'x' }, { k: 'y' }])).all();
    expect(rows.results).toEqual([{ k: 'x' }, { k: 'y' }]);
  });

  it('turns booleans into 0 / 1 and refuses undefined, as D1 does', async () => {
    const { db } = fresh();
    await db.prepare('INSERT INTO t (name, n) VALUES (?1, ?2)').bind('a', true).run();
    expect(await db.prepare('SELECT n FROM t').first('n')).toBe(1);
    expect(() => db.prepare('SELECT ?1').bind(undefined)).toThrow(/D1_TYPE_ERROR/);
  });

  it('rolls a whole batch back when one statement fails, and keeps going afterwards', async () => {
    const { db } = fresh();
    await db.prepare('INSERT INTO t (name) VALUES (?1)').bind('keep').run();
    await expect(
      db.batch([db.prepare('INSERT INTO t (name) VALUES (?1)').bind('lost'), db.prepare('INSERT INTO t (name) VALUES (?1)').bind('keep')]),
    ).rejects.toThrow(/UNIQUE constraint failed/);
    expect((await db.prepare('SELECT name FROM t').all()).results).toEqual([{ name: 'keep' }]);
    await db.batch([db.prepare('INSERT INTO t (name) VALUES (?1)').bind('ok')]);
    expect((await db.prepare('SELECT count(*) AS c FROM t').first<{ c: number }>())!.c).toBe(2);
  });

  it('exec runs a script', async () => {
    const { db } = fresh();
    await db.exec("INSERT INTO t (name) VALUES ('a'); INSERT INTO t (name) VALUES ('b');");
    expect((await db.prepare('SELECT count(*) AS c FROM t').first<{ c: number }>())!.c).toBe(2);
  });
});

describe('migrations', () => {
  it('apply once, in order, and are remembered', () => {
    const driver = nodeSqliteDriver();
    expect(migrate(driver, MIGRATIONS)).toEqual(MIGRATIONS.map((m) => m.name));
    expect(migrate(driver, MIGRATIONS)).toEqual([]);
    const tables = driver.run("SELECT name FROM sqlite_master WHERE type = 'table'", []).rows.map((r) => r.name);
    expect(tables).toEqual(expect.arrayContaining(['users', 'calls', 'foods', 'log_items', 'd1_migrations']));
  });

  it('roll a failing migration back and say which one', () => {
    const driver = nodeSqliteDriver();
    expect(() =>
      migrate(driver, [
        { name: '0001_ok.sql', sql: 'CREATE TABLE a (x INTEGER);' },
        { name: '0002_bad.sql', sql: 'CREATE TABLE b (x INTEGER); CREATE TABLE a (x INTEGER);' },
      ]),
    ).toThrow(/0002_bad\.sql/);
    const tables = driver.run("SELECT name FROM sqlite_master WHERE type = 'table'", []).rows.map((r) => r.name);
    expect(tables).toContain('a');
    expect(tables).not.toContain('b');
    expect(migrate(driver, [{ name: '0001_ok.sql', sql: 'CREATE TABLE a (x INTEGER);' }])).toEqual([]);
  });
});
