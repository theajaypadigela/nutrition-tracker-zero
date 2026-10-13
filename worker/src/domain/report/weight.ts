/**
 * Weight over time (WEEKLY_BREAKDOWN_PLAN.md 4.9, 5.7, 6.2, Phase 5): a smoothed trend so one day's water does not move the line, a rate only
 * when there is enough to say one, a check of the trend against what the plan expects, a safety signal for weight falling faster than is
 * usual, and, behind a flag, an experimental suggestion from logged intake and the trend. Pure functions of the weigh-ins.
 *
 * The smoothing is the Hacker's Diet one: each day pulls the trend a tenth of the way toward that day's weight [A]. It is not validated as a
 * trend estimator (1.5). Nothing here is shown as a verdict: a number and, where the data allows, a range.
 */
import { addDays, daysBetween } from '../time';
import { projectWeightChange } from '../targets/goal';

export interface WeightEntry {
  date: string;
  weightKg: number;
}

export interface TrendPoint extends WeightEntry {
  trendKg: number;
}

export interface WeightConfig {
  /** The share of the gap to today's weight the trend closes each day [A]. */
  trendShare: number;
  /** A Monday-to-Friday swing of about 0.35% of body weight is ordinary (plan 5.7). */
  noiseShare: number;
  /** A rate is shown only with at least this many weeks and weigh-ins (plan 5.7). */
  rateMinWeeks: number;
  rateMinWeighIns: number;
  /** The window a rate and a plan check look back over, in days. */
  windowDays: number;
  /** The trend falling faster than this share of body weight a week, for two weeks, is more than is usual (plan 5.6). */
  rapidLossShare: number;
  rapidLossDays: number;
  rapidLossMinWeighIns: number;
  /** The experimental suggestion (plan 4.9): weeks of data it needs, the energy in a kilogram of body-weight change, and its error. */
  calibration: { minAssessedDays: number; minWeighIns: number; minSpanDays: number; kcalPerKg: number; uncertaintyKcal: number; roundTo: number };
}

export const WEIGHT_CONFIG: WeightConfig = {
  trendShare: 0.1,
  noiseShare: 0.0035,
  rateMinWeeks: 3,
  rateMinWeighIns: 6,
  windowDays: 28,
  rapidLossShare: 0.01,
  rapidLossDays: 14,
  rapidLossMinWeighIns: 3,
  calibration: { minAssessedDays: 20, minWeighIns: 6, minSpanDays: 21, kcalPerKg: 7700, uncertaintyKcal: 110, roundTo: 50 },
};

const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * The trend through the weigh-ins, oldest first. A gap of several days counts as that many days of the same pull, so weighing weekly
 * follows the same line as weighing daily. One weigh-in a day at most (later duplicates replace earlier ones).
 */
export function weightTrend(entries: readonly WeightEntry[], cfg: WeightConfig = WEIGHT_CONFIG): TrendPoint[] {
  const byDay = new Map<string, number>();
  for (const e of entries) byDay.set(e.date, e.weightKg);
  const sorted = [...byDay].map(([date, weightKg]) => ({ date, weightKg })).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const out: TrendPoint[] = [];
  for (const e of sorted) {
    const prev = out[out.length - 1];
    if (!prev) {
      out.push({ ...e, trendKg: e.weightKg });
      continue;
    }
    const days = Math.max(1, daysBetween(prev.date, e.date));
    const pull = 1 - (1 - cfg.trendShare) ** days;
    out.push({ ...e, trendKg: prev.trendKg + pull * (e.weightKg - prev.trendKg) });
  }
  return out;
}

export interface WeightSummary {
  latest: { date: string; weightKg: number };
  trendKg: number;
  /** kg a week, signed, from the trend; null until there are enough weeks and weigh-ins to say one. */
  ratePerWeekKg: number | null;
  /** About 0.35% of body weight: a change smaller than this is the scale's ordinary swing. */
  noiseBandKg: number;
  weighIns: number;
}

/** The weigh-ins in the window that ends at the last one, and how many days they span. */
function windowOf(points: readonly TrendPoint[], cfg: WeightConfig): { from: TrendPoint; to: TrendPoint; inside: TrendPoint[]; days: number } | null {
  const to = points[points.length - 1];
  if (!to) return null;
  const startDate = addDays(to.date, -cfg.windowDays);
  const inside = points.filter((p) => p.date >= startDate);
  const from = inside[0]!;
  return { from, to, inside, days: daysBetween(from.date, to.date) };
}

