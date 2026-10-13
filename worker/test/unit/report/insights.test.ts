/**
 * The insight rules (WEEKLY_BREAKDOWN_PLAN.md 5.6, 11.5): each fires on its trigger and not otherwise; at most
 * three; safety first; at most one per nutrient; the safety and data rules alone in generic and reference-only
 * modes; nothing about vitamin K, potassium or sodium with the medicine flag; no numbers in low-pressure mode.
 */
import { describe, expect, it } from 'vitest';
import type { NutrientKey } from '../../../src/domain/nutrients';
import { buildInsights, leadingNutrients, type InsightContext } from '../../../src/domain/report/insights';
import type { DayReport, NutrientReport } from '../../../src/domain/report/types';
import type { Target } from '../../../src/domain/targets/types';
import { dates, reportOf, usual } from './helpers';

const tgt = (nutrient: NutrientKey, kind: Target['kind'], value: number): Target => ({ nutrient, kind, unit: 'g', value, refType: 'RDA', window: 'week', evidence: 'R', basis: 'nasem-dri-appendix-j', how: 'x', scored: true, verdicts: true, origin: 'recommended' });
const nr = (nutrient: NutrientKey, over: Partial<NutrientReport> & { value?: number; kind?: Target['kind'] } = {}): NutrientReport => ({
  nutrient,
  target: tgt(nutrient, over.kind ?? (nutrient === 'sodium' ? 'limit' : 'minimum'), over.value ?? 100),
  meanPerAssessedDay: 100,
  isLowerBound: false,
  dataCoverage: 1,
  daysMeeting: 3, // not every assessed day, so a nutrient on target does not also raise target_met unless a test says so
  assessedDays: 5,
  dayValues: [],
  assessment: 'meets',
  topSources: [],
  trend: null,
  ...over,
});
const dayReports = (n = 7): DayReport[] => dates.slice(0, n).map((date) => ({ date, state: 'valid', kcal: 1800, lowIntake: false, veryHigh: false, pendingItems: 0 }));
const base = (over: Partial<InsightContext> = {}): InsightContext => ({
  mode: 'personalised',
  numbersHidden: false,
  medicine: false,
  assessedDays: 5,
  days: dayReports(),
  lowIntakeDays: 0,
  floor: 1200,
  pendingItems: 0,
  nutrients: [],
  fourWeek: [],
  leading: ['protein', 'fiber', 'potassium', 'sodium'],
  energy: null,
  underweight: false,
  weekend: null,
  previous: {},
  ...over,
});
const ids = (c: InsightContext) => buildInsights(c).map((i) => i.id);

describe('safety (priority 1): needs no profile and runs in every mode', () => {
  it('low_intake: three or more non-empty days under the floor', () => {
    expect(ids(base({ lowIntakeDays: 3 }))).toEqual(['low_intake']);
    expect(ids(base({ lowIntakeDays: 2 }))).toEqual([]);
    expect(buildInsights(base({ lowIntakeDays: 5, floor: 1500 }))[0]).toEqual({ id: 'low_intake', priority: 1, params: { n: 5, floor: 1500 } });
    for (const mode of ['generic', 'reference_only'] as const) expect(ids(base({ mode, lowIntakeDays: 4 }))).toEqual(['low_intake']);
  });

  it('underweight: BMI under 18.5 from the latest weight', () => {
    expect(ids(base({ underweight: true }))).toEqual(['underweight']);
  });

  it('outranks everything else', () => {
    const c = base({ lowIntakeDays: 3, pendingItems: 4, nutrients: [nr('sodium', { assessment: 'over', meanPerAssessedDay: 3000, value: 2300 })] });
    expect(ids(c)[0]).toBe('low_intake');
  });
});

describe('data (priority 2): what is missing from the log', () => {
  it('few_days under three assessed days', () => {
    expect(buildInsights(base({ assessedDays: 2 }))[0]).toEqual({ id: 'few_days', priority: 2, params: { n: 2 } });
    expect(ids(base({ assessedDays: 3 }))).toEqual([]);
  });

  it('incomplete_days names the day that looks the least complete', () => {
    const days = dayReports();
    days[2] = { ...days[2]!, state: 'partial', kcal: 700 };
    days[4] = { ...days[4]!, state: 'partial', kcal: 400 };
    expect(buildInsights(base({ days }))[0]).toMatchObject({ id: 'incomplete_days', params: { date: dates[4], kcal: 400, n: 2 } });
  });

  it('pending_items when any item is waiting for a food or unit', () => {
    expect(buildInsights(base({ pendingItems: 6 }))[0]).toEqual({ id: 'pending_items', priority: 2, params: { n: 6 } });
  });

  it('partial_data when a leading nutrient has under 90% coverage', () => {
    const c = base({ nutrients: [nr('protein', { dataCoverage: 0.7 }), nr('fiber')] });
    expect(buildInsights(c)[0]).toMatchObject({ id: 'partial_data', nutrient: 'protein' });
    expect(ids(base({ nutrients: [nr('protein', { dataCoverage: 0.95 })] }))).toEqual([]);
  });

  it('implausible_day flags the largest day for a check on the quantities', () => {
    const days = dayReports();
    days[1] = { ...days[1]!, kcal: 4400, veryHigh: true };
    expect(buildInsights(base({ days }))[0]).toEqual({ id: 'implausible_day', priority: 2, params: { date: dates[1], kcal: 4400 } });
  });
});

