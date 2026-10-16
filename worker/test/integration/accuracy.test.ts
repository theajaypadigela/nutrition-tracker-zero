/**
 * Food and portion accuracy, and incomplete days, end to end (WEEKLY_BREAKDOWN_PLAN.md 7.2, 7.4, 7.7): whether a food's numbers are
 * for it raw or as eaten, what a logged amount comes to in grams, amounts worth a second look, whether a day counts, and what a
 * report says is missing. Also the care-team numbers that stay behind the secret (security review).
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import wranglerConfig from '../../wrangler.jsonc?raw';
import { addDays, localDateIn, weekStartOf } from '../../src/domain/time';
import { weeklyReportResponse } from '../../src/routes/reports';
import { api, createProfileWithSecret, unique } from '../helpers';
import { withDayCompletion } from '../features';

const TODAY = localDateIn('Asia/Kolkata');
const WEEK = addDays(weekStartOf(TODAY), -7);
const DATES = Array.from({ length: 7 }, (_, i) => addDays(WEEK, i));
const SAFE = { pregnantOrBreastfeeding: false, eatingDisorder: false, clinicianDiet: false, dietInteractingMedicine: false };
const ASHA = { birthYear: 1996, birthMonth: 3, sexForCalc: 'female', heightCm: 160, weightKg: 60, activity: 'low_active', goal: 'general_health', pace: 'standard', pattern: 'omnivore', referenceSet: 'nasem' };

const create = (body: Record<string, unknown>) => api('POST', '/foods', { body });
const dryRice = (over: Record<string, unknown> = {}) => ({ displayName: unique('rice'), baseUnit: '100 g', nutrients: { calories: 350, protein: 7, carbs: 78, fat: 0.6 }, ...over });
const log = (userId: string, date: string, items: { name: string; quantity: number; unit: string }[]) => api('POST', `/days/${date}/items`, { userId, body: { items } });

describe('raw or as eaten (migration 0004)', () => {
  it('is stored, read back and changed, and saying it counts as a review', async () => {
    const made = await create(dryRice({ form: 'raw', source: 'label' }));
    expect(made.status).toBe(201);
    expect(made.body.food).toMatchObject({ form: 'raw', source: 'label' });
    await env.DB.prepare('UPDATE foods SET reviewed_at = ? WHERE id = ?').bind('2020-01-01T00:00:00.000Z', made.body.food.id).run();
    const edit = await api('PUT', `/foods/${made.body.food.id}`, { body: { form: 'as_eaten' } });
    expect(edit.status).toBe(200);
    expect(edit.body.food.form).toBe('as_eaten');
    expect(edit.body.food.reviewedAt).not.toBe('2020-01-01T00:00:00.000Z');
    expect((await api('PUT', `/foods/${made.body.food.id}`, { body: { form: null } })).body.food.form).toBeNull();
    // A food made without saying stays unknown.
    expect((await create(dryRice())).body.food.form).toBeNull();
  });

  it('accepts only the two forms, and the database refuses any other', async () => {
    expect((await create(dryRice({ form: 'cooked-ish' }))).status).toBe(400);
    const made = (await create(dryRice())).body.food;
    expect((await api('PUT', `/foods/${made.id}`, { body: { form: 'boiled' } })).status).toBe(400);
    await expect(env.DB.prepare('UPDATE foods SET form = ? WHERE id = ?').bind('fried', made.id).run()).rejects.toThrow(/constraint/i);
  });

  it('asks whether a katori of raw rice is really the raw amount, wherever that can happen, and never refuses', async () => {
    const withKatori = await create(dryRice({ form: 'raw', units: [{ unit: 'katori', servings: 1.5 }] }));
    expect(withKatori.status).toBe(201);
    expect(withKatori.body.warnings).toEqual([{ id: 'raw_serving_unit', severity: 'warning', params: { unit: 'katori' } }]);

    const plain = (await create(dryRice())).body.food;
    expect((await api('PUT', `/foods/${plain.id}/units/bowl`, { body: { servings: 2 } })).body.warnings).toEqual([]);
    // Said to be raw afterwards: the stored bowl is asked about, a spoon is not.
    await api('PUT', `/foods/${plain.id}/units/tbsp`, { body: { servings: 0.15 } });
    const nowRaw = await api('PUT', `/foods/${plain.id}`, { body: { form: 'raw' } });
    expect(nowRaw.body.warnings).toEqual([{ id: 'raw_serving_unit', severity: 'warning', params: { unit: 'bowl' } }]);
    // A new plate conversion on a raw food is asked about when it is added.
    expect((await api('PUT', `/foods/${plain.id}/units/plate`, { body: { servings: 3 } })).body.warnings.map((w: any) => w.id)).toEqual(['raw_serving_unit']);
    // The editor's dry run asks too.
    const dry = await api('POST', '/foods/check', { body: { baseUnit: 'katori', nutrients: { calories: 300 }, form: 'raw' } });
    expect(dry.body.warnings.map((w: any) => w.id)).toEqual(['raw_serving_unit']);
  });

  it('does not run the number rules on a form-only edit, so an old food with odd numbers can still be labelled', async () => {
    const made = (await create(dryRice())).body.food;
    await env.DB.prepare('UPDATE foods SET sugar_g = 200 WHERE id = ?').bind(made.id).run(); // impossible, saved before the checks existed
    const res = await api('PUT', `/foods/${made.id}`, { body: { form: 'as_eaten' } });
    expect(res.status).toBe(200);
  });
});

describe('a logged amount, in grams and worth a check', () => {
  it('says what a katori of a per-100 g food weighs, and flags an amount a call probably misheard', async () => {
    const { userId } = await createProfileWithSecret();
    const rice = (await create({ displayName: unique('cooked rice'), baseUnit: '100 g', nutrients: { calories: 130 }, units: [{ unit: 'katori', servings: 1.5 }], form: 'as_eaten' })).body.food;
    const saved = await log(userId, DATES[0]!, [
      { name: rice.displayName, quantity: 2, unit: 'katori' },
      { name: rice.displayName, quantity: 20, unit: 'katori' },
      { name: unique('unknown sweet'), quantity: 15, unit: 'katori' },
    ]);
    expect(saved.status).toBe(201);
    expect(saved.body.items.map((i: any) => [i.weight, i.amountCheck])).toEqual([
      [{ value: 300, unit: 'g' }, null],
      [{ value: 3000, unit: 'g' }, 'large_energy'], // 3,900 kcal
      [null, 'many_servings'], // still pending: the count is what can tell
    ]);
    // Items saved together come back in id order, so match them by amount.
    const day = await api('GET', `/days/${DATES[0]}`, { userId });
    const byQuantity = Object.fromEntries(day.body.items.map((i: any) => [i.quantity, i.amountCheck]));
    expect(byQuantity).toEqual({ 2: null, 20: 'large_energy', 15: 'many_servings' });
  });
});

describe('whether a day counts, on the day itself (plan 7.2)', () => {
  const meal = async (kcal: number) => (await create({ displayName: unique('meal'), baseUnit: 'plate', nutrients: { calories: kcal } })).body.food.displayName as string;
  const stateOf = async (userId: string, date: string, secret?: string) => (await api('GET', `/days/${date}`, { userId, secret })).body.dayState;

  it('reads a past day as the report would: not logged, looks incomplete (and why), logged, or marked', withDayCompletion(async () => {
    const { userId } = await createProfileWithSecret();
    const small = await meal(300);
    const full = await meal(1800);
    expect(await stateOf(userId, DATES[0]!)).toEqual({ state: 'empty', reason: null });
    await log(userId, DATES[1]!, [{ name: small, quantity: 1, unit: 'plate' }]);
    expect(await stateOf(userId, DATES[1]!)).toEqual({ state: 'partial', reason: 'low' });
    await log(userId, DATES[2]!, [{ name: full, quantity: 1, unit: 'plate' }, { name: unique('mystery'), quantity: 1, unit: 'plate' }, { name: unique('mystery'), quantity: 1, unit: 'plate' }]);
    expect(await stateOf(userId, DATES[2]!)).toEqual({ state: 'partial', reason: 'pending' });
    await log(userId, DATES[3]!, [{ name: full, quantity: 1, unit: 'plate' }]);
    expect(await stateOf(userId, DATES[3]!)).toEqual({ state: 'valid', reason: null });
    // "It is complete": a small day counts once the person says so.
    await api('PUT', `/days/${DATES[1]}/status`, { userId, body: { status: 'complete' } });
    expect(await stateOf(userId, DATES[1]!)).toEqual({ state: 'confirmed', reason: null });
    await api('PUT', `/days/${DATES[3]}/status`, { userId, body: { status: 'skip' } });
    expect(await stateOf(userId, DATES[3]!)).toEqual({ state: 'skipped', reason: null });
    expect((await stateOf(userId, TODAY)).state).toBe('in_progress');
  }));

  it('uses the personal energy target only with the secret, as the report does', async () => {
    const p = await createProfileWithSecret();
    expect((await api('PUT', '/me/profile', { userId: p.userId, secret: p.secret, body: { profile: ASHA, safety: SAFE, consentVersion: '2026-10-v1' } })).status).toBe(200);
    await log(p.userId, DATES[4]!, [{ name: await meal(1200), quantity: 1, unit: 'plate' }]);
    // 1,200 kcal is under 60% of Asha's 2,150: it looks incomplete to her. Without the secret only the 500 kcal floor applies.
    expect(await stateOf(p.userId, DATES[4]!, p.secret)).toEqual({ state: 'partial', reason: 'low' });
    expect(await stateOf(p.userId, DATES[4]!)).toEqual({ state: 'valid', reason: null });
    const report = await api('GET', `/reports/weekly?start=${WEEK}`, { userId: p.userId, secret: p.secret });
    expect(report.body.coverage.days[4].state).toBe('partial');
  });
});

describe('care-team numbers stay behind the secret (security review)', () => {
  it('are neither shown, counted nor changed without it', async () => {
    const p = await createProfileWithSecret();
    await api('PUT', '/me/profile', { userId: p.userId, secret: p.secret, body: { profile: ASHA, safety: { ...SAFE, clinicianDiet: true }, consentVersion: '2026-10-v1' } });
    expect((await api('PUT', '/me/goals', { userId: p.userId, secret: p.secret, body: { goals: { calories: 1800, potassium: 2000 }, origin: 'care_team' } })).status).toBe(200);

    const locked = await api('GET', '/me/goals', { userId: p.userId });
    expect(locked.body.goals.filter((g: any) => g.origin === 'care_team')).toEqual([]);
    expect(locked.body.goals.find((g: any) => g.key === 'calories')).toMatchObject({ target: 2000, custom: false });
    expect(JSON.stringify(locked.body)).not.toContain('care_team');
    const day = await api('GET', `/days/${DATES[0]}`, { userId: p.userId });
    expect([day.body.goals.calories, day.body.customGoals]).toEqual([2000, []]);
    // Writing needs the secret now that the profile has one; nothing changed.
    expect((await api('PUT', '/me/goals', { userId: p.userId, body: { goals: { potassium: 4700, calories: null } } })).status).toBe(403);

    const unlocked = await api('GET', '/me/goals', { userId: p.userId, secret: p.secret });
    expect(unlocked.body.goals.find((g: any) => g.key === 'calories')).toMatchObject({ target: 1800, origin: 'care_team' });
    expect(unlocked.body.goals.find((g: any) => g.key === 'potassium')).toMatchObject({ target: 2000, origin: 'care_team' });
  });
});

describe('what a report says is missing, and the score a deployment leaves out', () => {
  it('carries the quality summary: amounts to check, foods with gaps and where the numbers come from', async () => {
    const p = await createProfileWithSecret();
    const labelled = (await create({ displayName: unique('thali'), baseUnit: 'plate', nutrients: { calories: 1800, protein: 60 }, source: 'label' })).body.food;
    for (const d of DATES) await log(p.userId, d, [{ name: labelled.displayName, quantity: 1, unit: 'plate' }]);
    await log(p.userId, DATES[2]!, [{ name: labelled.displayName, quantity: 9, unit: 'plate' }]);
    const r = (await api('GET', `/reports/weekly?start=${WEEK}`, { userId: p.userId, secret: p.secret })).body;
    expect(r.quality.amountsToCheck).toEqual([{ date: DATES[2], name: labelled.displayName, quantity: 9, unit: 'plate', kcal: 16200, reason: 'large_energy' }]);
    expect(r.quality.valueSources.label).toBe(1);
    expect(r.quality.foodsWithGaps).toMatchObject({ count: 1, energyShare: 1, names: [labelled.displayName] });
    expect(r.insights.map((i: any) => i.id)).toContain('check_amounts');
  });

  it('leaves the score out unless NUTRIENT_SCORE is "1", which a deployment does not set', async () => {
    expect(/"NUTRIENT_SCORE":\s*""/.test(wranglerConfig)).toBe(true);
    const p = await createProfileWithSecret();
    await api('PUT', '/me/profile', { userId: p.userId, secret: p.secret, body: { profile: ASHA, safety: SAFE, consentVersion: '2026-10-v1' } });
    const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(p.userId).first<any>();
    const url = new URL(`https://zero.example/reports/weekly?start=${WEEK}`);
    const read = async (flag: string) => {
      const req = new Request(url, { headers: { 'x-profile-secret': p.secret } });
      return (await weeklyReportResponse({ req, env: { ...env, NUTRIENT_SCORE: flag } as unknown as Env, url, params: {}, user, unlocked: true })).json<any>();
    };
    expect((await read('')).score).toMatchObject({ value: null, withheld: 'off', components: [] });
    expect((await read('1')).score.withheld).not.toBe('off');
  });
});
