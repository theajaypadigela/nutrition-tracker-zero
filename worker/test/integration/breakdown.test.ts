/**
 * `GET /reports/breakdown`: the logged items behind a nutrient's total, over any span of days. Whatever else changes, the list must add up
 * to the figure the dashboard shows for the same days: `GET /days/:date` for a day, `GET /reports/range` for a span.
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { NUTRIENT_KEYS, round } from '../../src/domain/nutrients';
import { addDays, localDateIn } from '../../src/domain/time';
import { withDayCompletion } from '../features';
import { api, createProfile, createProfileWithSecret, unique } from '../helpers';

const TODAY = localDateIn('Asia/Kolkata');
const D1 = addDays(TODAY, -2);
const D2 = addDays(TODAY, -1);

async function food(name: string, baseUnit: string, nutrients: Record<string, number>) {
  const res = await api('POST', '/foods', { body: { displayName: name, baseUnit, nutrients } });
  expect(res.status).toBe(201);
  return res.body.food;
}

async function scenario() {
  const tag = unique('bk');
  const idli = await food(`${tag} idli`, 'piece', { calories: 58, protein: 2.15, carbs: 12, fat: 0.4, fiber: 0.8, sugar: 0.3, sodium: 110, vitaminB12: 0.1, calcium: 8 });
  const paneer = await food(`${tag} paneer`, 'katori', { calories: 260, protein: 14.3, carbs: 8, fat: 20, vitaminA: 90, calcium: 240, iron: 1.2 });
  const plain = await food(`${tag} plain`, 'piece', { calories: 45 }); // no protein, no vitamins: unknown for them
  const { userId, secret } = await createProfileWithSecret();
  const log = (date: string, items: unknown[]) => api('POST', `/days/${date}/items`, { userId, body: { items } });
  await log(D1, [
    { name: idli.displayName, quantity: 3, unit: 'piece', meal: 'breakfast' },
    { name: paneer.displayName, quantity: 1.5, unit: 'katori', meal: 'lunch' },
  ]);
  await log(D2, [
    { name: idli.displayName, quantity: 2, unit: 'piece', meal: 'breakfast' },
    { name: plain.displayName, quantity: 2, unit: 'piece', meal: 'snack' },
    { name: `${tag} nobody has this`, quantity: 1, unit: 'bowl', meal: 'dinner' },
  ]);
  await log(TODAY, [
    { name: paneer.displayName, quantity: 1, unit: 'katori', meal: 'dinner' },
    { name: paneer.displayName, quantity: 1, unit: 'cup', meal: 'dinner' }, // a unit nobody has converted: pending
  ]);
  return { userId, secret, tag, idli, paneer, plain };
}

const breakdown = (userId: string, secret: string, nutrient: string, from: string, to: string) =>
  api('GET', `/reports/breakdown?from=${from}&to=${to}&nutrient=${nutrient}`, { userId, secret });

describe('GET /reports/breakdown adds up to the dashboard', () => {
  it('matches the day for every nutrient: the total, how many items are unknown, and what the items sum to', async () => {
    const { userId, secret } = await scenario();
    for (const date of [D1, D2, TODAY]) {
      const day = (await api('GET', `/days/${date}`, { userId })).body;
      for (const key of NUTRIENT_KEYS) {
        const b = (await breakdown(userId, secret, key, date, date)).body;
        expect(b.items).toHaveLength(day.items.length);
        expect(b.total ?? 0).toBe(day.totals[key].value);
        expect(b.missingItems).toBe(day.totals[key].missingItems);
        expect(round(b.items.reduce((s: number, i: any) => s + (i.amount ?? 0), 0))).toBe(b.total ?? 0);
        // each item's amount is the one the day shows for that item
        for (const [i, item] of day.items.entries()) {
          expect(b.items[i].id).toBe(item.id);
          expect(b.items[i].amount).toBe(item.nutrients[key]);
        }
      }
    }
  });

  it('matches the range report for every nutrient over a span of days', async () => {
    const { userId, secret } = await scenario();
    const range = (await api('GET', `/reports/range?from=${D1}&to=${TODAY}`, { userId, secret })).body;
    for (const key of NUTRIENT_KEYS) {
      const b = (await breakdown(userId, secret, key, D1, TODAY)).body;
      const r = range.nutrients.find((n: any) => n.nutrient === key);
      expect(b.total).toBe(r.total);
      expect(b.knownItems).toBe(r.knownItems);
      expect(b.missingItems).toBe(r.missingItems);
      expect(b.isLowerBound).toBe(r.isLowerBound);
    }
  });

  it('lists the items by day then as logged, with their quantity, meal, name and the food they were counted as', async () => {
    const { userId, secret, tag, idli } = await scenario();
    const b = (await breakdown(userId, secret, 'protein', D1, D2)).body;
    expect(b.nutrient).toBe('protein');
    expect(b.range).toEqual({ from: D1, to: D2, through: D2 });
    expect(b.display).toEqual({ numbersHidden: false });
    // by day; inside a day as the day lists them (items added together share a moment, so their order there is by id)
    const rows = b.items.map((i: any) => [i.date, i.rawName, i.quantity, i.unit, i.meal, i.amount]);
    expect(rows.filter((r: any[]) => r[0] === D1)).toHaveLength(2);
    expect(rows.slice(0, 2).every((r: any[]) => r[0] === D1) && rows.slice(2).every((r: any[]) => r[0] === D2)).toBe(true);
    expect(rows).toEqual(expect.arrayContaining([
      [D1, `${tag} idli`, 3, 'piece', 'breakfast', 6.45],
      [D1, `${tag} paneer`, 1.5, 'katori', 'lunch', 21.45],
      [D2, `${tag} idli`, 2, 'piece', 'breakfast', 4.3],
      [D2, `${tag} plain`, 2, 'piece', 'snack', null],
      [D2, `${tag} nobody has this`, 1, 'bowl', 'dinner', null],
    ]));
    expect(b.items.map((i: any) => i.id)).toEqual((await api('GET', `/days/${D1}`, { userId })).body.items.map((i: any) => i.id).concat((await api('GET', `/days/${D2}`, { userId })).body.items.map((i: any) => i.id)));
    const idliRow = b.items.find((i: any) => i.date === D1 && i.rawName.endsWith('idli'));
    expect(idliRow).toMatchObject({ foodId: idli.id, foodName: `${tag} idli`, status: 'resolved' });
    expect(b.items.find((i: any) => i.rawName.endsWith('nobody has this'))).toMatchObject({ foodId: null, foodName: null, status: 'pending_food' });
    expect(b.total).toBe(32.2);
    expect(b).toMatchObject({ knownItems: 3, missingItems: 2, isLowerBound: true });
  });

  it('stays in step when an entry is edited, deleted or added', async () => {
    const { userId, secret, tag, idli } = await scenario();
    const before = (await breakdown(userId, secret, 'protein', D1, D1)).body;
    expect(before.total).toBe(27.9);
    // edit: three idlis become five
    const byName = (b: any, suffix: string) => b.items.find((i: any) => i.rawName.endsWith(suffix));
    await api('PATCH', `/items/${byName(before, 'idli').id}`, { userId, body: { quantity: 5 } });
    let after = (await breakdown(userId, secret, 'protein', D1, D1)).body;
    expect(byName(after, 'idli').amount).toBe(10.75);
    expect(after.total).toBe(32.2);
    expect(after.total).toBe((await api('GET', `/days/${D1}`, { userId })).body.totals.protein.value);
    // delete: the paneer goes
    await api('DELETE', `/items/${byName(after, 'paneer').id}`, { userId });
    after = (await breakdown(userId, secret, 'protein', D1, D1)).body;
    expect(after.items).toHaveLength(1);
    expect(after.total).toBe(10.75);
    // add: two more
    await api('POST', `/days/${D1}/items`, { userId, body: { items: [{ name: idli.displayName, quantity: 2, unit: 'piece', meal: 'snack' }] } });
    after = (await breakdown(userId, secret, 'protein', D1, D1)).body;
    expect(after.items).toHaveLength(2);
    expect(after.total).toBe(15.05);
    expect(after.total).toBe((await api('GET', `/days/${D1}`, { userId })).body.totals.protein.value);
    void tag;
  });

  it('moves a pending item into the list with its amount once someone enters its food, and out of "unknown"', async () => {
    const { userId, secret, tag } = await scenario();
    expect((await breakdown(userId, secret, 'protein', D2, D2)).body.missingItems).toBe(2);
    await food(`${tag} nobody has this`, 'bowl', { calories: 200, protein: 9 });
    const b = (await breakdown(userId, secret, 'protein', D2, D2)).body;
    expect(b.items.find((i: any) => i.rawName.endsWith('nobody has this'))).toMatchObject({ status: 'resolved', amount: 9 });
    expect(b.missingItems).toBe(1);
    expect(b.total).toBe(13.3);
  });

  it('lists only this person\'s items, and an empty period as an empty list with no total', async () => {
    const { userId, secret } = await scenario();
    const other = await createProfile();
    await api('POST', `/days/${D1}/items`, { userId: other, body: { items: [{ name: 'someone elses thing', quantity: 1, unit: 'bowl' }] } });
    expect((await breakdown(userId, secret, 'protein', D1, D1)).body.items.map((i: any) => i.rawName)).not.toContain('someone elses thing');
    const empty = (await breakdown(userId, secret, 'protein', addDays(TODAY, -40), addDays(TODAY, -30))).body;
    expect(empty).toMatchObject({ total: null, items: [], knownItems: 0, missingItems: 0, isLowerBound: false });
  });
});

describe('GET /reports/breakdown: the request', () => {
  it('stops the span at today, like the range report, and refuses a span that has not begun', async () => {
    const { userId, secret } = await scenario();
    const b = (await breakdown(userId, secret, 'protein', TODAY, addDays(TODAY, 5))).body;
    expect(b.range).toEqual({ from: TODAY, to: addDays(TODAY, 5), through: TODAY });
    expect((await breakdown(userId, secret, 'protein', addDays(TODAY, 1), addDays(TODAY, 2))).status).toBe(400);
  });

  it('refuses a missing or unknown nutrient, bad dates and a reversed span', async () => {
    const { userId, secret } = await scenario();
    const get = (qs: string) => api('GET', `/reports/breakdown?${qs}`, { userId, secret });
    expect((await get(`from=${D1}&to=${D2}`)).status).toBe(400);
    expect((await get(`from=${D1}&to=${D2}&nutrient=gold`)).status).toBe(400);
    expect((await get(`from=nope&to=${D2}&nutrient=protein`)).status).toBe(400);
    expect((await get(`from=${D1}&nutrient=protein`)).status).toBe(400);
    expect((await get(`from=${D2}&to=${D1}&nutrient=protein`)).status).toBe(400);
    expect((await api('GET', `/reports/breakdown?from=${D1}&to=${D2}&nutrient=protein`)).status).toBe(400); // no profile
  });

  it('needs the profile\'s secret, like the report it adds up to', async () => {
    const { userId } = await scenario();
    const res = await api('GET', `/reports/breakdown?from=${D1}&to=${D2}&nutrient=protein`, { userId });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('profile_secret_required');
  });

  it('shows no amounts for a person who hid their numbers', async () => {
    const { userId, secret } = await scenario();
    const saved = await api('PUT', '/me/profile', {
      userId,
      secret,
      body: { profile: { birthYear: 1996, birthMonth: 3, sexForCalc: 'female', heightCm: 160, weightKg: 60, activity: 'low_active', goal: 'general_health', pace: 'standard', pattern: 'omnivore', referenceSet: 'nasem', numbersHidden: true }, safety: {}, consentVersion: '2026-10-v1' },
    });
    expect(saved.status).toBe(200);
    const b = (await breakdown(userId, secret, 'protein', D1, TODAY)).body;
    expect(b).toMatchObject({ display: { numbersHidden: true }, total: null, items: [] });
  });

  it('leaves out a day marked "leave out" only while day marking is on, as the range report does', withDayCompletion(async () => {
    const { userId, secret } = await scenario();
    await env.DB.prepare(`INSERT INTO day_status (user_id, local_date, status, updated_at) VALUES (?, ?, 'skip', 't')`).bind(userId, D1).run();
    const b = (await breakdown(userId, secret, 'protein', D1, D2)).body;
    expect(b.items.every((i: any) => i.date === D2)).toBe(true);
    const range = (await api('GET', `/reports/range?from=${D1}&to=${D2}`, { userId, secret })).body;
    expect(b.total).toBe(range.nutrients.find((n: any) => n.nutrient === 'protein').total);
  }));

  it('counts a day marked "leave out" like any other while day marking is off', async () => {
    const { userId, secret } = await scenario();
    await env.DB.prepare(`INSERT INTO day_status (user_id, local_date, status, updated_at) VALUES (?, ?, 'skip', 't')`).bind(userId, D1).run();
    expect((await breakdown(userId, secret, 'protein', D1, D2)).body.items.some((i: any) => i.date === D1)).toBe(true);
  });
});