describe('goal (priority 3): energy and protein', () => {
  const e = (mean: number, daysInBand = 2) => ({ meanKcal: mean, target: 2000, daysInBand, assessedDays: 5 });
  it('energy_above and energy_below outside a 10% band, energy_near inside it, and nothing with too few days', () => {
    expect(buildInsights(base({ energy: e(2400) }))[0]).toMatchObject({ id: 'energy_above', nutrient: 'calories', params: { mean: 2400, target: 2000, pct: 20 } });
    expect(ids(base({ energy: e(1500) }))).toEqual(['energy_below']);
    expect(ids(base({ energy: e(2100) }))).toEqual(['energy_near']);
    expect(buildInsights(base({ energy: e(2100, 3) }))[0]).toMatchObject({ params: { k: 3, n: 5 } });
    expect(ids(base({ energy: e(1500), assessedDays: 2 }))).toEqual(['few_days']);
  });

  it('protein_gap when protein averages under 90% of the target with complete data', () => {
    expect(buildInsights(base({ nutrients: [nr('protein', { meanPerAssessedDay: 40, value: 60, assessment: 'below' })] }))[0]).toMatchObject({ id: 'protein_gap', params: { mean: 40, target: 60 } });
    expect(ids(base({ nutrients: [nr('protein', { meanPerAssessedDay: 58, value: 60 })] }))).not.toContain('protein_gap');
    expect(ids(base({ nutrients: [nr('protein', { meanPerAssessedDay: 20, value: 60, dataCoverage: 0.7, assessment: 'unknown' })] }))).not.toContain('protein_gap');
  });
});

describe('nutrients (priority 4)', () => {
  it('sodium_over names the top sources, and says "at least" on a partial total', () => {
    const sodium = nr('sodium', { assessment: 'over', meanPerAssessedDay: 3100, value: 2300, topSources: [{ foodId: 'a', name: 'pickle', share: 0.4 }, { foodId: 'b', name: 'papad', share: 0.2 }] });
    expect(buildInsights(base({ nutrients: [sodium] }))[0]).toEqual({ id: 'sodium_over', priority: 4, nutrient: 'sodium', params: { mean: 3100, limit: 2300, atLeast: 0, sources: 'pickle, papad' } });
    expect(buildInsights(base({ nutrients: [{ ...sodium, isLowerBound: true }] }))[0]!.params.atLeast).toBe(1);
    expect(ids(base({ nutrients: [nr('sodium', { assessment: 'meets' })] }))).toEqual([]);
  });

  it('fibre_low when fibre is under 90% of the target', () => {
    expect(ids(base({ nutrients: [nr('fiber', { assessment: 'close', meanPerAssessedDay: 26, value: 30 })] }))).toEqual(['fibre_low']);
    expect(ids(base({ nutrients: [nr('fiber', { assessment: 'meets' })] }))).toEqual([]);
    expect(ids(base({ nutrients: [nr('fiber', { assessment: 'unknown', dataCoverage: 0.6 })] }))).toEqual(['partial_data']);
  });

  it('potassium_low_sodium_high when both are flagged', () => {
    const c = base({ nutrients: [nr('sodium', { assessment: 'over', meanPerAssessedDay: 3000, value: 2300 }), nr('potassium', { assessment: 'below', meanPerAssessedDay: 1500, value: 2600 })] });
    expect(ids(c)).toEqual(expect.arrayContaining(['sodium_over', 'potassium_low_sodium_high']));
    expect(ids(base({ nutrients: [nr('potassium', { assessment: 'below', meanPerAssessedDay: 1500, value: 2600 })] }))).not.toContain('potassium_low_sodium_high');
  });

  it('mineral_gap for up to two judged minerals under 75% with complete data, the lowest first', () => {
    const minerals = (['calcium', 'iron', 'magnesium', 'zinc'] as const).map((k, i) => nr(k, { assessment: 'below', meanPerAssessedDay: 30 + i * 10, value: 100 }));
    const out = buildInsights(base({ nutrients: minerals }));
    expect(out.map((i) => i.nutrient)).toEqual(['calcium', 'iron']);
    expect(ids(base({ nutrients: [nr('calcium', { assessment: 'unknown', dataCoverage: 0.6 })] }))).toEqual([]);
    expect(ids(base({ nutrients: [nr('calcium', { assessment: 'close', meanPerAssessedDay: 80, value: 100 })] }))).toEqual([]);
  });

  it('vitamin_window over four weeks, only with enough data', () => {
    const v = nr('vitaminD', { meanPerAssessedDay: 4, value: 15, assessedDays: 12, assessment: 'below' });
    expect(buildInsights(base({ fourWeek: [v] }))[0]).toMatchObject({ id: 'vitamin_window', nutrient: 'vitaminD', params: { mean: '4', reference: 15 } });
    expect(ids(base({ fourWeek: [{ ...v, assessedDays: 2 }] }))).toEqual([]);
    expect(ids(base({ fourWeek: [{ ...v, dataCoverage: 0.7 }] }))).toEqual([]);
    expect(ids(base({ fourWeek: [{ ...v, meanPerAssessedDay: 14 }] }))).toEqual([]);
  });

  it('weekend_pattern describes a difference over 15% in energy, with enough days either side', () => {
    const w = (weekendMean: number, weekendDays = 2, weekdayDays = 3) => ({ weekendMean, weekdayMean: 1800, weekendDays, weekdayDays });
    expect(buildInsights(base({ weekend: w(2200) }))[0]).toEqual({ id: 'weekend_pattern', priority: 4, params: { pct: 22, direction: 'more' } });
    expect(buildInsights(base({ weekend: w(1400) }))[0]!.params).toEqual({ pct: 22, direction: 'less' });
    expect(ids(base({ weekend: w(1900) }))).toEqual([]);
    expect(ids(base({ weekend: w(2400, 1, 3) }))).toEqual([]);
    expect(ids(base({ weekend: w(2400, 2, 2) }))).toEqual([]);
  });
});