export function summariseWeight(points: readonly TrendPoint[], cfg: WeightConfig = WEIGHT_CONFIG): WeightSummary | null {
  const w = windowOf(points, cfg);
  if (!w) return null;
  const enough = w.days >= cfg.rateMinWeeks * 7 && w.inside.length >= cfg.rateMinWeighIns;
  return {
    latest: { date: w.to.date, weightKg: w.to.weightKg },
    trendKg: round2(w.to.trendKg),
    ratePerWeekKg: enough ? round2(((w.to.trendKg - w.from.trendKg) / w.days) * 7) : null,
    noiseBandKg: round2(cfg.noiseShare * w.to.trendKg),
    weighIns: points.length,
  };
}

export interface PlanCheck {
  /** Whole weeks the check looks over. */
  weeks: number;
  /** What the trend actually did over them, kg (negative is a loss). */
  observedKg: number;
  /** What the plan's daily energy change expects over the same days, kg, as a range (plan 4.9). */
  expectedKg: { low: number; high: number };
}

/**
 * The trend against the plan, "as information, with its uncertainty" (plan 4.9): only with enough weeks and weigh-ins, and only for a plan
 * that asks for a change. The expected change is the dynamic model's range, which excludes the first fortnight's water.
 */
export function checkAgainstPlan(points: readonly TrendPoint[], plan: { deltaKcal: number }, cfg: WeightConfig = WEIGHT_CONFIG): PlanCheck | null {
  const w = windowOf(points, cfg);
  if (!w || plan.deltaKcal === 0) return null;
  if (w.days < cfg.rateMinWeeks * 7 || w.inside.length < cfg.rateMinWeighIns) return null;
  const sign = plan.deltaKcal < 0 ? -1 : 1;
  const { lowKg, highKg } = projectWeightChange(plan.deltaKcal, w.days);
  return {
    weeks: Math.round(w.days / 7),
    observedKg: round1(w.to.trendKg - w.from.trendKg),
    expectedKg: { low: round1(sign * lowKg), high: round1(sign * highKg) },
  };
}

/** The trend has fallen faster than 1% of body weight a week, on average, over the last two weeks (plan 5.6, a safety signal). */
export function isRapidLoss(points: readonly TrendPoint[], cfg: WeightConfig = WEIGHT_CONFIG): boolean {
  const to = points[points.length - 1];
  if (!to) return false;
  const since = addDays(to.date, -cfg.rapidLossDays);
  const recent = points.filter((p) => p.date > since);
  if (recent.length < cfg.rapidLossMinWeighIns) return false;
  // The trend as it stood at the start of the window: the last weigh-in on or before it.
  const before = [...points].reverse().find((p) => p.date <= since);
  if (!before) return false;
  const dropPerWeek = ((before.trendKg - to.trendKg) / cfg.rapidLossDays) * 7;
  return dropPerWeek > cfg.rapidLossShare * to.trendKg;
}

export interface Calibration {
  /** The maintenance energy the logs and the trend suggest, to the nearest 50 kcal a day. */
  suggestedKcal: number;
  /** The maintenance estimate in force, for the comparison. */
  currentKcal: number;
  /** The error from weight noise alone, kcal a day; logged intake usually runs low, so the real figure is probably higher. */
  uncertaintyKcal: number;
  /** Days of logs and weigh-ins it rests on. */
  days: number;
}

/**
 * EXPERIMENTAL, behind a flag (plan 4.9): what the energy balance of the last four weeks suggests maintenance is, from the mean logged
 * intake and the change in the weight trend. There is no published validation of this, so it is never applied automatically, shown only after
 * at least four weeks of mostly complete logs, and said to be experimental. Under-reporting makes it read low.
 */
export function calibrate(args: {
  points: readonly TrendPoint[];
  meanIntakeKcal: number | null;
  assessedDays: number;
  lowIntakeDays: number;
  currentKcal: number;
  cfg?: WeightConfig;
}): Calibration | null {
  const cfg = args.cfg ?? WEIGHT_CONFIG;
  const c = cfg.calibration;
  const w = windowOf(args.points, cfg);
  if (!w || args.meanIntakeKcal === null) return null;
  if (w.days < c.minSpanDays || w.inside.length < c.minWeighIns) return null;
  if (args.assessedDays < c.minAssessedDays || args.lowIntakeDays >= 3) return null;
  const balance = ((w.to.trendKg - w.from.trendKg) * c.kcalPerKg) / w.days; // kcal a day above (+) or below (−) what was spent
  const estimated = args.meanIntakeKcal - balance;
  return { suggestedKcal: Math.round(estimated / c.roundTo) * c.roundTo, currentKcal: args.currentKcal, uncertaintyKcal: c.uncertaintyKcal, days: w.days };
}
