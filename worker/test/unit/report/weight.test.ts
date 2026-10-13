/**
 * Weight over time (WEEKLY_BREAKDOWN_PLAN.md 4.9, 5.6, 5.7, Phase 5): the smoothed trend, a rate only when there is enough to say one, the trend
 * against the plan, the rapid-loss safety signal and the experimental calibration.
 */
import { describe, expect, it } from 'vitest';
import { addDays } from '../../../src/domain/time';
import { WEIGHT_CONFIG, calibrate, checkAgainstPlan, isRapidLoss, summariseWeight, weightTrend, type WeightEntry } from '../../../src/domain/report/weight';

const START = '2026-09-01';
/** One weigh-in a day from START, from a function of the day number. */
const daily = (days: number, f: (i: number) => number): WeightEntry[] => Array.from({ length: days }, (_, i) => ({ date: addDays(START, i), weightKg: f(i) }));

describe('the trend', () => {
  it('starts at the first weight and closes a tenth of the gap each day', () => {
    const t = weightTrend([{ date: START, weightKg: 70 }, { date: addDays(START, 1), weightKg: 71 }, { date: addDays(START, 2), weightKg: 71 }]);
    expect(t.map((p) => p.trendKg)).toEqual([70, 70.1, 70.19]);
  });

  it('is flat for a steady weight, whatever the length of the series', () => {
    expect(weightTrend(daily(30, () => 62.5)).every((p) => p.trendKg === 62.5)).toBe(true);
  });

  it('is not moved by one day\'s water: a 1.5 kg spike moves the trend by 0.15 kg', () => {
    const t = weightTrend(daily(20, (i) => (i === 10 ? 71.5 : 70)));
    expect(t[10]!.trendKg).toBeCloseTo(70.15, 9);
    expect(t[19]!.trendKg).toBeGreaterThan(70);
    expect(t[19]!.trendKg).toBeLessThan(70.1);
  });

  it('follows a real change, and trails it', () => {
    const t = weightTrend(daily(60, (i) => 80 - i * 0.05)); // 0.05 kg a day down
    const last = t[59]!;
    expect(last.weightKg).toBeCloseTo(77.05, 9);
    expect(last.trendKg).toBeGreaterThan(last.weightKg);
    expect(last.trendKg).toBeLessThan(80);
  });

  it('treats a gap of days as that many days of the same pull: weighing weekly follows the daily line', () => {
    const weekly = weightTrend([{ date: START, weightKg: 70 }, { date: addDays(START, 7), weightKg: 72 }]);
    expect(weekly[1]!.trendKg).toBeCloseTo(70 + (1 - 0.9 ** 7) * 2, 9);
    const dailyEquivalent = weightTrend([{ date: START, weightKg: 70 }, ...Array.from({ length: 7 }, (_, i) => ({ date: addDays(START, i + 1), weightKg: 72 }))]);
    expect(dailyEquivalent[7]!.trendKg).toBeCloseTo(weekly[1]!.trendKg, 9);
  });

  it('sorts, and keeps one weight a day (the later entry for a date wins)', () => {
    const t = weightTrend([{ date: addDays(START, 2), weightKg: 70 }, { date: START, weightKg: 70 }, { date: START, weightKg: 71 }]);
    expect(t.map((p) => p.date)).toEqual([START, addDays(START, 2)]);
    expect(t[0]!.weightKg).toBe(71);
  });

  it('is empty without weigh-ins', () => expect(weightTrend([])).toEqual([]));
});

describe('the summary and the rate (plan 5.7)', () => {
  it('has no rate before three weeks and six weigh-ins', () => {
    expect(summariseWeight(weightTrend(daily(10, () => 70)))!.ratePerWeekKg).toBeNull();
    expect(summariseWeight(weightTrend(daily(21, () => 70)))!.ratePerWeekKg).toBeNull(); // 21 weigh-ins span 20 days: not yet three weeks
    expect(summariseWeight(weightTrend(daily(22, () => 70)))!.ratePerWeekKg).toBe(0);
  });

  it('needs the span as well as the count: six weigh-ins in a week are not three weeks', () => {
    const p = weightTrend([0, 1, 2, 3, 4, 5, 6].map((i) => ({ date: addDays(START, i), weightKg: 70 - i * 0.2 })));
    expect(summariseWeight(p)!.ratePerWeekKg).toBeNull();
  });

  it('says a rate, in kg a week from the trend, once there is enough', () => {
    const s = summariseWeight(weightTrend(daily(29, (i) => 80 - i * 0.1)))!;
    expect(s.ratePerWeekKg).toBeLessThan(0);
    expect(s.ratePerWeekKg!).toBeGreaterThan(-0.7);
    expect(s.ratePerWeekKg!).toBeLessThan(-0.4);
    expect(s.latest).toEqual({ date: addDays(START, 28), weightKg: 77.2 });
  });

  it('gives a steady weight a rate of nothing, and the scale\'s ordinary swing as its noise band', () => {
    const s = summariseWeight(weightTrend(daily(35, () => 70)))!;
    expect(s.ratePerWeekKg).toBe(0);
    expect(s.noiseBandKg).toBe(0.25); // 0.35% of 70 kg is 0.245, to two places
    expect(s.weighIns).toBe(35);
  });

  it('is null without weigh-ins', () => expect(summariseWeight([])).toBeNull());
});