describe('positive (priority 5)', () => {
  it('target_met when a leading nutrient is met on every assessed day', () => {
    const met = nr('protein', { assessment: 'meets', daysMeeting: 5, assessedDays: 5 });
    expect(ids(base({ nutrients: [met] }))).toEqual(['target_met']);
    expect(ids(base({ nutrients: [{ ...met, daysMeeting: 4 }] }))).toEqual([]);
    expect(ids(base({ nutrients: [{ ...met, assessedDays: 2, daysMeeting: 2 }], assessedDays: 2 }))).toEqual(['few_days']);
  });

  it('improving when a leading nutrient is up by more than its noise band on the previous four weeks', () => {
    const fibre = nr('fiber', { assessment: 'meets', meanPerAssessedDay: 28, daysMeeting: 3, value: 30 });
    expect(buildInsights(base({ nutrients: [fibre], previous: { fiber: { mean: 20, band: 2 } } }))[0]).toEqual({ id: 'improving', priority: 5, nutrient: 'fiber', params: { nutrient: 'fiber', from: '20', to: '28' } });
    expect(ids(base({ nutrients: [fibre], previous: { fiber: { mean: 27, band: 2 } } }))).toEqual([]);
  });
});

describe('selection', () => {
  it('shows at most three, by priority and then by the larger gap, and at most one per nutrient', () => {
    const c = base({
      lowIntakeDays: 3,
      pendingItems: 2,
      assessedDays: 5,
      nutrients: [
        nr('sodium', { assessment: 'over', meanPerAssessedDay: 3000, value: 2300 }),
        nr('fiber', { assessment: 'below', meanPerAssessedDay: 10, value: 30 }),
        nr('calcium', { assessment: 'below', meanPerAssessedDay: 300, value: 1000 }),
        nr('iron', { assessment: 'below', meanPerAssessedDay: 9, value: 18 }),
      ],
    });
    const out = buildInsights(c);
    expect(out).toHaveLength(3);
    // calcium's gap (70%) is wider than fibre's (67%), so it is the one nutrient insight that fits.
    expect(out.map((i) => i.id)).toEqual(['low_intake', 'pending_items', 'mineral_gap']);
    expect(out[2]!.nutrient).toBe('calcium');
    // One per nutrient: calcium appears once even if two rules apply.
    const calcium = base({ nutrients: [nr('protein', { assessment: 'unknown', dataCoverage: 0.7 }), nr('protein', { assessment: 'below', meanPerAssessedDay: 10, value: 60 })] });
    expect(buildInsights(calcium).filter((i) => i.nutrient === 'protein')).toHaveLength(1);
  });

  it('breaks a tie inside a priority by the larger gap', () => {
    const c = base({ nutrients: [nr('calcium', { assessment: 'below', meanPerAssessedDay: 700, value: 1000 }), nr('iron', { assessment: 'below', meanPerAssessedDay: 9, value: 18 })] });
    expect(buildInsights(c).map((i) => i.nutrient)).toEqual(['iron', 'calcium']);
  });
});

