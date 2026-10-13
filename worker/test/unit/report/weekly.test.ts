/**
 * `buildWeeklyReport` end to end (WEEKLY_BREAKDOWN_PLAN.md sections 5, 7, 8.1, 8.2): the modes, target sets
 * that change mid-week, overrides, the four-week window, eight weeks of history, low-pressure mode, the
 * medicine flag and the shape of what leaves.
 */
import { describe, expect, it } from 'vitest';
import { addDays, weekStartOf } from '../../../src/domain/time';
import { buildWeeklyReport, setInForce } from '../../../src/domain/report/weekly';
import type { IntakeDay } from '../../../src/domain/intake/types';
import { ENGINE_VERSION } from '../../../src/domain/targets/types';
import { ASHA, WEEK, dates, day, item, reportOf, setOf, usual } from './helpers';
import { randomDay, rng } from './gen';

const logged = (n: number, f: (d: string, i: number) => IntakeDay = (d) => usual(d)) => dates.map((d, i) => (i < n ? f(d, i) : day(d)));
const ordinary = () => dates.map((d) => usual(d));

/** Every value in a JSON-able tree is a string, boolean, null, or a finite number: nothing undefined, NaN or infinite. */
function assertClean(value: unknown, path = 'report'): void {
  if (value === undefined) throw new Error(`${path} is undefined`);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path} is ${value}`);
  } else if (Array.isArray(value)) value.forEach((v, i) => assertClean(v, `${path}[${i}]`));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) assertClean(v, `${path}.${k}`);
}

describe('the report of an ordinary week', () => {
  const r = reportOf(ordinary());

  it('carries the engine version, the week, the target set in force and the disclaimer', () => {
    expect(r.engineVersion).toBe(ENGINE_VERSION);
    expect(r.week).toEqual({ start: '2026-10-05', end: '2026-10-11', today: '2026-10-12', isCurrent: false });
    expect(r.mode).toBe('personalised');
    expect(r.targetSet).toEqual({ id: 'ts_1', effectiveFrom: '2026-01-01' });
    expect(r.display).toEqual({ numbersHidden: false });
    expect(r.disclaimerId).toBe('estimates-v1');
  });

  it('is clean JSON: no undefined, NaN or infinite value, and it survives a round trip', () => {
    assertClean(r);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });

  it('knows the days: logged, the confidence, the energy against the target', () => {
    expect(r.coverage).toMatchObject({ assessedDays: 7, weekendAssessedDays: 2, pendingItems: 0, confidence: 'good' });
    expect(r.coverage.days.map((d) => d.state)).toEqual(Array(7).fill('valid'));
    expect(r.energy).toEqual({ meanKcal: 1800, target: 2150, low: 1910, high: 2390, daysInBand: 0, assessedDays: 7 });
    expect(r.score).toMatchObject({ value: 90, shown: 90, isMinimum: false, outOf: 55 });
  });

  it('reports each nutrient: target, mean, coverage, the day values, a verdict and the top sources', () => {
    const sodium = r.nutrients.find((n) => n.nutrient === 'sodium')!;
    expect(sodium).toMatchObject({ meanPerAssessedDay: 2520, dataCoverage: 1, isLowerBound: false, assessment: 'over', assessedDays: 7, daysMeeting: 0 });
    expect(sodium.target).toMatchObject({ kind: 'limit', value: 2300, origin: 'recommended' });
    expect(sodium.dayValues).toEqual(Array(7).fill(2520));
    expect(sodium.topSources.map((s) => s.name)).toEqual(['meal 4', 'meal 2', 'meal 1']);
    const protein = r.nutrients.find((n) => n.nutrient === 'protein')!;
    expect(protein).toMatchObject({ assessment: 'meets', daysMeeting: 7 });
  });

  it('keeps the vitamins out of the week\'s verdicts: amounts for the week, judged over four weeks', () => {
    const vitamins = ['vitaminA', 'vitaminC', 'vitaminD', 'vitaminE', 'vitaminK', 'vitaminB12', 'folate'];
    for (const v of vitamins) expect(r.nutrients.find((n) => n.nutrient === v)).toBeDefined();
    expect(r.fourWeek.map((n) => n.nutrient)).toEqual(vitamins);
  });
});

describe('the rows that lead the Report tab (plan 5.3)', () => {
  it('name the goal\'s rows, then the two judged minerals furthest below their reference', () => {
    const r = reportOf(ordinary());
    expect(r.lead).toEqual(['protein', 'fiber', 'potassium', 'sodium', 'calcium', 'iron']);
  });
  it('add nothing when the week cannot be judged, or a mineral already leads', () => {
    expect(reportOf(logged(2)).lead).toEqual(['protein', 'fiber', 'potassium', 'sodium']);
    const veg = buildWeeklyReport({ weekStart: WEEK, today: '2026-10-12', mode: 'personalised', targetSets: [setOf(ASHA)], days: ordinary(), weeks: 1, pattern: 'vegetarian' });
    expect(veg.lead.slice(0, 7)).toEqual(['protein', 'fiber', 'potassium', 'sodium', 'iron', 'zinc', 'calcium']);
    expect(veg.lead.filter((k) => k === 'calcium')).toHaveLength(1);
  });
});

describe('what counts', () => {
  it('judges only the days that count, never today, and says how sure it is', () => {
    const r = reportOf(logged(7), { today: '2026-10-08' }); // Thursday
    expect(r.week.isCurrent).toBe(true);
    expect(r.coverage.days.map((d) => d.state)).toEqual(['valid', 'valid', 'valid', 'in_progress', 'future', 'future', 'future']);
    expect(r.coverage.assessedDays).toBe(3);
    expect(r.coverage.confidence).toBe('rough');
    expect(r.targetSet.effectiveFrom).toBe('2026-01-01');
  });

  it('with fewer than three days: no verdicts, no score, "logged so far" figures, and the reason', () => {
    const r = reportOf(logged(2));
    expect(r.coverage.confidence).toBe('insufficient');
    expect(r.score).toMatchObject({ value: null, withheld: 'few_days' });
    expect(r.nutrients.find((n) => n.nutrient === 'protein')).toMatchObject({ assessment: 'unknown' });
    expect(r.nutrients.find((n) => n.nutrient === 'protein')!.meanPerAssessedDay).toBeCloseTo(59, 5); // 2 days of the usual week: 59 g protein a day
    expect(r.insights[0]).toMatchObject({ id: 'few_days', params: { n: 2 } });
  });

  it('treats a day marked "leave out" as not there, and a day marked complete with nothing logged as a day', () => {
    const days = ordinary();
    days[3] = { ...days[3]!, mark: 'skip' };
    days[5] = day(dates[5]!, [], 'complete');
    const r = reportOf(days);
    expect(r.coverage.days.map((d) => d.state)).toEqual(['valid', 'valid', 'valid', 'skipped', 'valid', 'confirmed', 'valid']);
    expect(r.coverage.assessedDays).toBe(6);
    // The fasting day is a day of zero energy: the week's mean falls.
    expect(r.energy!.meanKcal).toBeLessThan(1800);
  });

  it('counts pending items and names unknown foods when they decide the day', () => {
    // Four meals and three pending items a day: 3 of 7 is more than a third.
    const days = ordinary().map((d) => ({ ...d, items: [...d.items, item(null, {}, { pending: true }), item(null, {}, { pending: true }), item(null, {}, { pending: true })] }));
    const r = reportOf(days);
    expect(r.coverage.pendingItems).toBe(21);
    expect(r.coverage.days.every((d) => d.state === 'partial')).toBe(true);
    expect(r.score.withheld).toBe('unknown_foods');
    expect(r.insights.map((i) => i.id)).toContain('pending_items');
  });
});

describe('target sets that change mid-week: each day is judged by the set in force that day (plan 6.2)', () => {
  const A = setOf({ ...ASHA, energy: 2000 }, '2026-01-01', 'ts_a');
  const B = setOf({ ...ASHA, energy: 1500 }, '2026-10-08', 'ts_b');
  const days = dates.map((d, i) => day(d, [item(i < 3 ? 2000 : 1500, { protein: 80, fiber: 35, potassium: 3000, calcium: 1100, iron: 19, magnesium: 330, zinc: 9, sodium: 1500 })]));

  it('finds the set in force on a date, the earliest for dates before the first', () => {
    expect(setInForce([A, B], '2026-10-07')!.id).toBe('ts_a');
    expect(setInForce([A, B], '2026-10-08')!.id).toBe('ts_b');
    expect(setInForce([A, B], '2025-01-01')!.id).toBe('ts_a');
    expect(setInForce([], '2026-10-08')).toBeNull();
  });

  it('counts a day in band against its own target, and averages the targets over the days that count', () => {
    const r = buildWeeklyReport({ weekStart: WEEK, today: '2026-10-12', mode: 'personalised', targetSets: [A, B], days, weeks: 1 });
    expect(r.energy!.daysInBand).toBe(7); // 3 days on 2,000 and 4 days on 1,500: every day matches its own target
    expect(r.energy!.target).toBe(Math.round((3 * 2000 + 4 * 1500) / 7));
    expect(r.targetSet).toEqual({ id: 'ts_b', effectiveFrom: '2026-10-08' });
    // Against the OLD target alone the last four days would read as under.
    const old = buildWeeklyReport({ weekStart: WEEK, today: '2026-10-12', mode: 'personalised', targetSets: [A], days, weeks: 1 });
    expect(old.energy!.daysInBand).toBe(3);
  });

  it('uses the set in force on the last day of a week already over, and on today for the current week', () => {
    expect(buildWeeklyReport({ weekStart: WEEK, today: '2026-10-07', mode: 'personalised', targetSets: [A, B], days, weeks: 1 }).targetSet.id).toBe('ts_a');
  });
});

describe('typed numbers (plan 6.1, 6.7)', () => {
  it('draws a custom target on the row and labels it, and leaves the score alone', () => {
    const r = reportOf(ordinary(), { overrides: [{ nutrient: 'protein', value: 100, origin: 'custom' }] });
    const protein = r.nutrients.find((n) => n.nutrient === 'protein')!;
    expect(protein.target).toMatchObject({ value: 100, origin: 'custom', basis: 'custom-target' });
    expect(protein.assessment).toBe('below'); // 59 of 100
    expect(r.score.value).toBe(reportOf(ordinary()).score.value);
  });

  it('with only care-team numbers (reference-only): bars and amounts against them, near/above/below for energy, no score', () => {
    const r = buildWeeklyReport({
      weekStart: WEEK,
      today: '2026-10-12',
      mode: 'reference_only',
      days: ordinary(),
      weeks: 1,
      overrides: [{ nutrient: 'calories', value: 1800, origin: 'care_team' }, { nutrient: 'protein', value: 70, origin: 'care_team' }, { nutrient: 'sodium', value: 1500, origin: 'care_team' }],
    });
    expect(r.mode).toBe('reference_only');
    expect(r.score).toMatchObject({ value: null, withheld: 'reference_only' });
    expect(r.energy).toMatchObject({ target: 1800, meanKcal: 1800, daysInBand: 7 });
    const by = (k: string) => r.nutrients.find((n) => n.nutrient === k)!;
    expect(by('protein')).toMatchObject({ assessment: 'close', target: { origin: 'care_team', value: 70 } }); // 59 of 70 = 84%
    expect(by('sodium').assessment).toBe('well_over');
    expect(by('calcium')).toMatchObject({ target: null, assessment: 'amount_only' });
    // Nothing else the app computes: no weight advice, only the safety and data insights.
    expect(r.insights.every((i) => i.priority <= 2)).toBe(true);
  });

  it('reference-only with nothing typed: coverage and amounts only', () => {
    const r = buildWeeklyReport({ weekStart: WEEK, today: '2026-10-12', mode: 'reference_only', days: ordinary(), weeks: 1 });
    expect(r.energy).toBeNull();
    expect(r.score.withheld).toBe('reference_only');
    expect(r.nutrients.every((n) => n.target === null && n.assessment === 'amount_only')).toBe(true);
    expect(r.nutrients.find((n) => n.nutrient === 'protein')!.meanPerAssessedDay).toBeCloseTo(59, 5);
  });
});

describe('generic mode: no health profile (plan 7.5)', () => {
  const r = buildWeeklyReport({ weekStart: WEEK, today: '2026-10-12', mode: 'generic', days: ordinary(), weeks: 1 });

  it('compares with the general reference, with no energy verdict and no score', () => {
    expect(r.mode).toBe('generic');
    expect(r.energy).toBeNull();
    expect(r.score).toMatchObject({ value: null, withheld: 'generic' });
    const protein = r.nutrients.find((n) => n.nutrient === 'protein')!;
    expect(protein.target).toMatchObject({ value: 50, origin: 'recommended' });
    expect(protein.assessment).toBe('meets');
    expect(r.nutrients.find((n) => n.nutrient === 'calories')!.assessment).toBe('amount_only');
    expect(r.nutrients.find((n) => n.nutrient === 'sugar')).toMatchObject({ target: null, assessment: 'amount_only' });
  });

  it('is what a personalised profile with no target set yet falls back to', () => {
    expect(reportOf(ordinary(), { targetSets: [] }).mode).toBe('generic');
  });

  it('uses a calorie target the person typed as theirs: an energy verdict, labelled custom', () => {
    const typed = buildWeeklyReport({ weekStart: WEEK, today: '2026-10-12', mode: 'generic', days: ordinary(), weeks: 1, overrides: [{ nutrient: 'calories', value: 1800, origin: 'custom' }] });
    expect(typed.energy).toMatchObject({ target: 1800, daysInBand: 7 });
    expect(typed.nutrients.find((n) => n.nutrient === 'calories')).toMatchObject({ assessment: 'meets', target: { origin: 'custom' } });
  });
});

describe('the safety rules run in every mode', () => {
  const crash = ordinary().map((d) => ({ ...d, mark: 'complete' as const, items: d.items.map((i) => ({ ...i, nutrients: Object.fromEntries(Object.entries(i.nutrients).map(([k, v]) => [k, (v as number) / 1.8])) })) }));

  it('G13: three days under the floor give the notice and withhold the score, with and without numbers hidden', () => {
    for (const mode of ['personalised', 'generic', 'reference_only'] as const) {
      for (const numbersHidden of [false, true]) {
        const r = buildWeeklyReport({ weekStart: WEEK, today: '2026-10-12', mode, targetSets: [setOf(ASHA)], days: crash, weeks: 1, numbersHidden });
        expect(r.insights[0]!.id, `${mode} hidden=${numbersHidden}`).toBe('low_intake');
        expect(r.score.value, `${mode}`).toBeNull();
        expect(r.coverage.days.filter((d) => d.lowIntake)).toHaveLength(7);
      }
    }
  });

  it('puts a low-intake week in the incomplete-days class, so the notice is the headline, not a score', () => {
    const unmarked = crash.map((d) => ({ ...d, mark: null }));
    const r = reportOf(unmarked);
    expect(r.coverage.days.every((d) => d.state === 'partial')).toBe(true);
    expect(r.score.withheld).toBe('incomplete_days');
    expect(r.insights[0]!.id).toBe('low_intake');
  });
});

describe('low-pressure mode (plan 8.2, 11.4): never a number the person asked to hide', () => {
  // Distinctive amounts, so any leak is findable in the output.
  const days = dates.map((d) => day(d, [item(1873, { protein: 77.7, fiber: 19.3, potassium: 2750, calcium: 612, iron: 11.1, magnesium: 281, zinc: 6.4, sodium: 3140 }, { foodId: 'f', name: 'thali' })]));
  const r = reportOf(days, { numbersHidden: true, weeks: 8 });

  it('has no energy card, no nutrients, no score and no history numbers', () => {
    expect(r.display).toEqual({ numbersHidden: true });
    expect(r.energy).toBeNull();
    expect(r.nutrients).toEqual([]);
    expect(r.fourWeek).toEqual([]);
    expect(r.score).toMatchObject({ value: null, shown: null, withheld: 'numbers_hidden' });
    expect(r.scoreTrend).toBeNull();
    expect(r.history.every((h) => h.energyPct === null && h.proteinPct === null && h.score === null)).toBe(true);
    expect(r.coverage.days.every((d) => d.kcal === null)).toBe(true);
  });

  it('carries only numberless insights about fibre, sodium and the log', () => {
    expect(r.insights.length).toBeGreaterThan(0);
    for (const i of r.insights) expect(i.params).toEqual({});
  });

  it('leaks none of the amounts anywhere in the payload', () => {
    const json = JSON.stringify(r);
    for (const secret of ['1873', '77.7', '19.3', '2750', '612', '3140', '281']) expect(json, secret).not.toContain(secret);
    expect(json).not.toMatch(/"kcal":[1-9]/);
  });
});

describe('a medicine that interacts with food (plan 8.1 G12)', () => {
  it('shows vitamin K, potassium and sodium as amounts, with no verdict and no insight', () => {
    const set = setOf(ASHA);
    set.targets = set.targets.map((t) => (['sodium', 'potassium', 'vitaminK'].includes(t.nutrient) ? { ...t, verdicts: false } : t));
    const r = buildWeeklyReport({ weekStart: WEEK, today: '2026-10-12', mode: 'personalised', targetSets: [set], days: ordinary(), weeks: 1, medicine: true });
    for (const k of ['sodium', 'potassium']) expect(r.nutrients.find((n) => n.nutrient === k)).toMatchObject({ assessment: 'amount_only' });
    expect(r.nutrients.find((n) => n.nutrient === 'sodium')!.meanPerAssessedDay).toBe(2520);
    expect(JSON.stringify(r.insights)).not.toMatch(/sodium|potassium|vitaminK/);
    expect(r.nutrients.find((n) => n.nutrient === 'protein')!.assessment).toBe('meets');
  });
});

describe('the four-week view (plan 4.6)', () => {
  it('judges the high-variation vitamins over the rolling 28 days, on assessed days only', () => {
    const vitaminDays = (n: number, d: number) => Array.from({ length: n }, (_, i) => day(addDays('2026-09-14', i), [item(1800, { protein: 60, vitaminD: d })]));
    // 28 days ending Sunday 11 October: every day logged with 4 mcg of vitamin D, against a reference of 15.
    const days = vitaminDays(28, 4);
    const set = setOf(ASHA);
    set.targets.push({ nutrient: 'vitaminD', kind: 'minimum', unit: 'mcg', value: 15, refType: 'RDA', window: 'four_weeks', evidence: 'R', basis: 'nasem-dri-appendix-j', how: 'x', scored: false, verdicts: true, origin: 'recommended', upperLevel: 100 });
    const r = buildWeeklyReport({ weekStart: WEEK, today: '2026-10-12', mode: 'personalised', targetSets: [set], days, weeks: 4 });
    const d = r.fourWeek.find((n) => n.nutrient === 'vitaminD')!;
    expect(d).toMatchObject({ assessedDays: 28, meanPerAssessedDay: 4, assessment: 'below', dataCoverage: 1 });
    expect(d.dayValues).toHaveLength(7); // the report week's own days
    // In the week's own list it is an amount, not a verdict.
    expect(r.nutrients.find((n) => n.nutrient === 'vitaminD')).toMatchObject({ assessment: 'amount_only', meanPerAssessedDay: 4 });
    expect(r.insights.map((i) => i.id)).toContain('vitamin_window');
  });

  it('needs at least three assessed days in the window', () => {
    const days = [day('2026-10-05', [item(1800, { vitaminC: 5 })]), day('2026-10-06', [item(1800, { vitaminC: 5 })])];
    const r = buildWeeklyReport({ weekStart: WEEK, today: '2026-10-12', mode: 'generic', days, weeks: 1 });
    expect(r.fourWeek.find((n) => n.nutrient === 'vitaminC')!.assessment).toBe('unknown');
  });
});

describe('eight weeks of history (plan 5.7)', () => {
  const r2 = rng(11);
  const history = (() => {
    const all: IntakeDay[] = [];
    for (let w = 0; w < 8; w++) {
      const start = addDays(WEEK, -7 * (7 - w));
      for (let i = 0; i < 7; i++) {
        // week 2 has only two days logged: a gap, not a zero
        all.push(w === 2 && i >= 2 ? day(addDays(start, i)) : randomDay(r2, addDays(start, i)));
      }
    }
    return all;
  })();
  const r = buildWeeklyReport({ weekStart: WEEK, today: '2026-10-12', mode: 'personalised', targetSets: [setOf(ASHA)], days: history, weeks: 8 });

  it('has one entry per week, oldest first, the reported week last', () => {
    expect(r.history).toHaveLength(8);
    expect(r.history.map((h) => h.weekStart)).toEqual(Array.from({ length: 8 }, (_, i) => addDays(WEEK, -7 * (7 - i))));
    expect(r.history[7]!.weekStart).toBe(WEEK);
  });

  it('leaves a week with too few days as a gap, not a zero', () => {
    expect(r.history[2]).toEqual({ weekStart: addDays(WEEK, -35), assessedDays: 2, energyPct: null, proteinPct: null, score: null });
    expect(r.history[3]!.assessedDays).toBe(7);
    expect(r.history[3]!.energyPct).toBeGreaterThan(50);
    expect(r.history[3]!.proteinPct).toBeGreaterThan(50);
  });

  it('agrees with the report for the reported week', () => {
    expect(r.history[7]!.score).toBe(r.score.value);
    expect(r.history[7]!.assessedDays).toBe(r.coverage.assessedDays);
  });

  it('says "higher" or "lower" only when the score moves by more than its noise band', () => {
    const scores = r.history.slice(0, -1).filter((h) => h.score !== null).map((h) => h.score!);
    expect(scores.length).toBeGreaterThanOrEqual(3);
    expect(['higher', 'lower', 'about_the_same']).toContain(r.scoreTrend);
  });

  it('limits history to what was asked, and to eight weeks', () => {
    expect(buildWeeklyReport({ weekStart: WEEK, today: '2026-10-12', mode: 'generic', days: history, weeks: 3 }).history).toHaveLength(3);
    expect(buildWeeklyReport({ weekStart: WEEK, today: '2026-10-12', mode: 'generic', days: history, weeks: 20 }).history).toHaveLength(8);
    expect(buildWeeklyReport({ weekStart: WEEK, today: '2026-10-12', mode: 'generic', days: history, weeks: 0 }).history).toHaveLength(1);
  });
});

describe('weeks of the calendar', () => {
  it('start on Monday, whatever day it is', () => {
    expect(['2026-10-05', '2026-10-06', '2026-10-11'].map(weekStartOf)).toEqual(['2026-10-05', '2026-10-05', '2026-10-05']);
    expect(weekStartOf('2026-10-12')).toBe('2026-10-12');
    expect(weekStartOf('2027-01-01')).toBe('2026-12-28'); // across a year
    expect(weekStartOf('2026-03-29')).toBe('2026-03-23'); // a daylight-saving Sunday in the northern hemisphere
  });
});

describe('cost', () => {
  it('builds eight weeks of 12 items a day well inside the free tier\'s 10 ms of CPU', () => {
    const r = rng(99);
    const all: IntakeDay[] = [];
    for (let i = 0; i < 56; i++) {
      const d = randomDay(r, addDays(addDays(WEEK, -49), i));
      all.push({ ...d, items: [...d.items, ...d.items, ...d.items].slice(0, 12) });
    }
    const input = { weekStart: WEEK, today: '2026-10-12', mode: 'personalised' as const, targetSets: [setOf(ASHA)], days: all, weeks: 8 };
    buildWeeklyReport(input); // warm up
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) buildWeeklyReport(input);
    const ms = (performance.now() - t0) / 10;
    // Logged for the record; the ceiling is loose so a slow CI machine does not fail it.
    console.log(`buildWeeklyReport, 56 days x 12 items: ${ms.toFixed(2)} ms`);
    expect(ms).toBeLessThan(50);
  });
});
