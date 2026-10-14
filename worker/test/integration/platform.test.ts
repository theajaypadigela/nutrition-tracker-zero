// Phase 1: prove the D1/SQLite and runtime features the Worker relies on (PLAN.md §3).
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { localDateIn } from '../../src/domain/time';

describe('D1 capabilities', () => {
  it('supports ON CONFLICT … DO UPDATE and RETURNING', async () => {
    await env.DB.exec('CREATE TABLE IF NOT EXISTS t_upsert (k TEXT PRIMARY KEY, v INTEGER)');
    const first = await env.DB.prepare('INSERT INTO t_upsert (k, v) VALUES (?1, ?2) RETURNING v').bind('a', 1).first<{ v: number }>();
    expect(first?.v).toBe(1);
    const second = await env.DB
      .prepare('INSERT INTO t_upsert (k, v) VALUES (?1, ?2) ON CONFLICT (k) DO UPDATE SET v = v + excluded.v RETURNING v')
      .bind('a', 5)
      .first<{ v: number }>();
    expect(second?.v).toBe(6);
  });

  it('supports UPDATE … FROM json_each with ->> extraction', async () => {
    await env.DB.exec('CREATE TABLE IF NOT EXISTS t_upd (id TEXT PRIMARY KEY, s TEXT, n REAL)');
    await env.DB.prepare(`INSERT INTO t_upd (id, s, n) SELECT value, 'old', 0 FROM json_each(?1)`).bind(JSON.stringify(['x', 'y', 'z'])).run();
    const res = await env.DB
      .prepare(`UPDATE t_upd SET s = u.value ->> '$.s', n = u.value ->> '$.n' FROM json_each(?1) AS u WHERE t_upd.id = u.value ->> '$.id'`)
      .bind(JSON.stringify([{ id: 'x', s: 'new', n: 1.5 }, { id: 'z', s: null, n: 2 }]))
      .run();
    expect(res.meta.changes).toBe(2);
    const { results } = await env.DB.prepare('SELECT * FROM t_upd ORDER BY id').all();
    expect(results).toEqual([
      { id: 'x', s: 'new', n: 1.5 },
      { id: 'y', s: 'old', n: 0 },
      { id: 'z', s: null, n: 2 },
    ]);
  });

  it('supports json_group_array(DISTINCT …) and json_insert $[#]', async () => {
    const row = await env.DB
      .prepare(`SELECT json_group_array(DISTINCT value) AS a, json_insert('[]', '$[#]', json('{"id":"t1"}')) AS b FROM json_each('["p","q","p"]')`)
      .first<{ a: string; b: string }>();
    expect(JSON.parse(row!.a).sort()).toEqual(['p', 'q']);
    expect(JSON.parse(row!.b)).toEqual([{ id: 't1' }]);
  });

  it('runs batch() as a transaction', async () => {
    await env.DB.exec('CREATE TABLE IF NOT EXISTS t_tx (k TEXT PRIMARY KEY)');
    await expect(
      env.DB.batch([
        env.DB.prepare('INSERT INTO t_tx (k) VALUES (?)').bind('one'),
        env.DB.prepare('INSERT INTO t_tx (k) VALUES (?)').bind('one'),
      ]),
    ).rejects.toThrow();
    const row = await env.DB.prepare('SELECT COUNT(*) AS c FROM t_tx').first<{ c: number }>();
    expect(row?.c).toBe(0);
  });

  it('applied the migrations, including health data and password-login sessions', async () => {
    const { results } = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite_%' ESCAPE '\\' AND name NOT LIKE 'd1\\_%' ESCAPE '\\' AND name NOT LIKE 't\\_%' ESCAPE '\\' ORDER BY name`).all<{ name: string }>();
    expect(results.map((r) => r.name)).toEqual([
      'account_sessions',
      'calls',
      'day_status',
      'food_aliases',
      'food_units',
      'foods',
      'health_profiles',
      'log_items',
      'target_sets',
      'user_goals',
      'users',
      'weight_entries',
    ]);
  });
});

describe('runtime', () => {
  it('knows Asia/Kolkata (UTC+5:30)', () => {
    expect(localDateIn('Asia/Kolkata', new Date('2026-10-03T18:29:00Z'))).toBe('2026-10-03');
    expect(localDateIn('Asia/Kolkata', new Date('2026-10-03T18:30:00Z'))).toBe('2026-10-04');
  });
});
