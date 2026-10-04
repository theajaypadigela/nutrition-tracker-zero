import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSql, literal } from './sql';
import { sample } from './fixtures';
import { localDateOf, transform } from './transform';

const now = '2026-10-04T00:00:00.000Z';
let n = 0;
const token = () => `tok${n++}`;


test('localDateOf picks the zone where the stored instant is midnight', () => {
  assert.deepEqual(localDateOf(new Date('2026-09-30T00:00:00Z')), { date: '2026-09-30', style: 'utcMidnight' });
  assert.deepEqual(localDateOf(new Date('2026-09-29T18:30:00Z')), { date: '2026-09-30', style: 'istMidnight' });
  assert.deepEqual(localDateOf('2026-09-28'), { date: '2026-09-28', style: 'string' });
});

test('transform maps users, schedules, items and goals', () => {
  const { users, items, goals, stats } = transform(sample, { now, token });
  assert.deepEqual(
    users.map((u) => [u.id, u.name, u.timezone, u.call_time, u.call_enabled]),
    [
      ['mig_u1', 'Asha', 'Asia/Kolkata', '20:05', 1],
      ['mig_u2', 'asha (2)', 'Asia/Kolkata', null, 1],
      ['mig_u3', 'ravi.k', 'Asia/Kolkata', '07:00', 0],
    ],
  );
  assert.equal(stats.renamedUsers.length, 1);
  assert.equal(new Set(users.map((u) => u.webhook_token)).size, 3);

  assert.deepEqual(
    items.map((i) => [i.id, i.user_id, i.local_date, i.meal, i.raw_name, i.normalized_name, i.quantity, i.unit, i.status, i.source]),
    [
      ['mig_e1', 'mig_u1', '2026-09-30', 'breakfast', 'Idlis', 'idli', 3, 'piece', 'pending_food', 'import'],
      ['mig_e2', 'mig_u1', '2026-09-30', 'dinner', "Mom's dal", 'mom s dal', 1, 'katori', 'pending_food', 'import'],
      ['mig_e5', 'mig_u3', '2026-09-28', null, 'Poha', 'poha', 1.5, 'serving', 'pending_food', 'import'],
    ],
  );
  assert.equal(stats.mergedDuplicateLogs, 1);
  assert.deepEqual(stats.dateStyles, { utcMidnight: 2, istMidnight: 1, string: 1, other: 0 });
  assert.deepEqual(
    stats.skippedEntries.sort((a, b) => a.reason.localeCompare(b.reason)),
    [
      { reason: 'bad quantity', count: 1 },
      { reason: 'no matching food log / user', count: 1 },
    ],
  );
  assert.deepEqual(goals, [
    { user_id: 'mig_u1', nutrient: 'protein', target: 120 },
    { user_id: 'mig_u3', nutrient: 'iron', target: 18 },
  ]);
});

test('SQL escapes quotes and chunks large inserts', () => {
  assert.equal(literal("Mom's"), "'Mom''s'");
  assert.equal(literal(null), 'NULL');
  const { users, goals } = transform(sample, { now, token });
  const many = Array.from({ length: 3000 }, (_, i) => ({
    id: `mig_${i}`, user_id: 'mig_u1', local_date: '2026-09-30', meal: null, raw_name: `food ${i} ${'x'.repeat(20)}`,
    normalized_name: `food ${i}`, quantity: 1, unit: 'piece', status: 'pending_food' as const, source: 'import' as const, created_at: now,
  }));
  const statements = buildSql({ users, items: many, goals });
  assert.ok(statements.length > 3);
  for (const s of statements) assert.ok(s.length < 100_000, `statement of ${s.length} bytes`);
  assert.ok(!statements.join('').match(/\bBEGIN\b|\bCOMMIT\b/));
});