describe('modes and switches', () => {
  const rich = (over: Partial<InsightContext> = {}) =>
    base({ pendingItems: 3, energy: { meanKcal: 1500, target: 2000, daysInBand: 0, assessedDays: 5 }, nutrients: [nr('sodium', { assessment: 'over', meanPerAssessedDay: 3000, value: 2300 }), nr('fiber', { assessment: 'below', meanPerAssessedDay: 10, value: 30 })], ...over });

  it('generic and reference-only modes run only the safety and data rules', () => {
    expect(ids(rich())).toEqual(['pending_items', 'energy_below', 'fibre_low']);
    for (const mode of ['generic', 'reference_only'] as const) expect(ids(rich({ mode }))).toEqual(['pending_items']);
  });

  it('with the medicine flag, no insight mentions vitamin K, potassium or sodium', () => {
    const c = rich({ medicine: true, nutrients: [...rich().nutrients, nr('potassium', { assessment: 'below', meanPerAssessedDay: 1000, value: 2600 }), nr('vitaminK', { assessment: 'below', meanPerAssessedDay: 20, value: 90 })], fourWeek: [nr('vitaminK', { meanPerAssessedDay: 20, value: 90, assessedDays: 12, assessment: 'below' })] });
    const out = buildInsights(c);
    expect(out.every((i) => !['sodium', 'potassium', 'vitaminK'].includes(i.nutrient ?? ''))).toBe(true);
    expect(JSON.stringify(out)).not.toMatch(/sodium|potassium|vitaminK/);
  });

  it('in low-pressure mode: only variety, fibre, sodium and the log; no parameters, so no number', () => {
    const out = buildInsights(rich({ numbersHidden: true, lowIntakeDays: 3 }));
    // energy_below is not on the list, so the three that fit are the safety notice, the log, and the larger of fibre and sodium.
    expect(out.map((i) => i.id)).toEqual(['low_intake', 'pending_items', 'fibre_low']);
    for (const i of out) {
      expect(i.params).toEqual({});
      expect(['low_intake', 'underweight', 'few_days', 'incomplete_days', 'pending_items', 'partial_data', 'fibre_low', 'sodium_over']).toContain(i.id);
    }
    expect(JSON.stringify(out)).not.toMatch(/\d{2,}/);
  });
});

describe('the nutrients that lead (plan 5.3)', () => {
  it('chooses by goal, adding iron, zinc and calcium for plant-based patterns and iron, calcium and sodium for the Indian set', () => {
    expect(leadingNutrients({ goal: 'general_health', pattern: 'omnivore', referenceSet: 'nasem' })).toEqual(['protein', 'fiber', 'potassium', 'sodium']);
    expect(leadingNutrients({ goal: 'lose', pattern: null, referenceSet: null })).toEqual(['calories', 'protein', 'fiber', 'sodium']);
    expect(leadingNutrients({ goal: 'build_muscle', pattern: null, referenceSet: null })).toEqual(['calories', 'protein', 'fiber']);
    expect(leadingNutrients({ goal: 'maintain', pattern: 'vegan', referenceSet: null })).toEqual(['protein', 'fiber', 'potassium', 'sodium', 'iron', 'zinc', 'calcium']);
    expect(leadingNutrients({ goal: 'maintain', pattern: 'omnivore', referenceSet: 'icmr_nin' })).toEqual(['protein', 'fiber', 'potassium', 'sodium', 'iron', 'calcium']);
  });
});

describe('end to end: the plan\'s ordinary 1,800 kcal week for a 2,150 kcal target (5.9)', () => {
  it('describes it: energy below target, calcium and iron below, with the three insights the plan lists', () => {
    const r = reportOf(dates.map((d) => usual(d)));
    expect(r.insights.map((i) => i.id)).toEqual(['energy_below', 'mineral_gap', 'mineral_gap']);
    expect(r.insights.slice(1).map((i) => i.nutrient)).toEqual(['calcium', 'iron']);
    const by = (k: string) => r.nutrients.find((n) => n.nutrient === k)!;
    // protein and potassium on target, fibre a little low, sodium above the limit
    expect([by('protein').assessment, by('potassium').assessment, by('fiber').assessment, by('sodium').assessment]).toEqual(['meets', 'meets', 'close', 'over']);
    expect(Math.round(by('sodium').meanPerAssessedDay!)).toBe(2520);
    expect(Math.round(by('fiber').meanPerAssessedDay!)).toBe(27);
  });
});
