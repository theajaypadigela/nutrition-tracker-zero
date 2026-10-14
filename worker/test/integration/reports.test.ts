/**
 * `GET /reports/weekly` end to end (WEEKLY_BREAKDOWN_PLAN.md 9.3, 11.5, 11.8, 11.9): real foods, real items, the
 * stored target sets and day marks, the access rules, and the cost.
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { addDays, localDateIn, weekStartOf } from '../../src/domain/time';
import { weeklyReportResponse } from '../../src/routes/reports';
import { api, createProfileWithSecret, unique } from '../helpers';

const SAFE = { pregnantOrBreastfeeding: false, eatingDisorder: false, clinicianDiet: false, dietInteractingMedicine: false };
const ASHA = { birthYear: 1996, birthMonth: 3, sexForCalc: 'female', heightCm: 160, weightKg: 60, activity: 'low_active', goal: 'general_health', pace: 'standard', pattern: 'omnivore', referenceSet: 'nasem' };

/** The most recent complete week: Monday to Sunday, in the profile's default time zone. */
const TODAY = localDateIn('Asia/Kolkata');
const WEEK = addDays(weekStartOf(TODAY), -7);
const DATES = Array.from({ length: 7 }, (_, i) => addDays(WEEK, i));

/** The plan's ordinary day (Appendix F): four meals, about 1,800 kcal, every nutrient known. */
const MEALS = [
  { kcal: 300, protein: 10, fiber: 4, sodium: 500, calcium: 60, iron: 2.5, potassium: 400, magnesium: 50, zinc: 1.2 },
  { kcal: 650, protein: 24, fiber: 12, sodium: 900, calcium: 250, iron: 5, potassium: 1100, magnesium: 130, zinc: 3.5 },
  { kcal: 150, protein: 3, fiber: 0.5, sodium: 120, calcium: 90, iron: 0.4, potassium: 150, magnesium: 12, zinc: 0.4 },
  { kcal: 700, protein: 22, fiber: 10, sodium: 1000, calcium: 120, iron: 4, potassium: 1100, magnesium: 120, zinc: 3 },
];

/** Fat for the four meals, a little under 17% of their energy, for the tests that judge fat as a share. */
const FAT_G = [5.7, 12.3, 2.8, 13.2];

async function seedFoods(opts: { fat?: boolean } = {}): Promise<{ id: string; name: string }[]> {
  const tag = unique('report');
  const out = [];
  for (const [i, m] of MEALS.entries()) {
    const displayName = `${tag} meal ${i + 1}`;
    const res = await api('POST', '/foods', {
      body: {
        displayName,
        baseUnit: 'serving',
        nutrients: { calories: m.kcal, protein: m.protein, fiber: m.fiber, sodium: m.sodium, calcium: m.calcium, iron: m.iron, potassium: m.potassium, magnesium: m.magnesium, zinc: m.zinc, ...(opts.fat ? { fat: FAT_G[i] } : {}) },
      },
    });
    expect(res.status).toBe(201);
    out.push({ id: res.body.food.id as string, name: displayName });
  }
  return out;
}

async function logDay(userId: string, date: string, names: string[], extra: { name: string; quantity?: number; unit?: string }[] = []) {
  const items = [...names.map((name) => ({ name, quantity: 1, unit: 'serving', meal: 'lunch' })), ...extra.map((e) => ({ name: e.name, quantity: e.quantity ?? 1, unit: e.unit ?? 'serving', meal: 'snack' }))];
  const res = await api('POST', `/days/${date}/items`, { userId, body: { items } });
  expect(res.status).toBe(201);
}

async function onboard(over: Record<string, unknown> = {}, safety: Record<string, unknown> = {}) {
  const p = await createProfileWithSecret();
  const res = await api('PUT', '/me/profile', { userId: p.userId, secret: p.secret, body: { profile: { ...ASHA, ...over }, safety: { ...SAFE, ...safety }, consentVersion: '2026-10-v1' } });
  expect(res.status).toBe(200);
  return p;
}

