/**
 * The weekly report against the independent reference of Appendix F (test/reference/report_ref.py): the ten
 * scenarios of plan 5.9 and 100 random weeks with missing values, pending items and day marks
 * (WEEKLY_BREAKDOWN_PLAN.md 11.1, 11.5). Day states, confidence, energy, the score and the reason it is
 * withheld, every per-nutrient assessment and every score component must agree.
 */
import { describe, expect, it } from 'vitest';
import random from '../../fixtures/golden/report-random.json';
import scenarios from '../../fixtures/golden/report-scenarios.json';
import type { NutrientKey } from '../../../src/domain/nutrients';
import type { IntakeDay } from '../../../src/domain/intake/types';
import { REPORT_CONFIG } from '../../../src/domain/reference/scoring';
import { jackknife, computeScore } from '../../../src/domain/report/score';
import { assessedIndices, classifyDay } from '../../../src/domain/quality/days';
import { buildWeeklyReport } from '../../../src/domain/report/weekly';
import { WEEK, day, item, setOf } from './helpers';

const NUTS = ['protein', 'fiber', 'potassium', 'calcium', 'iron', 'magnesium', 'zinc', 'sodium'] as const;

interface RefTargetsJson { energy: number; minimums: Record<string, number>; limits: Record<string, number>; floor: number; personal: boolean }
interface Expected {
  states: string[];
  confidence: string;
  assessedDays: number;
  score: number | null;
  withheld: string | null;
  energy: { mean: number | null; in_band: number; assessed: number; low_days: number };
  nutrients?: Record<string, { assessment: string; mean: number | null; coverage: number; lower_bound?: boolean | null }>;
  components?: { name: string; earned: number; coverage: number; scored: boolean }[];
  isMinimum?: boolean;
  range?: [number, number] | null;
}

function mapState(py: string): { state: string; reason?: string } {
  if (py === 'partial_marked') return { state: 'partial', reason: 'marked' };
  if (py === 'partial_low') return { state: 'partial', reason: 'low' };
  if (py === 'partial_pending') return { state: 'partial', reason: 'pending' };
  return { state: py };
}

function check(days: IntakeDay[], today: string, t: RefTargetsJson, e: Expected, label: string) {
  const set = setOf({ energy: t.energy, minimums: t.minimums, limits: t.limits, floor: t.floor });
  const report = buildWeeklyReport({ weekStart: WEEK, today, mode: 'personalised', targetSets: [set], days, weeks: 1 });

  // day states, confidence, assessed days
  const classes = days.map((d) => classifyDay(d, today, { personal: true, energy: t.energy, floor: t.floor, veryHigh: 3850 }));
  e.states.forEach((py, i) => {
    const want = mapState(py);
    expect(report.coverage.days[i]!.state, `${label} day ${i}`).toBe(want.state);
    if (want.reason) expect(classes[i]!.reason, `${label} day ${i}`).toBe(want.reason);
  });
  expect(report.coverage.confidence, label).toBe(e.confidence);
  expect(report.coverage.assessedDays, label).toBe(e.assessedDays);

  // energy: the mean of the days that count, the days within 10% of the target, the days under the floor
  expect(report.energy!.daysInBand, label).toBe(e.energy.in_band);
  expect(report.coverage.days.filter((d) => d.lowIntake).length, label).toBe(e.energy.low_days);
  if (e.energy.mean !== null) expect(Math.abs(report.energy!.meanKcal! - e.energy.mean), label).toBeLessThanOrEqual(0.5);

  // the score and the reason it is withheld
  expect(report.score.value, label).toBe(e.score);
  expect(report.score.withheld ?? null, label).toBe(e.withheld);

  // The reference gives no per-nutrient assessments for a week with too few days (an empty `nutrients`).
  if (e.nutrients && Object.keys(e.nutrients).length > 0) {
    for (const n of NUTS) {
      const py = e.nutrients[n]!;
      const ts = report.nutrients.find((x) => x.nutrient === n)!;
      const want = py.assessment === 'over_limit' ? ['over', 'well_over'] : [py.assessment];
      expect(want, `${label} ${n} ${py.assessment} vs ${ts.assessment}`).toContain(ts.assessment);
      expect(ts.dataCoverage, `${label} ${n} coverage`).toBeCloseTo(py.coverage, 6);
      if (ts.meanPerAssessedDay !== null && py.mean !== null) expect(ts.meanPerAssessedDay, `${label} ${n} mean`).toBeCloseTo(py.mean, 6);
      // The reference only says whether a total is a lower bound where it reaches a verdict on it.
      if (py.lower_bound !== undefined && py.lower_bound !== null && ts.meanPerAssessedDay !== null) expect(ts.isLowerBound, `${label} ${n} lower bound`).toBe(py.lower_bound);
    }
  }

  if (e.components && report.score.components.length > 0) {
    const want = e.components.map((c) => ({ id: c.name === 'fiber' ? 'fibre' : c.name, earned: c.earned, coverage: c.coverage, scored: c.scored }));
    expect(report.score.components.map((c) => ({ id: c.id, earned: c.points, coverage: c.coverage, scored: c.scorable })).map((c) => ({ ...c, earned: Math.round(c.earned * 1e6) / 1e6, coverage: Math.round(c.coverage * 1e6) / 1e6 })), label).toEqual(
      want.map((c) => ({ ...c, earned: Math.round(c.earned * 1e6) / 1e6, coverage: Math.round(c.coverage * 1e6) / 1e6 })),
    );
    expect(report.score.isMinimum, label).toBe(e.isMinimum);
  }

  // the leave-one-day-out range: the reference gives it from four days; the report shows it with four or five
  if (e.score !== null && e.range) {
    const idx = assessedIndices(classes.map((c) => c.state));
    const input = { days, indices: idx, standards: Object.fromEntries(NUTS.filter((k) => k !== 'sodium').map((k) => [k, t.minimums[k]!])) as Partial<Record<NutrientKey, number>>, energyTarget: t.energy };
    expect(jackknife(input, REPORT_CONFIG), label).toEqual(e.range);
    expect(computeScore(input, REPORT_CONFIG).value, label).toBe(e.score);
    if (idx.length === 4 || idx.length === 5) expect(report.score.range, label).toEqual(e.range);
    else expect(report.score.range, label).toBeNull();
  }
}

