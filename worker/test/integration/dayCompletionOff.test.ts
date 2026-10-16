/**
 * Day marking is off for now (src/domain/features.ts): a person cannot say a day is complete, incomplete or left out, the call does not
 * ask, and what was stored earlier is kept but neither shown nor counted. These tests hold that, and that nothing was deleted.
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { FEATURES } from '../../src/domain/features';
import { addDays, localDateIn, weekStartOf } from '../../src/domain/time';
import { withDayCompletion } from '../features';
import { api, createProfile, createProfileWithSecret, unique } from '../helpers';

const TODAY = localDateIn('Asia/Kolkata');
const WEEK = addDays(weekStartOf(TODAY), -7);
const DATES = Array.from({ length: 7 }, (_, i) => addDays(WEEK, i));
const stored = (userId: string) => env.DB.prepare('SELECT local_date, status FROM day_status WHERE user_id = ? ORDER BY local_date').bind(userId).all<{ local_date: string; status: string }>().then((r) => r.results);

describe('day marking is switched off', () => {
  it('is off in the product', () => {
    expect(FEATURES.dayCompletion).toBe(false);
  });

  it('refuses to set or clear a mark, says why, and writes nothing', async () => {
    const userId = await createProfile();
    const set = await api('PUT', `/days/${DATES[2]}/status`, { userId, body: { status: 'skip' } });
    expect(set.status).toBe(409);
    expect(set.body.error.code).toBe('day_marking_off');
    const clear = await api('DELETE', `/days/${DATES[2]}/status`, { userId });
    expect(clear.status).toBe(409);
    expect(clear.body.error.code).toBe('day_marking_off');
    expect(await stored(userId)).toEqual([]);
  });

  it('keeps marks stored earlier exactly as they are, but does not show or count them', async () => {
    const { userId, secret } = await createProfileWithSecret();
    const meal = (await api('POST', '/foods', { body: { displayName: unique('meal'), baseUnit: 'plate', nutrients: { calories: 1800, protein: 70, carbs: 230, fat: 55 } } })).body.food;
    for (const d of DATES) await api('POST', `/days/${d}/items`, { userId, body: { items: [{ name: meal.displayName, quantity: 1, unit: 'plate' }] } });
    await env.DB.prepare(`INSERT INTO day_status (user_id, local_date, status, updated_at) VALUES (?, ?, 'skip', 't'), (?, ?, 'partial', 't')`)
      .bind(userId, DATES[1], userId, DATES[4]).run();

    // not shown
    expect((await api('GET', `/days/${DATES[1]}`, { userId })).body.status).toBeNull();
    expect((await api('GET', `/days?from=${DATES[0]}&to=${DATES[6]}`, { userId })).body.days.map((d: any) => d.status)).toEqual(Array(7).fill(null));
    // not counted: every logged day is a day, the weekly report and the range report alike
    const weekly = (await api('GET', `/reports/weekly?start=${WEEK}`, { userId, secret })).body;
    expect(weekly.coverage.days.map((d: any) => d.state)).toEqual(Array(7).fill('valid'));
    expect(weekly.coverage.assessedDays).toBe(7);
    const range = (await api('GET', `/reports/range?from=${DATES[0]}&to=${DATES[6]}`, { userId, secret })).body;
    expect(range.coverage).toMatchObject({ loggedDays: 7, skippedDays: 0, itemCount: 7 });
    expect(range.nutrients.find((n: any) => n.nutrient === 'calories').total).toBe(1800 * 7);
    // not deleted
    expect(await stored(userId)).toEqual([{ local_date: DATES[1], status: 'skip' }, { local_date: DATES[4], status: 'partial' }]);
  });

  it('brings every stored mark back into the figures when the feature is switched on again', withDayCompletion(async () => {
    const { userId, secret } = await createProfileWithSecret();
    const meal = (await api('POST', '/foods', { body: { displayName: unique('meal'), baseUnit: 'plate', nutrients: { calories: 1800, protein: 70, carbs: 230, fat: 55 } } })).body.food;
    for (const d of DATES) await api('POST', `/days/${d}/items`, { userId, body: { items: [{ name: meal.displayName, quantity: 1, unit: 'plate' }] } });
    await env.DB.prepare(`INSERT INTO day_status (user_id, local_date, status, updated_at) VALUES (?, ?, 'skip', 't')`).bind(userId, DATES[1]).run();
    expect((await api('GET', `/days/${DATES[1]}`, { userId })).body.status).toBe('skip');
    expect((await api('GET', `/reports/weekly?start=${WEEK}`, { userId, secret })).body.coverage.days[1].state).toBe('skipped');
    expect((await api('PUT', `/days/${DATES[2]}/status`, { userId, body: { status: 'complete' } })).status).toBe(200);
  }));

  it('does not offer the "looks incomplete" insight, because its question has no answer now', async () => {
    const { userId, secret } = await createProfileWithSecret();
    const small = (await api('POST', '/foods', { body: { displayName: unique('crumbs'), baseUnit: 'serving', nutrients: { calories: 350, protein: 8 } } })).body.food;
    for (const d of DATES.slice(0, 2)) await api('POST', `/days/${d}/items`, { userId, body: { items: [{ name: small.displayName, quantity: 1, unit: 'serving' }] } });
    const ids = (await api('GET', `/reports/weekly?start=${WEEK}`, { userId, secret })).body.insights.map((i: any) => i.id);
    expect(ids).not.toContain('incomplete_days');
    // …and it is back with the feature, so the rule is still there to restore
    const on = await withDayCompletion(async () => {
      const again = (await api('GET', `/reports/weekly?start=${WEEK}`, { userId, secret })).body.insights.map((i: any) => i.id);
      expect(again).toContain('incomplete_days');
    });
    await on();
  });
});
