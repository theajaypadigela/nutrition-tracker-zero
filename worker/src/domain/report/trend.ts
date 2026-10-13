/**
 * Small pieces of arithmetic for trends and history (WEEKLY_BREAKDOWN_PLAN.md 5.5, 5.7): the weeks of a
 * history, means and spreads, and the rule that a change only reads as higher or lower when it exceeds
 * the noise. The weight smoother of Phase 5 lives here too.
 */
import { addDays } from '../time';
import type { NutrientTrend } from './types';

/** The Mondays of `count` weeks, oldest first, ending with `lastWeekStart`. */
export function weekStarts(lastWeekStart: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(lastWeekStart, -7 * (count - 1 - i)));
}

export const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Population standard deviation. */
export function stdev(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/**
 * How `current` compares with earlier values. It is "about the same" unless the difference exceeds the
 * larger of `minBand` and one standard deviation of the earlier values [A]; and it needs at least `minPrevious`
 * earlier values to say anything at all.
 */
export function compareWithPrevious(
  current: number,
  previous: readonly number[],
  opts: { minBand: number; minPrevious?: number },
): 'higher' | 'lower' | 'about_the_same' | null {
  if (previous.length < (opts.minPrevious ?? 2)) return null;
  const band = Math.max(opts.minBand, stdev(previous));
  const diff = current - mean(previous);
  return diff > band ? 'higher' : diff < -band ? 'lower' : 'about_the_same';
}

/**
 * The noise band around a nutrient's earlier weekly means: the larger of 10% of their mean and one
 * standard deviation [A]. A later mean has to clear it to read as a real change.
 */
export function noiseBandOf(weeklyMeans: readonly number[]): { mean: number; band: number } | null {
  if (weeklyMeans.length < 3) return null;
  const m = mean(weeklyMeans);
  return { mean: m, band: Math.max(0.1 * m, stdev(weeklyMeans)) };
}

/**
 * A week's daily average against the earlier weeks' (plan 5.7): higher or lower only past the noise band of `noiseBandOf`, and
 * nothing at all with fewer than three earlier weeks to compare with.
 */
export function trendAgainst(current: number, earlier: readonly number[]): NutrientTrend | null {
  const band = noiseBandOf(earlier);
  if (!band) return null;
  const diff = current - band.mean;
  return { direction: diff > band.band ? 'higher' : diff < -band.band ? 'lower' : 'about_the_same', previousMean: band.mean, weeks: earlier.length };
}