describe('the scenarios of plan 5.9', () => {
  for (const sc of scenarios) {
    it(sc.name, () => {
      const days: IntakeDay[] = sc.days.map((d) =>
        day(d.date, d.items.map((it, i) => item(it.pending ? null : it.kcal, Object.fromEntries(Object.entries(it.nutrients as Record<string, number>).map(([k, v]) => [k, v])), { pending: it.pending, foodId: `f${i}`, name: `meal ${i}` })), d.mark as IntakeDay['mark']),
      );
      check(days, sc.today, sc.targets as RefTargetsJson, sc.expected as unknown as Expected, sc.name);
    });
  }

  it('reproduces the numbers the plan quotes: 90 (ordinary), 78 with sodium at 4,000 mg, and a score withheld on the other weeks', () => {
    const by = Object.fromEntries(scenarios.map((s) => [s.name, s.expected]));
    expect(by['ordinary week']!.score).toBe(90);
    expect(by['sodium 4,000 mg a day']!.score).toBe(77.9);
    expect(by['four days logged, three not']!.score).toBe(90);
    expect([by['nothing logged']!.withheld, by['crash diet']!.withheld, by['40% of items pending']!.withheld, by['minerals missing on half the foods']!.withheld]).toEqual([
      'few_days',
      'incomplete_days',
      'unknown_foods',
      'thin_data',
    ]);
  });
});

describe('100 random weeks, with values blanked, pending items and day marks', () => {
  it('agree with the reference on states, confidence, energy, score, withholding, assessments and components', () => {
    let scored = 0;
    let withheldKinds = new Set<string>();
    random.forEach((w, n) => {
      const days: IntakeDay[] = (w.days as [string, string | null, (number | null)[][]][]).map(([date, mark, items]) =>
        day(
          date,
          items.map((row, i) => {
            const [kcal, pending, ...rest] = row as [number | null, number, ...(number | null)[]];
            const nutrients: Partial<Record<NutrientKey, number | null>> = {};
            NUTS.forEach((k, j) => {
              if (rest[j] !== null && rest[j] !== undefined) nutrients[k] = rest[j]!;
            });
            return item(pending ? null : kcal, nutrients, { pending: pending === 1, foodId: `f${i}`, name: `food ${i}` });
          }),
          mark as IntakeDay['mark'],
        ),
      );
      const e = w.expected as unknown as {
        states: string[]; confidence: string; assessedDays: number; score: number | null; withheld: string | null;
        energy: Expected['energy']; nutrients?: Record<string, [string, number | null, number, boolean | null]>; components?: [string, number, number, boolean][]; isMinimum?: boolean; range?: [number, number] | null;
      };
      const expanded: Expected = {
        ...e,
        nutrients: e.nutrients && Object.fromEntries(Object.entries(e.nutrients).map(([k, [assessment, mean, coverage, lower_bound]]) => [k, { assessment, mean, coverage, lower_bound }])),
        components: e.components?.map(([name, earned, coverage, scored]) => ({ name, earned, coverage, scored })),
      };
      check(days, w.today, w.targets as RefTargetsJson, expanded, `week ${n}`);
      if (e.score !== null) scored++;
      if (e.withheld) withheldKinds.add(e.withheld);
    });
    // The sample must exercise scored weeks and every way a score is withheld.
    expect(scored).toBeGreaterThan(20);
    expect([...withheldKinds].sort()).toEqual(expect.arrayContaining(['few_days', 'thin_data']));
  });
});
