/**
 * The weight line, the plan check, the rapid-loss notice and the experimental calibration inside the weekly report (WEEKLY_BREAKDOWN_PLAN.md
 * 4.9, 5.6, 5.7, 8.2, Phase 5).
 */
import { describe, expect, it } from 'vitest';
import { addDays } from '../../../src/domain/time';
import { buildWeeklyReport } from '../../../src/domain/report/weekly';
import type { IntakeDay } from '../../../src/domain/intake/types';
import { computeTargets } from '../../../src/domain/targets/engine';
import type { HealthProfileInput } from '../../../src/domain/targets/types';
import { WEEK, dates, day, usual } from './helpers';

const TODAY = '2026-10-12';
const HEAVY: HealthProfileInput = { birthYear: 1990, birthMonth: 6, sexForCalc: 'female', heightCm: 165, weightKg: 85, activity: 'low_active', goal: 'lose', pace: 'standard', pattern: 'omnivore', referenceSet: 'nasem' };
const SET_LOSE = { ...computeTargets(HEAVY, '2026-08-01'), id: 'ts_lose', effectiveFrom: '2026-08-01' };
const SET_KEEP = { ...computeTargets({ ...HEAVY, goal: 'maintain' }, '2026-08-01'), id: 'ts_keep', effectiveFrom: '2026-08-01' };

/** Four weeks of food as usual, so the days all count. */
const eaten = (): IntakeDay[] => Array.from({ length: 28 }, (_, i) => usual(addDays(WEEK, i - 21)));
/** One weigh-in a day for `days` days up to the end of the week (Sunday 11 October), from a function of days before the end. */
const weighIns = (days: number, f: (daysBefore: number) => number) => Array.from({ length: days }, (_, i) => ({ date: addDays(addDays(WEEK, 6), -(days - 1 - i)), weightKg: f(days - 1 - i) }));
const report = (over: Partial<Parameters<typeof buildWeeklyReport>[0]> = {}) =>
  buildWeeklyReport({ weekStart: WEEK, today: TODAY, weeks: 1, mode: 'personalised', targetSets: [SET_LOSE], days: eaten(), goal: 'lose', ...over });

describe('the weight line of the weekly view (plan 5.7)', () => {
  it('has the weigh-ins with their trend, the latest weight, and no rate until there is enough to say one', () => {
    const r = report({ weights: weighIns(10, (b) => 85 + b * 0.1) });
    expect(r.weight).toMatchObject({ latest: { date: addDays(WEEK, 6), weightKg: 85 }, weighIns: 10, ratePerWeekKg: null, plan: null });
    expect(r.weight!.points).toHaveLength(10);
    expect(r.weight!.points[0]).toMatchObject({ weightKg: 85.9 });
    expect(r.weight!.points.every((p) => typeof p.trendKg === 'number')).toBe(true);
    expect(r.weight!.noiseBandKg).toBeCloseTo(0.3, 1);
  });

  it('says a rate once there are three weeks and six weigh-ins', () => {
    const r = report({ weights: weighIns(29, (b) => 85 + b * 0.07) });
    expect(r.weight!.ratePerWeekKg).toBeLessThan(0);
    expect(r.weight!.ratePerWeekKg!).toBeGreaterThan(-0.7);
  });

  it('is the weight as of the end of the reported week: a later weigh-in is not in a past week', () => {
    const later = [...weighIns(10, () => 85), { date: addDays(WEEK, 9), weightKg: 99 }];
    const r = report({ weights: later });
    expect(r.weight!.latest.weightKg).toBe(85);
    expect(r.weight!.points.map((p) => p.date)).not.toContain(addDays(WEEK, 9));
  });

  it('keeps twelve weeks of points at most', () => {
    const r = report({ weights: Array.from({ length: 120 }, (_, i) => ({ date: addDays(addDays(WEEK, 6), -i), weightKg: 85 })) });
    expect(r.weight!.points.length).toBeLessThanOrEqual(85);
    expect(r.weight!.points[0]!.date >= addDays(addDays(WEEK, 6), -84)).toBe(true);
  });

  it('is null without weigh-ins, and in every mode that keeps none', () => {
    expect(report().weight).toBeNull();
    expect(report({ mode: 'generic', targetSets: [], weights: weighIns(10, () => 85) }).weight).toBeNull();
    expect(report({ mode: 'reference_only', targetSets: [], weights: weighIns(10, () => 85) }).weight).toBeNull();
  });

  it('is hidden in low-pressure mode, with no weight anywhere in the payload', () => {
    const r = report({ numbersHidden: true, weights: weighIns(29, (b) => 85 + b * 0.07) });
    expect(r.weight).toBeNull();
    expect(r.calibration).toBeNull();
    expect(JSON.stringify(r)).not.toMatch(/weightKg|trendKg|noiseBandKg/);
  });
});