const report = (userId: string, secret?: string, query = `start=${WEEK}`) => api('GET', `/reports/weekly?${query}`, { userId, secret });
const n = (r: any, nutrient: string) => r.body.nutrients.find((x: any) => x.nutrient === nutrient);

describe('a profile with no health profile: the general reference', () => {
  it('reports a full week against the generic reference, with no energy verdict and no score', async () => {
    const foods = await seedFoods();
    const { userId, secret } = await createProfileWithSecret();
    for (const d of DATES) await logDay(userId, d, foods.map((f) => f.name));
    const res = await report(userId, secret);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ mode: 'generic', week: { start: WEEK, end: addDays(WEEK, 6), isCurrent: false }, display: { numbersHidden: false }, disclaimerId: 'estimates-v1' });
    expect(res.body.coverage).toMatchObject({ assessedDays: 7, confidence: 'good', pendingItems: 0 });
    expect(res.body.energy).toBeNull();
    expect(res.body.score).toMatchObject({ value: null, withheld: 'generic' });
    expect(n(res, 'protein')).toMatchObject({ meanPerAssessedDay: 59, assessment: 'meets', target: { value: 50, origin: 'recommended' } });
    expect(n(res, 'sodium')).toMatchObject({ meanPerAssessedDay: 2520, assessment: 'over', target: { value: 2300, kind: 'limit' } });
    expect(n(res, 'calories').assessment).toBe('amount_only');
    expect(n(res, 'sugar')).toMatchObject({ target: null, assessment: 'amount_only' });
    expect(res.body.history).toHaveLength(8);
  });

  it('judges only the days that count: not today, not a day nobody logged', async () => {
    const foods = await seedFoods();
    const { userId, secret } = await createProfileWithSecret();
    await logDay(userId, DATES[0]!, foods.map((f) => f.name));
    await logDay(userId, DATES[2]!, foods.map((f) => f.name));
    const res = await report(userId, secret);
    expect(res.body.coverage.days.map((d: any) => d.state)).toEqual(['valid', 'empty', 'valid', 'empty', 'empty', 'empty', 'empty']);
    expect(res.body.coverage).toMatchObject({ assessedDays: 2, confidence: 'insufficient' });
    expect(res.body.insights[0]).toMatchObject({ id: 'few_days', params: { n: 2 } });
    // This week, with today in progress.
    await logDay(userId, TODAY, foods.map((f) => f.name));
    const now = await report(userId, secret, '');
    expect(now.body.week).toMatchObject({ start: weekStartOf(TODAY), isCurrent: true });
    expect(now.body.coverage.days.find((d: any) => d.date === TODAY).state).toBe('in_progress');
  });

  it('reads at read time: correcting a food corrects every past week', async () => {
    const foods = await seedFoods();
    const { userId, secret } = await createProfileWithSecret();
    for (const d of DATES) await logDay(userId, d, foods.map((f) => f.name));
    expect(n(await report(userId, secret), 'protein').meanPerAssessedDay).toBe(59);
    const fix = await api('PUT', `/foods/${foods[1]!.id}`, { body: { nutrients: { calories: 650, protein: 124 } } });
    expect(fix.status).toBe(200);
    expect(n(await report(userId, secret), 'protein').meanPerAssessedDay).toBe(159);
  });

  it('counts items still waiting for a food as pending, and keeps them out of every total', async () => {
    const foods = await seedFoods();
    const { userId, secret } = await createProfileWithSecret();
    for (const d of DATES) await logDay(userId, d, foods.map((f) => f.name), [{ name: unique('mystery dish') }]);
    const res = await report(userId, secret);
    expect(res.body.coverage.pendingItems).toBe(7);
    expect(res.body.insights.map((i: any) => i.id)).toContain('pending_items');
    expect(n(res, 'protein').meanPerAssessedDay).toBe(59);
  });

  it('honours a day marked "leave out" and a day marked complete', async () => {
    const foods = await seedFoods();
    const { userId, secret } = await createProfileWithSecret();
    for (const d of DATES) await logDay(userId, d, foods.map((f) => f.name));
    await env.DB.prepare(`INSERT INTO day_status (user_id, local_date, status, updated_at) VALUES (?, ?, 'skip', 't')`).bind(userId, DATES[3]!).run();
    const res = await report(userId, secret);
    expect(res.body.coverage.days[3].state).toBe('skipped');
    expect(res.body.coverage.assessedDays).toBe(6);
  });

  it('names the foods that supply the most of a nutrient', async () => {
    const foods = await seedFoods();
    const { userId, secret } = await createProfileWithSecret();
    for (const d of DATES) await logDay(userId, d, foods.map((f) => f.name));
    const sodium = n(await report(userId, secret), 'sodium');
    expect(sodium.topSources.map((s: any) => s.name)).toEqual([foods[3]!.name, foods[1]!.name, foods[0]!.name]);
    expect(sodium.topSources[0].share).toBeCloseTo(1000 / 2520, 6);
  });

  it('keeps one person\'s items out of another\'s report', async () => {
    const foods = await seedFoods();
    const a = await createProfileWithSecret();
    const b = await createProfileWithSecret();
    for (const d of DATES) await logDay(a.userId, d, foods.map((f) => f.name));
    const res = await report(b.userId, b.secret);
    expect(res.body.coverage.assessedDays).toBe(0);
  });

  it('needs the secret of a profile that has one even without a health profile, so the answer never says whether there is one; a profile from before secrets needs none', async () => {
    const foods = await seedFoods();
    const { userId, secret } = await createProfileWithSecret();
    await logDay(userId, DATES[0]!, foods.map((f) => f.name));
    const none = await report(userId);
    expect([none.status, none.body.error.code]).toEqual([403, 'profile_secret_required']);
    expect((await report(userId, secret)).status).toBe(200);
    await env.DB.prepare('UPDATE users SET secret_hash = NULL WHERE id = ?').bind(userId).run();
    const legacy = await report(userId);
    expect([legacy.status, legacy.body.mode]).toEqual([200, 'generic']);
  });
});

