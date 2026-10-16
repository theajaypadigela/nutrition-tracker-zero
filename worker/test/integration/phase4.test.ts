/**
 * Phase 4 end to end (WEEKLY_BREAKDOWN_PLAN.md 7.2, 7.4, 9.1, 9.3): day marks, the food checks on save, where a food's numbers came
 * from, the four new nutrients, the "foods with gaps" worklist, and the moderation switch of the score.
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { addDays, localDateIn, weekStartOf } from '../../src/domain/time';
import { weeklyReportResponse } from '../../src/routes/reports';
import { api, createProfileWithSecret, unique } from '../helpers';
import { withDayCompletion } from '../features';

const TODAY = localDateIn('Asia/Kolkata');
const WEEK = addDays(weekStartOf(TODAY), -7);
const DATES = Array.from({ length: 7 }, (_, i) => addDays(WEEK, i));

const IDLI = { calories: 50, protein: 2, carbs: 10, fat: 0.2 };
const food = (over: Record<string, unknown> = {}) => ({ displayName: unique('food'), baseUnit: 'piece', nutrients: IDLI, ...over });
const create = (body: Record<string, unknown>) => api('POST', '/foods', { body });

describe('the checks on a food (plan 7.4)', () => {
  it('refuses values that cannot all be true, names why, and stores nothing', async () => {
    const name = unique('impossible');
    const res = await create({ displayName: name, baseUnit: 'piece', nutrients: { calories: 80, carbs: 10, sugar: 14, saturatedFat: 5, fat: 2 } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'invalid_nutrients', issues: [{ id: 'sugar_over_carbs' }, { id: 'sat_fat_over_fat' }] });
    expect(res.body.error.message).toMatch(/cannot all be true: sugar_over_carbs, sat_fat_over_fat/);
    const list = await api('GET', `/foods?q=${encodeURIComponent(name.toLowerCase())}`);
    expect(list.body.foods).toEqual([]);
  });

  it('saves a probable typo and says so: ten times the calories comes back as a warning (the Phase 4 exit criterion)', async () => {
    const res = await create(food({ nutrients: { ...IDLI, calories: 500 } }));
    expect(res.status).toBe(201);
    expect(res.body.warnings).toEqual([{ id: 'calories_vs_macros', severity: 'warning', nutrient: 'calories', params: { calories: 500, expected: 50 } }]);
    expect(res.body.food.nutrients.calories).toBe(500);
    expect((await create(food())).body.warnings).toEqual([]);
  });

  it('answers the editor\'s dry run with the same checks and writes nothing', async () => {
    const before = (await api('GET', '/foods')).body.foods.length;
    const dry = await api('POST', '/foods/check', { body: { baseUnit: '100 g', nutrients: { calories: 950, carbs: 10, sugar: 20 }, units: [{ unit: 'piece', servings: 40 }] } });
    expect(dry.status).toBe(200);
    expect(dry.body.errors.map((e: any) => e.id)).toEqual(['sugar_over_carbs', 'calories_over_900']);
    expect(dry.body.warnings.map((w: any) => w.id)).toEqual(['unit_weight_implausible']);
    expect((await api('GET', '/foods')).body.foods.length).toBe(before);
    // calories may be missing while someone is still typing
    expect((await api('POST', '/foods/check', { body: { baseUnit: 'piece', nutrients: { protein: 3 } } })).body).toEqual({ errors: [], warnings: [] });
    expect((await api('POST', '/foods/check', { body: { baseUnit: 'nope', nutrients: {} } })).status).toBe(400);
  });

  it('checks the whole food on an edit, not the patch', async () => {
    const created = (await create(food())).body.food;
    // the patch alone (protein 40) says nothing wrong; with the stored carbohydrate and fat, 50 kcal is far under 4P + 4C + 9F
    const edit = await api('PUT', `/foods/${created.id}`, { body: { nutrients: { protein: 40 } } });
    expect(edit.status).toBe(200);
    expect(edit.body.warnings.map((w: any) => w.id)).toEqual(['calories_vs_macros']);
    // fixing the calories clears it
    expect((await api('PUT', `/foods/${created.id}`, { body: { nutrients: { calories: 212 } } })).body.warnings).toEqual([]);
    // an impossible edit is refused and the food is unchanged
    const bad = await api('PUT', `/foods/${created.id}`, { body: { nutrients: { sugar: 50 } } });
    expect(bad.status).toBe(400);
    expect(bad.body.error.issues[0].id).toBe('sugar_over_carbs');
    expect((await api('GET', `/foods/${created.id}`)).body.food.nutrients.sugar).toBeNull();
    // an edit that touches no numbers is not checked
    expect((await api('PUT', `/foods/${created.id}`, { body: { displayName: unique('renamed') } })).body.warnings).toEqual([]);
  });

  it('warns about a unit that puts a piece at an implausible weight', async () => {
    const created = (await create(food({ baseUnit: '100 g', nutrients: { calories: 200, protein: 5, carbs: 30, fat: 7 } }))).body.food;
    const res = await api('PUT', `/foods/${created.id}/units/piece`, { body: { servings: 40 } });
    expect(res.status).toBe(200);
    expect(res.body.warnings).toEqual([{ id: 'unit_weight_implausible', severity: 'warning', params: { unit: 'piece', amount: 4000, base: '100 g' } }]);
    expect((await api('PUT', `/foods/${created.id}/units/bowl`, { body: { servings: 1.5 } })).body.warnings).toEqual([]);
  });
});

describe('where a food\'s numbers came from (migration 0003)', () => {
  it('records the source and when it was reviewed, on create and on every edit of numbers or source', async () => {
    const made = (await create(food({ source: 'label' }))).body.food;
    expect(made.source).toBe('label');
    expect(made.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const none = (await create(food())).body.food;
    expect(none.source).toBeNull();
    expect(none.reviewedAt).toMatch(/^\d{4}-/); // saving numbers is a review

    await env.DB.prepare('UPDATE foods SET reviewed_at = ? WHERE id = ?').bind('2020-01-01T00:00:00.000Z', made.id).run();
    const renamed = (await api('PUT', `/foods/${made.id}`, { body: { displayName: unique('renamed') } })).body.food;
    expect(renamed.reviewedAt).toBe('2020-01-01T00:00:00.000Z'); // no numbers, no source: not reviewed
    const resourced = (await api('PUT', `/foods/${made.id}`, { body: { source: 'recipe' } })).body.food;
    expect(resourced.source).toBe('recipe');
    expect(resourced.reviewedAt > '2020-01-01T00:00:00.000Z').toBe(true);
    expect((await api('PUT', `/foods/${made.id}`, { body: { source: null } })).body.food.source).toBeNull();
  });

  it('accepts only the four sources', async () => {
    for (const source of ['database', 'estimate']) expect((await create(food({ source }))).status).toBe(201);
    expect((await create(food({ source: 'rumour' }))).status).toBe(400);
    expect((await api('PUT', `/foods/${(await create(food())).body.food.id}`, { body: { source: 'guess' } })).status).toBe(400);
  });

  it('the database refuses a source of its own making', async () => {
    const made = (await create(food())).body.food;
    await expect(env.DB.prepare('UPDATE foods SET source = ? WHERE id = ?').bind('rumour', made.id).run()).rejects.toThrow(/constraint/i);
  });
});

describe('the four new nutrients', () => {
  it('are saved on a food, read back, and added up in the day with the rest', async () => {
    const { userId } = await createProfileWithSecret();
    const made = await create({
      displayName: unique('fortified cereal'),
      baseUnit: 'katori',
      nutrients: { calories: 180, protein: 5, carbs: 34, fat: 3, saturatedFat: 1.2, sugar: 12, addedSugar: 9, vitaminB12: 1.2, folate: 150 },
    });
    expect(made.status).toBe(201);
    expect(made.body.food.nutrients).toMatchObject({ saturatedFat: 1.2, addedSugar: 9, vitaminB12: 1.2, folate: 150 });
    const date = addDays(TODAY, -1);
    await api('POST', `/days/${date}/items`, { userId, body: { items: [{ name: made.body.food.displayName, quantity: 2, unit: 'katori' }] } });
    const day = await api('GET', `/days/${date}`, { userId });
    expect(day.body.totals).toMatchObject({ saturatedFat: { value: 2.4, missingItems: 0 }, addedSugar: { value: 18, missingItems: 0 }, vitaminB12: { value: 2.4 }, folate: { value: 300 } });
  });

  it('keep null for unknown and 0 for a known zero', async () => {
    const made = (await create(food({ nutrients: { ...IDLI, addedSugar: 0 } }))).body.food;
    expect(made.nutrients).toMatchObject({ addedSugar: 0, saturatedFat: null, folate: null });
  });

  it('are in the catalogue /meta serves, with their kind, window and group', async () => {
    const meta = (await api('GET', '/meta')).body.nutrients as any[];
    const by = Object.fromEntries(meta.map((n) => [n.key, n]));
    expect(by.saturatedFat).toMatchObject({ label: 'Saturated fat', unit: 'g', kind: 'limit', window: 'week', group: 'keep_in_check', defaultGoal: 22 });
    expect(by.addedSugar).toMatchObject({ label: 'Added sugars', kind: 'limit', defaultGoal: 50 });
    expect(by.vitaminB12).toMatchObject({ unit: 'mcg', kind: 'minimum', window: 'four_weeks', group: 'vitamins_and_minerals', defaultGoal: 2.4 });
    expect(by.folate).toMatchObject({ unit: 'mcg DFE', window: 'four_weeks', defaultGoal: 400 });
  });
});

describe('foods with gaps', () => {
  it('ranks what a person ate in the last four weeks by its share of their energy, and says what each lacks', async () => {
    const { userId } = await createProfileWithSecret();
    const rice = (await create(food({ displayName: unique('rice'), baseUnit: 'katori', nutrients: { calories: 200, protein: 4, carbs: 44, sodium: 3 } }))).body.food;
    const dal = (await create(food({ displayName: unique('dal'), baseUnit: 'katori', nutrients: { calories: 120, protein: 7, carbs: 20, fat: 1 }, source: 'estimate' }))).body.food;
    const complete = (
      await create(food({ displayName: unique('curd'), baseUnit: 'katori', nutrients: { calories: 90, protein: 5, carbs: 7, fat: 4, fiber: 0, sodium: 50, potassium: 150, calcium: 120, iron: 0.1, magnesium: 12, zinc: 0.5, saturatedFat: 2.5, addedSugar: 0 } }))
    ).body.food;
    const log = (date: string, f: any, quantity: number) => api('POST', `/days/${date}/items`, { userId, body: { items: [{ name: f.displayName, quantity, unit: 'katori' }] } });
    await log(addDays(TODAY, -2), rice, 3); // 600 kcal
    await log(addDays(TODAY, -3), dal, 2); // 240 kcal
    await log(addDays(TODAY, -4), complete, 2); // 180 kcal, nothing missing
    await log(addDays(TODAY, -40), rice, 9); // outside the window
    const res = await api('GET', '/foods/gaps', { userId });
    expect(res.status).toBe(200);
    expect(res.body.foods.map((f: any) => f.foodId)).toEqual([rice.id, dal.id]);
    expect(res.body.foods[0]).toMatchObject({ name: rice.displayName, items: 1, source: null });
    expect(res.body.foods[0].share).toBeCloseTo(600 / 1020, 6);
    expect(res.body.foods[0].missing).toContain('fiber');
    expect(res.body.foods[0].missing).not.toContain('sodium');
    expect(res.body.foods[1]).toMatchObject({ source: 'estimate' });
    expect(res.body).toMatchObject({ loggedFoods: 3, completeFoods: 1, from: addDays(TODAY, -27), to: TODAY });
    expect(res.body.completeShare).toBeCloseTo(180 / 1020, 6);
  });

  it('is for one person\'s own log, and needs a profile', async () => {
    const other = await createProfileWithSecret();
    expect((await api('GET', '/foods/gaps', { userId: other.userId })).body).toMatchObject({ foods: [], loggedFoods: 0, completeFoods: 0, completeShare: 0 });
    expect((await api('GET', '/foods/gaps')).status).toBe(400);
    expect((await api('GET', '/foods/gaps', { token: null })).status).toBe(401);
  });

  it('is not mistaken for a food called "gaps"', async () => {
    expect((await api('GET', '/foods/gaps', { userId: (await createProfileWithSecret()).userId })).body).toHaveProperty('foods');
    expect((await api('GET', '/foods/not-a-food')).status).toBe(404);
  });
});

describe('marking a day (plan 7.2)', () => {
  it('sets, reads back, changes and clears a mark, in the day and in the range', withDayCompletion(async () => {
    const { userId } = await createProfileWithSecret();
    const date = DATES[2]!;
    expect((await api('GET', `/days/${date}`, { userId })).body.status).toBeNull();
    expect((await api('PUT', `/days/${date}/status`, { userId, body: { status: 'skip' } })).body).toEqual({ date, status: 'skip' });
    expect((await api('GET', `/days/${date}`, { userId })).body.status).toBe('skip');
    const range = (await api('GET', `/days?from=${DATES[0]}&to=${DATES[6]}`, { userId })).body.days;
    expect(range.map((d: any) => d.status)).toEqual([null, null, 'skip', null, null, null, null]);
    expect((await api('PUT', `/days/${date}/status`, { userId, body: { status: 'complete' } })).body.status).toBe('complete');
    expect((await api('GET', `/days/${date}`, { userId })).body.status).toBe('complete');
    expect((await api('DELETE', `/days/${date}/status`, { userId })).status).toBe(204);
    expect((await api('GET', `/days/${date}`, { userId })).body.status).toBeNull();
    expect((await api('DELETE', `/days/${date}/status`, { userId })).status).toBe(204); // clearing nothing is fine
  }));

  it('marks today, refuses tomorrow and nonsense, and keeps one person\'s marks from another', withDayCompletion(async () => {
    const a = await createProfileWithSecret();
    const b = await createProfileWithSecret();
    expect((await api('PUT', `/days/${TODAY}/status`, { userId: a.userId, body: { status: 'partial' } })).status).toBe(200);
    expect((await api('PUT', `/days/${addDays(TODAY, 1)}/status`, { userId: a.userId, body: { status: 'skip' } })).status).toBe(400);
    expect((await api('PUT', `/days/${TODAY}/status`, { userId: a.userId, body: { status: 'busy' } })).status).toBe(400);
    expect((await api('PUT', `/days/${TODAY}/status`, { userId: a.userId, body: {} })).status).toBe(400);
    expect((await api('PUT', `/days/nope/status`, { userId: a.userId, body: { status: 'skip' } })).status).toBe(400);
    expect((await api('PUT', `/days/${TODAY}/status`, { body: { status: 'skip' } })).status).toBe(400); // no profile
    expect((await api('GET', `/days/${TODAY}`, { userId: b.userId })).body.status).toBeNull();
  }));

  it('changes what the weekly report counts: a day left out is not there, a day marked complete is a day', withDayCompletion(async () => {
    const { userId, secret } = await createProfileWithSecret();
    const ok = (await create(food({ displayName: unique('meal'), baseUnit: 'plate', nutrients: { calories: 1800, protein: 70, carbs: 230, fat: 55 } }))).body.food;
    for (const d of DATES) await api('POST', `/days/${d}/items`, { userId, body: { items: [{ name: ok.displayName, quantity: 1, unit: 'plate' }] } });
    await api('PUT', `/days/${DATES[1]}/status`, { userId, body: { status: 'skip' } });
    await api('PUT', `/days/${DATES[4]}/status`, { userId, body: { status: 'partial' } });
    const r = (await api('GET', `/reports/weekly?start=${WEEK}`, { userId, secret })).body;
    expect(r.coverage.days.map((d: any) => d.state)).toEqual(['valid', 'skipped', 'valid', 'valid', 'partial', 'valid', 'valid']);
    expect(r.coverage.assessedDays).toBe(5);
    // an empty day marked complete counts, as a day with nothing eaten (a fast)
    const quiet = await createProfileWithSecret();
    await api('PUT', `/days/${DATES[0]}/status`, { userId: quiet.userId, body: { status: 'complete' } });
    expect((await api('GET', `/reports/weekly?start=${WEEK}`, { userId: quiet.userId, secret: quiet.secret })).body.coverage.days[0].state).toBe('confirmed');
  }));

  it('is erased with the rest of the health data, and not before', withDayCompletion(async () => {
    const p = await createProfileWithSecret();
    await api('PUT', `/days/${DATES[0]}/status`, { userId: p.userId, body: { status: 'skip' } });
    const count = () => env.DB.prepare('SELECT COUNT(*) AS n FROM day_status WHERE user_id = ?').bind(p.userId).first<{ n: number }>().then((r) => r!.n);
    expect(await count()).toBe(1);
    await api('PUT', '/me/profile', {
      userId: p.userId,
      secret: p.secret,
      body: { profile: { birthYear: 1996, birthMonth: 3, sexForCalc: 'female', heightCm: 160, weightKg: 60, activity: 'low_active', goal: 'general_health', pace: 'standard', pattern: 'omnivore', referenceSet: 'nasem' }, safety: {}, consentVersion: '2026-10-v1' },
    });
    expect((await api('DELETE', '/me/health-data', { userId: p.userId, secret: p.secret })).status).toBe(204);
    expect(await count()).toBe(0);
  }));
});

describe('typing a limit for saturated fat or added sugars (plan 6.4)', () => {
  it('accepts any positive number as the person\'s own limit, with a note above the recommended 10% of energy', async () => {
    const p = await createProfileWithSecret();
    await api('PUT', '/me/profile', {
      userId: p.userId,
      secret: p.secret,
      body: { profile: { birthYear: 1996, birthMonth: 3, sexForCalc: 'female', heightCm: 160, weightKg: 60, activity: 'low_active', goal: 'general_health', pace: 'standard', pattern: 'omnivore', referenceSet: 'nasem' }, safety: {}, consentVersion: '2026-10-v1' },
    });
    const goals = (await api('GET', '/me/goals', { userId: p.userId, secret: p.secret })).body.goals as any[];
    expect(goals.find((g) => g.key === 'saturatedFat')).toMatchObject({ target: 24, origin: 'recommended', kind: 'limit' });
    expect(goals.find((g) => g.key === 'addedSugar')).toMatchObject({ target: 54, origin: 'recommended' });
    const lower = await api('PUT', '/me/goals', { userId: p.userId, secret: p.secret, body: { goals: { saturatedFat: 15, addedSugar: 25 } } });
    expect(lower.status).toBe(200);
    expect(lower.body.goals.find((g: any) => g.key === 'addedSugar')).toMatchObject({ target: 25, origin: 'custom', recommended: 54 });
    expect(lower.body.notes ?? []).toEqual([]);
    const higher = await api('PUT', '/me/goals', { userId: p.userId, secret: p.secret, body: { goals: { saturatedFat: 40 } } });
    expect(higher.status).toBe(200);
    expect(higher.body.notes).toEqual([{ nutrient: 'saturatedFat', note: 'That is more than 10% of your energy target, the limit WHO recommends.' }]);
    expect((await api('PUT', '/me/goals', { userId: p.userId, secret: p.secret, body: { goals: { addedSugar: -3 } } })).status).toBe(400);
  });
});

describe('the moderation components of the score (plan 5.5, Phase 4)', () => {
  async function seededWeek(extra: Record<string, number | null>) {
    const p = await createProfileWithSecret();
    const res = await api('PUT', '/me/profile', {
      userId: p.userId,
      secret: p.secret,
      body: { profile: { birthYear: 1996, birthMonth: 3, sexForCalc: 'female', heightCm: 160, weightKg: 60, activity: 'low_active', goal: 'general_health', pace: 'standard', pattern: 'omnivore', referenceSet: 'nasem' }, safety: {}, consentVersion: '2026-10-v1' },
    });
    expect(res.status).toBe(200);
    const meal = (
      await create({
        displayName: unique('meal'),
        baseUnit: 'plate',
        nutrients: { calories: 2000, protein: 70, carbs: 270, fat: 70, fiber: 30, sodium: 1500, potassium: 2800, calcium: 1100, iron: 18, magnesium: 330, zinc: 9, ...extra },
      })
    ).body.food;
    for (const d of DATES) await api('POST', `/days/${d}/items`, { userId: p.userId, body: { items: [{ name: meal.displayName, quantity: 1, unit: 'plate' }] } });
    return p;
  }
  const report = async (p: { userId: string; secret: string }, moderation: string) => {
    const url = new URL(`https://zero.example/reports/weekly?start=${WEEK}`);
    const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(p.userId).first<any>();
    const res = await weeklyReportResponse({ req: new Request(url, { headers: { 'x-profile-secret': p.secret } }), env: { ...env, SCORE_MODERATION: moderation } as unknown as Env, url, params: {}, user, unlocked: true });
    return (await res.json()) as any;
  };

  it('are off by default: a score out of 55, with no such parts', async () => {
    const p = await seededWeek({ saturatedFat: 12, addedSugar: 20 });
    const r = await report(p, '');
    expect(r.score).toMatchObject({ outOf: 55 });
    expect(r.score.components.map((c: any) => c.id)).not.toContain('saturated_fat');
    // the two nutrients are still on the rows, with their limits and amounts
    const sat = r.nutrients.find((n: any) => n.nutrient === 'saturatedFat');
    expect(sat).toMatchObject({ meanPerAssessedDay: 12, assessment: 'meets', target: { kind: 'limit', value: 24 } });
    expect(r.nutrients.find((n: any) => n.nutrient === 'addedSugar')).toMatchObject({ meanPerAssessedDay: 20, assessment: 'meets', target: { value: 54 } });
  });

  it('switch on with SCORE_MODERATION=1: out of 75, and the parts respond to entered values', async () => {
    const good = await report(await seededWeek({ saturatedFat: 12, addedSugar: 20 }), '1');
    expect(good.score).toMatchObject({ outOf: 75, value: 100, isMinimum: false });
    expect(good.score.components.slice(-2).map((c: any) => [c.id, c.points])).toEqual([['saturated_fat', 10], ['added_sugars', 10]]);
    // 2,000 kcal: saturated fat at 24% of energy (53 g) and added sugars at 20% (100 g)
    const heavy = await report(await seededWeek({ saturatedFat: 53, addedSugar: 100 }), '1');
    expect(heavy.score.components.find((c: any) => c.id === 'saturated_fat').points).toBe(0);
    expect(heavy.score.components.find((c: any) => c.id === 'added_sugars').points).toBeCloseTo((10 * (0.26 - 0.2)) / (0.26 - 0.065), 6);
    expect(heavy.score.value).toBeLessThan(good.score.value);
  });

  it('with the values missing: one unknown reads "at least", both unknown withhold the score for thin data', async () => {
    const one = await report(await seededWeek({ saturatedFat: 12 }), '1');
    expect(one.score).toMatchObject({ isMinimum: true, outOf: 75 });
    expect(one.score.components.find((c: any) => c.id === 'added_sugars')).toMatchObject({ scorable: false, points: 0 });
    const none = await report(await seededWeek({}), '1');
    expect(none.score).toMatchObject({ value: null, withheld: 'thin_data' });
    // data coverage follows the entered values
    expect(none.nutrients.find((n: any) => n.nutrient === 'saturatedFat')).toMatchObject({ dataCoverage: 0, meanPerAssessedDay: null, assessment: 'unknown' });
  });
});

describe('a part whose whole was left empty (the food form saves an empty field as 0)', () => {
  it('saves a food with fibre and sugars but no carbohydrate, and the dry run agrees', async () => {
    const nutrients = { calories: 100, protein: 2, carbs: 0, fat: 0, saturatedFat: 4, fiber: 3, sugar: 12, addedSugar: 0 };
    const dry = await api('POST', '/foods/check', { body: { baseUnit: 'piece', nutrients } });
    expect(dry.body.errors).toEqual([]);
    const res = await create({ displayName: unique('fibre but no carbs'), baseUnit: 'piece', nutrients });
    expect(res.status).toBe(201);
    expect(res.body.food.nutrients).toMatchObject({ carbs: 0, fiber: 3, sugar: 12, fat: 0, saturatedFat: 4 });
  });

  it('still refuses a part over a whole that was filled in', async () => {
    const res = await create({ displayName: unique('too much fibre'), baseUnit: 'piece', nutrients: { calories: 100, carbs: 10, fiber: 12 } });
    expect(res.status).toBe(400);
    expect(res.body.error.issues[0].id).toBe('fibre_over_carbs');
  });
});