describe('the trend against the plan: weight_vs_plan (plan 4.9, 5.6)', () => {
  it('says what the trend did and what the plan expects, as information, for a plan that asks for a change', () => {
    const r = report({ weights: weighIns(29, (b) => 85 + b * 0.05) });
    expect(r.weight!.plan).toMatchObject({ weeks: 4 });
    expect(r.weight!.plan!.observedKg).toBeLessThan(0);
    expect(r.weight!.plan!.expectedKg.low).toBeLessThan(0);
    const i = r.insights.find((x) => x.id === 'weight_vs_plan')!;
    expect(i).toMatchObject({ priority: 3, params: { w: 4, d: r.weight!.plan!.observedKg } });
    expect(i.params.e).toBeCloseTo((r.weight!.plan!.expectedKg.low + r.weight!.plan!.expectedKg.high) / 2, 1);
  });

  it('needs three weeks and six weigh-ins', () => {
    const r = report({ weights: weighIns(10, (b) => 85 + b * 0.05) });
    expect(r.weight!.plan).toBeNull();
    expect(r.insights.map((x) => x.id)).not.toContain('weight_vs_plan');
  });

  it('is not for a plan that asks for no change', () => {
    const r = report({ targetSets: [SET_KEEP], goal: 'maintain', weights: weighIns(29, (b) => 85 + b * 0.05) });
    expect(r.weight!.plan).toBeNull();
    expect(r.insights.map((x) => x.id)).not.toContain('weight_vs_plan');
  });
});

describe('weight falling faster than is usual: rapid_loss (plan 5.6)', () => {
  const fast = weighIns(42, (b) => 85 + b * 0.25);

  it('is a safety message: the first insight, with no numbers in it', () => {
    const r = report({ weights: fast });
    expect(r.insights[0]).toEqual({ id: 'rapid_loss', priority: 1, params: {} });
  });

  it('does not fire for the usual rate, or for a gain', () => {
    expect(report({ weights: weighIns(42, (b) => 85 + b * 0.07) }).insights.map((x) => x.id)).not.toContain('rapid_loss');
    expect(report({ weights: weighIns(42, (b) => 85 - b * 0.1) }).insights.map((x) => x.id)).not.toContain('rapid_loss');
  });

  it('still fires with numbers hidden, worded without any, and the weight itself stays out of the report', () => {
    const r = report({ numbersHidden: true, weights: fast });
    expect(r.insights[0]).toEqual({ id: 'rapid_loss', priority: 1, params: {} });
    expect(r.insights.every((x) => Object.keys(x.params).length === 0)).toBe(true);
    expect(r.insights.map((x) => x.id)).not.toContain('weight_vs_plan');
    expect(r.weight).toBeNull();
  });

  it('is not run without personal targets', () => {
    expect(report({ mode: 'generic', targetSets: [], weights: fast }).insights.map((x) => x.id)).not.toContain('rapid_loss');
  });
});

describe('the experimental calibration (plan 4.9)', () => {
  const steady = weighIns(29, () => 85);
  it('is off unless the flag is on, and then needs four weeks of logs and weigh-ins', () => {
    expect(report({ weights: steady }).calibration).toBeNull();
    const on = report({ weights: steady, config: { calibration: true } }).calibration!;
    expect(on).toMatchObject({ uncertaintyKcal: 110, currentKcal: SET_LOSE.energy!.maintenance, days: 28 });
    expect(on.suggestedKcal).toBe(Math.round(1800 / 50) * 50); // a steady weight on 1,800 kcal of logged food a day
    expect(report({ weights: weighIns(10, () => 85), config: { calibration: true } }).calibration).toBeNull();
  });

  it('is never a target: the set in force and every target are unchanged', () => {
    const before = JSON.stringify(report({ weights: steady }).nutrients);
    const after = JSON.stringify(report({ weights: steady, config: { calibration: true } }).nutrients);
    expect(after).toBe(before);
  });

  it('is not shown in low-pressure mode or without personal targets', () => {
    expect(report({ weights: steady, numbersHidden: true, config: { calibration: true } }).calibration).toBeNull();
    expect(report({ mode: 'generic', targetSets: [], weights: steady, config: { calibration: true } }).calibration).toBeNull();
  });

  it('needs the logs to be mostly complete: too few counted days give nothing', () => {
    const sparse = eaten().map((d, i) => (i % 3 === 0 ? day(d.date) : d));
    expect(report({ days: sparse, weights: steady, config: { calibration: true } }).calibration).toBeNull();
  });
});

describe('the dates of the week the report is about', () => {
  it('has seven days from the Monday', () => expect(dates).toHaveLength(7));
});