describe('the trend against the plan (plan 4.9)', () => {
  const lose = (rate: number) => weightTrend(daily(29, (i) => 90 - i * rate));
  it('expects the dynamic model\'s range for the plan\'s daily change, over the weeks the trend covers', () => {
    const c = checkAgainstPlan(lose(0.05), { deltaKcal: -470 })!;
    expect(c.weeks).toBe(4);
    // 470 / 24 and 470 / 20 kg eventually, approached over 28 days: (1 - exp(-28/500)) = 0.0545
    expect(c.expectedKg).toEqual({ low: -1.1, high: -1.3 });
    expect(c.observedKg).toBeLessThan(0);
  });
  it('expects a gain for a surplus, with the other sign', () => {
    const c = checkAgainstPlan(weightTrend(daily(29, (i) => 60 + i * 0.03)), { deltaKcal: 300 })!;
    expect(c.expectedKg.low).toBeGreaterThan(0);
    expect(c.observedKg).toBeGreaterThan(0);
  });
  it('says nothing for a plan that asks for no change, and nothing without three weeks and six weigh-ins', () => {
    expect(checkAgainstPlan(lose(0.05), { deltaKcal: 0 })).toBeNull();
    expect(checkAgainstPlan(weightTrend(daily(10, (i) => 90 - i * 0.05)), { deltaKcal: -470 })).toBeNull();
  });
});

describe('weight falling faster than is usual (plan 5.6)', () => {
  it('is true when the trend has dropped by more than 1% of body weight a week, on average, over two weeks', () => {
    // 1.2 kg a week for a 70 kg person is 1.7%; the trend lags the weights, so run it long enough to catch up
    const fast = weightTrend(daily(42, (i) => 80 - i * 0.2));
    expect(isRapidLoss(fast)).toBe(true);
  });
  it('is false for the usual 0.5% a week, and for a steady weight', () => {
    expect(isRapidLoss(weightTrend(daily(42, (i) => 80 - i * 0.055)))).toBe(false); // about 0.5% a week
    expect(isRapidLoss(weightTrend(daily(42, () => 80)))).toBe(false);
  });
  it('is false for a gain, and without three weigh-ins in the fortnight', () => {
    expect(isRapidLoss(weightTrend(daily(42, (i) => 60 + i * 0.2)))).toBe(false);
    const sparse = weightTrend([0, 1, 20, 40].map((i) => ({ date: addDays(START, i), weightKg: 80 - i * 0.3 })));
    expect(isRapidLoss(sparse)).toBe(false);
  });
  it('is false when the series starts inside the fortnight: there is nothing to compare with', () => {
    expect(isRapidLoss(weightTrend(daily(10, (i) => 80 - i * 0.5)))).toBe(false);
  });
});

describe('the experimental calibration (plan 4.9)', () => {
  const points = weightTrend(daily(29, () => 70));
  const base = { points, meanIntakeKcal: 2000, assessedDays: 24, lowIntakeDays: 0, currentKcal: 2150 };
  it('suggests the logged intake when the weight is steady, to the nearest 50 kcal, with its uncertainty', () => {
    expect(calibrate({ ...base, meanIntakeKcal: 1980 })).toEqual({ suggestedKcal: 2000, currentKcal: 2150, uncertaintyKcal: 110, days: 28 });
  });
  it('suggests more when the weight fell on that intake, and less when it rose', () => {
    const falling = weightTrend(daily(29, (i) => 70 - i * 0.05)); // about 1.4 kg down in four weeks, 0.5 kg of it in the trend's lag
    const up = calibrate({ ...base, points: falling })!;
    expect(up.suggestedKcal).toBeGreaterThan(2000);
    const rising = weightTrend(daily(29, (i) => 70 + i * 0.05));
    expect(calibrate({ ...base, points: rising })!.suggestedKcal).toBeLessThan(2000);
  });
  it('needs four weeks of mostly complete logs, six weigh-ins and no low-intake notice', () => {
    expect(calibrate({ ...base, assessedDays: 19 })).toBeNull();
    expect(calibrate({ ...base, lowIntakeDays: 3 })).toBeNull();
    expect(calibrate({ ...base, meanIntakeKcal: null })).toBeNull();
    expect(calibrate({ ...base, points: weightTrend(daily(10, () => 70)) })).toBeNull();
    expect(calibrate({ ...base, points: [] })).toBeNull();
  });
  it('is configured in one place', () => {
    expect(WEIGHT_CONFIG.calibration).toMatchObject({ minAssessedDays: 20, kcalPerKg: 7700, uncertaintyKcal: 110 });
  });
});