describe('a personalised profile: the engine\'s targets, the score, the history', () => {
  it('reproduces the plan\'s ordinary week: score 90, energy below the target, the three insights of 5.9', async () => {
    const foods = await seedFoods();
    const { userId, secret } = await onboard();
    for (const d of DATES) await logDay(userId, d, foods.map((f) => f.name));
    const res = await report(userId, secret);
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('personalised');
    expect(res.body.targetSet.id).toEqual(expect.any(String));
    expect(res.body.score).toMatchObject({ value: 90, shown: 90, isMinimum: false, outOf: 55 });
    expect(res.body.energy).toEqual({ meanKcal: 1800, target: 2150, low: 1910, high: 2390, daysInBand: 0, assessedDays: 7 });
    expect(res.body.insights.map((i: any) => i.id)).toEqual(['energy_below', 'mineral_gap', 'mineral_gap']);
    expect([n(res, 'protein').assessment, n(res, 'potassium').assessment, n(res, 'fiber').assessment, n(res, 'sodium').assessment]).toEqual(['meets', 'meets', 'close', 'over']);
    expect(n(res, 'calcium')).toMatchObject({ assessment: 'below', target: { value: 1000, upperLevel: 2500 } });
    // The goal's rows, then the two minerals furthest below their reference (plan 5.3).
    expect(res.body.lead).toEqual(['protein', 'fiber', 'potassium', 'sodium', 'calcium', 'iron']);
  });

  it('judges the same week by the Indian set: sodium against 2,000 mg, iron, zinc and potassium against ICMR-NIN\'s numbers', async () => {
    const foods = await seedFoods({ fat: true });
    const { userId, secret } = await onboard({ referenceSet: 'icmr_nin' });
    for (const d of DATES) await logDay(userId, d, foods.map((f) => f.name));
    const res = await report(userId, secret);
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('personalised');
    // Energy is the National Academies' estimate on both sets, and protein is the same 60 g.
    expect(res.body.energy).toEqual({ meanKcal: 1800, target: 2150, low: 1910, high: 2390, daysInBand: 0, assessedDays: 7 });
    // The week eats 2,520 mg sodium, 59 g protein, 26.5 g fibre, 2,750 mg potassium, 520 mg calcium, 11.9 mg iron, 312 mg magnesium and 8.1 mg zinc a day.
    expect(n(res, 'sodium')).toMatchObject({ meanPerAssessedDay: 2520, assessment: 'well_over', target: { value: 2000, basis: 'icmr-nin2020' } }); // 126%: past the 25% that makes it "well over" (the US limit of 2,300 reads "over")
    expect(n(res, 'protein')).toMatchObject({ assessment: 'meets', target: { value: 60 } });
    expect(n(res, 'fiber')).toMatchObject({ assessment: 'close', target: { value: 32 } }); // 83% of 32 g
    expect(n(res, 'potassium')).toMatchObject({ assessment: 'close', target: { value: 3500, refType: 'AI' } }); // 79% of 3,500 mg; 106% of the US 2,600 mg
    expect(n(res, 'iron')).toMatchObject({ assessment: 'close', target: { value: 15, refType: 'EAR' } }); // 79% of the average requirement
    expect(n(res, 'zinc')).toMatchObject({ assessment: 'below', target: { value: 11, refType: 'EAR' } }); // 74%
    expect(n(res, 'magnesium')).toMatchObject({ assessment: 'close', target: { value: 370 } });
    expect(n(res, 'calcium')).toMatchObject({ assessment: 'below', target: { value: 1000 } });
    // The Indian set leads with iron and calcium as well (plan 5.3); the two minerals furthest below their reference then follow, zinc first.
    expect(res.body.lead).toEqual(['protein', 'fiber', 'potassium', 'sodium', 'iron', 'calcium', 'zinc', 'magnesium']);
    // Fat is judged by ICMR's 15% to 35%: this week eats 17% of its energy as fat, which sits inside that range and under the US 20%.
    expect(n(res, 'fat')).toMatchObject({ assessment: 'in_range', daysMeeting: 7, target: { shareRange: { low: 0.15, high: 0.35 } } });
    expect(n(res, 'fat').shareOfEnergy).toBeCloseTo(0.17, 2);
    // The Nutrient mix says which tables its parts were measured against.
    const standards = Object.fromEntries(res.body.score.components.map((c: any) => [c.id, c.standard]));
    expect(standards.iron).toBe('Iron per 1,000 kcal against the Estimated Average Requirement (ICMR-NIN)');
    expect(Object.values(standards).filter((text: any) => /National Academies/.test(text))).toEqual([]);
  });

  it('judges the same fat by the National Academies\' 20% on the US set: outside', async () => {
    const foods = await seedFoods({ fat: true });
    const { userId, secret } = await onboard({ referenceSet: 'nasem' });
    for (const d of DATES) await logDay(userId, d, foods.map((f) => f.name));
    const res = await report(userId, secret);
    expect(n(res, 'fat')).toMatchObject({ assessment: 'outside', daysMeeting: 0, target: { shareRange: { low: 0.2, high: 0.35 } } });
  });

  it('shows the same week, with a typed target on the bar and the score untouched', async () => {
    const foods = await seedFoods();
    const { userId, secret } = await onboard();
    for (const d of DATES) await logDay(userId, d, foods.map((f) => f.name));
    const before = await report(userId, secret);
    await api('PUT', '/me/goals', { userId, secret, body: { goals: { protein: 100 } } });
    const after = await report(userId, secret);
    expect(n(after, 'protein')).toMatchObject({ target: { value: 100, origin: 'custom' }, assessment: 'below' });
    expect(after.body.score.value).toBe(before.body.score.value);
  });

  it('judges each day by the target set in force that day (plan 6.2)', async () => {
    const foods = await seedFoods();
    const { userId, secret } = await onboard();
    for (const d of DATES) await logDay(userId, d, foods.map((f) => f.name));
    // The first set has been in force since before the week; a second one starts on the fourth day, at a lower energy target.
    await env.DB.prepare('UPDATE target_sets SET effective_from = ? WHERE user_id = ?').bind(addDays(WEEK, -30), userId).run();
    const row = await env.DB.prepare('SELECT * FROM target_sets WHERE user_id = ?').bind(userId).first<any>();
    const targets = JSON.parse(row.targets_json);
    targets.energy = { ...targets.energy, target: 1800, maintenance: 1800 };
    targets.targets = targets.targets.map((t: any) => (t.nutrient === 'calories' ? { ...t, value: 1800 } : t));
    await env.DB.prepare(
      `INSERT INTO target_sets (id, user_id, effective_from, engine_version, reference_set, inputs_json, targets_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(crypto.randomUUID(), userId, DATES[3]!, row.engine_version, row.reference_set, row.inputs_json, JSON.stringify(targets), 'later')
      .run();
    const res = await report(userId, secret);
    // The days eaten at 1,800 kcal are in band for the last four days only (the first three had a 2,150 target).
    expect(res.body.energy.daysInBand).toBe(4);
    expect(res.body.energy.target).toBe(Math.round((3 * 2150 + 4 * 1800) / 7));
    expect(res.body.targetSet.effectiveFrom).toBe(DATES[3]);
  });

  it('carries eight weeks of history, a gap where a week has too few days', async () => {
    const foods = await seedFoods();
    const { userId, secret } = await onboard();
    for (const d of DATES) await logDay(userId, d, foods.map((f) => f.name));
    await logDay(userId, addDays(WEEK, -7), foods.map((f) => f.name)); // one day the week before
    const res = await report(userId, secret);
    expect(res.body.history).toHaveLength(8);
    expect(res.body.history[7]).toMatchObject({ weekStart: WEEK, assessedDays: 7, score: 90 });
    expect(res.body.history[6]).toEqual({ weekStart: addDays(WEEK, -7), assessedDays: 1, energyPct: null, proteinPct: null, score: null });
    expect((await report(userId, secret, `start=${WEEK}&weeks=3`)).body.history).toHaveLength(3);
  });

  it('withholds the score and leads with a notice when a week is very low', async () => {
    const foods = await seedFoods();
    const { userId, secret } = await onboard();
    const small = (await api('POST', '/foods', { body: { displayName: unique('crumbs'), baseUnit: 'serving', nutrients: { calories: 350, protein: 8 } } })).body.food;
    for (const d of DATES) await logDay(userId, d, [small.displayName]);
    await env.DB.prepare(`INSERT INTO day_status (user_id, local_date, status, updated_at) SELECT ?, value, 'complete', 't' FROM json_each(?)`).bind(userId, JSON.stringify(DATES)).run();
    const res = await report(userId, secret);
    expect(res.body.score).toMatchObject({ value: null, withheld: 'low_intake' });
    expect(res.body.insights[0].id).toBe('low_intake');
    void foods;
  });
});

describe('who can read it (plan 8.3.2, 11.8)', () => {
  it('a health profile\'s report needs its secret: the shared token alone is refused', async () => {
    const { userId, secret } = await onboard();
    const none = await report(userId);
    expect([none.status, none.body.error.code]).toEqual([403, 'profile_secret_required']);
    const wrong = await report(userId, 'x'.repeat(43));
    expect([wrong.status, wrong.body.error.code]).toEqual([403, 'profile_secret_invalid']);
    expect((await report(userId, secret)).status).toBe(200);
    expect(none.text).not.toMatch(/2150|1910/);
  });

  it('a reference-only profile gets coverage and amounts only, and care-team numbers draw its bars', async () => {
    const foods = await seedFoods();
    const { userId, secret } = await onboard({}, { clinicianDiet: true });
    for (const d of DATES) await logDay(userId, d, foods.map((f) => f.name));
    const plain = await report(userId, secret);
    expect(plain.body).toMatchObject({ mode: 'reference_only', energy: null, score: { value: null, withheld: 'reference_only' } });
    expect(plain.body.nutrients.every((x: any) => x.target === null && x.assessment === 'amount_only')).toBe(true);
    await api('PUT', '/me/goals', { userId, secret, body: { goals: { calories: 1800, protein: 70 }, origin: 'care_team' } });
    const typed = await report(userId, secret);
    expect(typed.body.energy).toMatchObject({ target: 1800, meanKcal: 1800, daysInBand: 7 });
    expect(n(typed, 'protein')).toMatchObject({ target: { value: 70, origin: 'care_team' }, assessment: 'close' });
    expect(typed.body.score.withheld).toBe('reference_only');
  });

  it('low-pressure mode never returns a number the person asked to hide', async () => {
    const foods = await seedFoods();
    const { userId, secret } = await onboard({}, { eatingDisorder: true });
    expect((await api('GET', '/me/profile', { userId, secret })).body.profile).toMatchObject({ mode: 'reference_only', numbersHidden: true });
    for (const d of DATES) await logDay(userId, d, foods.map((f) => f.name));
    const res = await report(userId, secret);
    expect(res.body.display.numbersHidden).toBe(true);
    expect(res.body.energy).toBeNull();
    expect(res.body.nutrients).toEqual([]);
    expect(res.body.score).toMatchObject({ value: null, withheld: 'numbers_hidden' });
    expect(res.body.coverage.days.every((d: any) => d.kcal === null)).toBe(true);
    expect(res.text).not.toMatch(/1800|2520|"kcal":[1-9]/);
  });

  it('shows a medicine-flag profile\'s sodium and potassium as amounts only', async () => {
    const foods = await seedFoods();
    const { userId, secret } = await onboard({}, { dietInteractingMedicine: true });
    for (const d of DATES) await logDay(userId, d, foods.map((f) => f.name));
    const res = await report(userId, secret);
    expect(n(res, 'sodium')).toMatchObject({ assessment: 'amount_only', meanPerAssessedDay: 2520 });
    expect(n(res, 'potassium').assessment).toBe('amount_only');
    expect(n(res, 'protein').assessment).toBe('meets');
    expect(JSON.stringify(res.body.insights)).not.toMatch(/sodium|potassium/);
  });
});

describe('the request', () => {
  it('snaps start to its Monday, defaults to this week and eight weeks, and refuses what makes no sense', async () => {
    const { userId, secret } = await createProfileWithSecret();
    const wednesday = addDays(WEEK, 2);
    expect((await report(userId, secret, `start=${wednesday}`)).body.week.start).toBe(WEEK);
    expect((await api('GET', '/reports/weekly', { userId, secret })).body.week.start).toBe(weekStartOf(TODAY));
    expect((await api('GET', '/reports/weekly', { userId, secret })).body.history).toHaveLength(8);
    for (const q of ['start=nope', 'start=2999-01-01', 'weeks=0', 'weeks=9', 'weeks=2.5', 'weeks=abc']) expect((await report(userId, secret, q)).status, q).toBe(400);
    expect((await api('GET', '/reports/weekly', { token: null })).status).toBe(401);
    expect((await api('GET', '/reports/weekly')).status).toBe(400); // no profile
  });
});

describe('cost (plan 9.2, 11.9)', () => {
  it('reads with ONE batch of nine statements, and nothing else', async () => {
    const { userId, secret } = await onboard();
    let batches = 0;
    let statements = 0;
    let prepares = 0;
    const real = env.DB;
    const counting = new Proxy(real, {
      get(target, prop) {
        const v = (target as any)[prop];
        if (prop === 'batch') return (stmts: unknown[]) => { batches++; statements += stmts.length; return v.call(target, stmts); };
        if (prop === 'prepare') return (sql: string) => { prepares++; return v.call(target, sql); };
        return typeof v === 'function' ? v.bind(target) : v;
      },
    }) as D1Database;
    const user = await real.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<any>();
    const url = new URL(`https://zero.example/reports/weekly?start=${WEEK}`);
    const req = new Request(url, { headers: { 'x-profile-secret': secret } });
    const res = await weeklyReportResponse({ req, env: { ...env, DB: counting } as Env, url, params: {}, user, unlocked: true });
    expect(res.status).toBe(200);
    expect([batches, statements, prepares]).toEqual([1, 9, 9]);
  });
});

describe('the weight line and the plan check (plan 5.7, Phase 5)', () => {
  const weigh = async (p: { userId: string; secret: string }, date: string, weightKg: number) => {
    const res = await api('POST', '/me/weights', { userId: p.userId, secret: p.secret, body: { date, weightKg } });
    expect(res.status).toBe(201);
  };
  const SUNDAY = addDays(WEEK, 6);

  it('carries the weigh-ins with their trend, a rate once there are three weeks of them, and the plan', async () => {
    const foods = await seedFoods();
    const p = await onboard({ heightCm: 165, weightKg: 85, goal: 'lose' });
    for (const d of DATES) await logDay(p.userId, d, foods.map((f) => f.name));
    for (let i = 0; i < 29; i++) await weigh(p, addDays(SUNDAY, -i), Math.round((85 + i * 0.05) * 10) / 10);
    const res = await report(p.userId, p.secret);
    expect(res.status).toBe(200);
    // The weight saved with the profile is today's, which is after that week, so it is not in it.
    expect(res.body.weight).toMatchObject({ latest: { date: SUNDAY, weightKg: 85 }, weighIns: 29 });
    expect(res.body.weight.ratePerWeekKg).toBeLessThan(0);
    expect(res.body.weight.points.length).toBeGreaterThan(20);
    expect(res.body.weight.plan).toMatchObject({ weeks: 4 });
    expect(res.body.insights.map((i: any) => i.id)).toContain('weight_vs_plan');
  });

  it('is the weight as of the week asked for: today\'s weigh-in is not in a week gone by', async () => {
    const p = await onboard(); // saves today's weight with the profile
    const past = await report(p.userId, p.secret);
    expect(past.body.weight).toBeNull(); // no weigh-in on or before that week
    await weigh(p, addDays(WEEK, 2), 61);
    expect((await report(p.userId, p.secret)).body.weight.latest).toEqual({ date: addDays(WEEK, 2), weightKg: 61 });
  });

  it('puts the safety message first when the weight is falling faster than is usual', async () => {
    const p = await onboard({ heightCm: 165, weightKg: 85, goal: 'lose' });
    for (let i = 0; i < 42; i++) await weigh(p, addDays(SUNDAY, -i), Math.round((85 + i * 0.25) * 10) / 10);
    const res = await report(p.userId, p.secret);
    expect(res.body.insights[0]).toEqual({ id: 'rapid_loss', priority: 1, params: {} });
  });

  it('shows no weight in low-pressure mode, and keeps no weigh-in for a profile without personal targets', async () => {
    const hidden = await onboard({}, { eatingDisorder: true });
    expect((await api('POST', '/me/weights', { userId: hidden.userId, secret: hidden.secret, body: { weightKg: 60 } })).status).toBe(409);
    const res = await report(hidden.userId, hidden.secret);
    expect(res.body.weight).toBeNull();
    expect(res.body.calibration).toBeNull();
    expect(res.text).not.toMatch(/weightKg|trendKg/);
  });

  it('does not show the experimental calibration unless the deployment switches it on', async () => {
    const p = await onboard();
    expect((await report(p.userId, p.secret)).body.calibration).toBeNull();
  });
});

describe('recorded intake over an inclusive date range', () => {
  const getRange = (p: { userId: string; secret: string }, from: string, to = from) =>
    api('GET', `/reports/range?from=${from}&to=${to}`, p);

  it('includes every stored nutrient, scales units and quantities, and distinguishes missing values from zero', async () => {
    const p = await createProfileWithSecret();
    const { NUTRIENTS } = await import('../../src/domain/nutrients');
    const nutrients = { ...Object.fromEntries(NUTRIENTS.map((n, i) => [n.key, i])), calories: 600, protein: 0, carbs: 30, fat: 20, saturatedFat: 2, sugar: 4, addedSugar: 1, fiber: 5 } as Record<string, number>;
    const food = (await api('POST', '/foods', { body: { displayName: unique('all nutrients'), baseUnit: '100 g', nutrients } })).body.food;
    await logDay(p.userId, DATES[0]!, [], [{ name: food.displayName, quantity: 150, unit: 'g' }]);
    await logDay(p.userId, DATES[2]!, [], [{ name: food.displayName, quantity: 50, unit: 'g' }, { name: unique('unknown food') }]);
    await logDay(p.userId, addDays(WEEK, -1), [food.displayName]);
    const res = await getRange(p, DATES[0]!, DATES[2]!);
    expect(res.status).toBe(200);
    expect(res.body.coverage).toMatchObject({ calendarDays: 3, loggedDays: 2, itemCount: 3, pendingItems: 1 });
    expect(res.body.nutrients.map((n: any) => n.nutrient)).toEqual(NUTRIENTS.map(n => n.key));
    for (const n of res.body.nutrients) {
      expect(n).toMatchObject({ total: nutrients[n.nutrient] * 2, meanPerLoggedDay: nutrients[n.nutrient], knownItems: 2, missingItems: 1, isLowerBound: true });
    }
    const other = await createProfileWithSecret();
    expect((await getRange(other, DATES[0]!, DATES[2]!)).body.nutrients.every((n: any) => n.total === null)).toBe(true);
  });

  it('counts incomplete and current days, excludes skipped days, and recalculates corrected foods', async () => {
    const p = await createProfileWithSecret();
    const food = (await api('POST', '/foods', { body: { displayName: unique('range food'), baseUnit: 'serving', nutrients: { calories: 100, vitaminD: 0 } } })).body.food;
    await logDay(p.userId, DATES[0]!, [food.displayName]);
    await logDay(p.userId, DATES[1]!, [food.displayName]);
    await api('PUT', `/days/${DATES[1]}/status`, { ...p, body: { status: 'skip' } });
    const res = await getRange(p, DATES[0]!, DATES[1]!);
    expect(res.body.coverage).toMatchObject({ loggedDays: 1, skippedDays: 1 });
    expect(n(res, 'calories').total).toBe(100);
    expect(n(res, 'vitaminD').total).toBe(0);
    expect(n(res, 'vitaminC')).toMatchObject({ total: null, missingItems: 1 });
    const updated = await api('PUT', `/foods/${food.id}`, { body: { nutrients: { calories: 120, vitaminC: 2 } } });
    expect(updated.status).toBe(200);
    expect(n(await getRange(p, DATES[0]!, DATES[1]!), 'calories').total).toBe(120);
    await logDay(p.userId, TODAY, [food.displayName]);
    expect(n(await getRange(p, TODAY), 'calories').total).toBe(120);
    expect((await getRange(p, TODAY, addDays(TODAY, 7))).body.range.through).toBe(TODAY);
  });

  it('handles leap years, full years and custom ranges without a weekly or monthly limit', async () => {
    const p = await createProfileWithSecret();
    for (const [from, to, days] of [['2024-02-01', '2024-02-29', 29], ['2024-01-01', '2024-12-31', 366], ['2023-12-31', '2025-01-01', 368]] as const) {
      const res = await getRange(p, from, to);
      expect(res.status).toBe(200);
      expect(res.body.coverage.calendarDays).toBe(days);
      expect(res.body.nutrients.every((n: any) => n.total === null && n.meanPerLoggedDay === null)).toBe(true);
    }
    for (const query of ['from=nope&to=2024-01-01', 'from=2024-02-30&to=2024-03-01', 'from=2024-02-02&to=2024-02-01', 'from=2999-01-01&to=2999-12-31', 'from=2024-01-01']) {
      expect((await api('GET', `/reports/range?${query}`, p)).status).toBe(400);
    }
  });

  it('uses the existing profile access rules and never exposes hidden amounts', async () => {
    const p = await onboard({}, { eatingDisorder: true });
    await logDay(p.userId, WEEK, (await seedFoods()).map(f => f.name));
    expect((await api('GET', `/reports/range?from=${WEEK}&to=${WEEK}`, { userId: p.userId })).body.error.code).toBe('profile_secret_required');
    expect((await getRange({ ...p, secret: 'x'.repeat(43) }, WEEK)).body.error.code).toBe('profile_secret_invalid');
    const res = await getRange(p, WEEK);
    expect(res.status).toBe(200);
    expect(res.body.display.numbersHidden).toBe(true);
    expect(res.body.nutrients).toEqual([]);
    expect(res.text).not.toMatch(/1800|2520|meanPerLoggedDay/);
    expect((await api('GET', `/reports/range?from=${WEEK}&to=${WEEK}`, { token: null })).status).toBe(401);
  });
});
