/**
 * Assessing one nutrient over the days that count (WEEKLY_BREAKDOWN_PLAN.md 5.4, 7.1, 7.3): the report's comparison of what
 * was logged (the totals of ../intake) with a target (../targets), as far as the data allows (the coverage of ../quality). Two
 * rules shape it. Unknown is never zero: a nutrient some foods have no value for is a LOWER BOUND, which can prove "over a
 * limit" or "enough" but never "below" or "within". And no verdict is graded: there is no "bad", only neutral words.
 */
import { REPORT_CONFIG, type ReportConfig } from '../reference/scoring';
import { ENERGY_SHARE, type NutrientKey } from '../nutrients';
import { AMDR } from '../reference/nasem';
import type { Target } from '../targets/types';
import type { Assessment } from './types';

/** Inclusive-edge ratio comparison, immune to float noise at the boundary (2200 / 2000 against 1.1). */
const EPS = 1e-9;

/**
 * The share of energy a `range` target is judged by: the one the target carries (its reference set's own), or the National
 * Academies' for a target made before it carried one.
 */
export function shareRangeOf(target: Target, nutrient: NutrientKey): { low: number; high: number } | null {
  if (target.shareRange) return target.shareRange;
  return nutrient === 'fat' ? AMDR.fat : nutrient === 'carbs' ? AMDR.carbs : null;
}

export interface AssessInput {
  target: Target | null;
  /** Mean per assessed day of the known amounts (kcal for energy). */
  mean: number;
  /** For `range` nutrients: the known energy share of what was logged (0 to 1), the lower bound when partial. */
  share?: number;
  coverage: number;
  assessedDays: number;
  /** Amounts only: a medicine that interacts with food, or no target. */
  verdicts: boolean;
  nutrient: NutrientKey;
}

export interface Assessed {
  assessment: Assessment;
  /** null when coverage is too low to say anything. */
  mean: number | null;
  isLowerBound: boolean;
}

/**
 * The assessment of a nutrient (plan 5.4). Standing rules: with fewer assessed days there is nothing to
 * say; with no target or with verdicts off the amount is shown, not judged; under half coverage there
 * is not enough data, except that a lower bound which already settles the question (a minimum met, a
 * limit exceeded) is still reported, as such.
 */
export function assessNutrient(input: AssessInput, cfg: ReportConfig = REPORT_CONFIG): Assessed {
  const { target, mean, coverage, assessedDays, share } = input;
  const complete = coverage >= cfg.coverageComplete;
  const lowerBound = !complete;
  if (assessedDays === 0) return { assessment: 'unknown', mean: null, isLowerBound: false };
  if (!target || !input.verdicts) return { assessment: 'amount_only', mean: coverage < cfg.coveragePartial ? null : mean, isLowerBound: lowerBound };
  const value = target.value;
  const unknownMean = coverage < cfg.coveragePartial ? null : mean;

  switch (target.kind) {
    case 'limit': {
      // A lower bound already above the limit proves "over", at any coverage.
      if (mean > value * (1 + EPS)) {
        return { assessment: mean > value * cfg.wellOverRatio * (1 + EPS) ? 'well_over' : 'over', mean, isLowerBound: lowerBound };
      }
      return { assessment: complete ? 'meets' : 'unknown', mean: unknownMean, isLowerBound: lowerBound };
    }
    case 'range': {
      const edges = ENERGY_SHARE[input.nutrient];
      const amdr = shareRangeOf(target, input.nutrient);
      if (!edges || !amdr || share === undefined) return { assessment: 'amount_only', mean: unknownMean, isLowerBound: lowerBound };
      // A known share already above the range proves it; inside or below proves nothing on partial data.
      if (share > amdr.high + EPS) return { assessment: 'outside', mean, isLowerBound: lowerBound };
      if (!complete) return { assessment: 'unknown', mean: unknownMean, isLowerBound: true };
      return { assessment: share >= amdr.low - EPS ? 'in_range' : 'outside', mean, isLowerBound: false };
    }
    case 'energy': {
      if (!complete) return { assessment: 'unknown', mean: unknownMean, isLowerBound: true };
      const ratio = mean / value;
      return { assessment: Math.abs(ratio - 1) <= cfg.energyBand + EPS ? 'meets' : ratio > 1 ? 'over' : 'below', mean, isLowerBound: false };
    }
    default: {
      // A minimum: a lower bound that already reaches 90% settles it.
      const ratio = mean / value;
      if (ratio >= cfg.meetsRatio - EPS) return { assessment: 'meets', mean, isLowerBound: lowerBound };
      if (!complete) return { assessment: 'unknown', mean: unknownMean, isLowerBound: true };
      return { assessment: ratio >= cfg.closeRatio - EPS ? 'close' : 'below', mean, isLowerBound: false };
    }
  }
}

/** Whether one day meets a target, by the same rule as the week, for "N of M days" (plan 5.4). */
export function dayMeets(args: { target: Target; value: number; complete: boolean; share?: number; nutrient: NutrientKey }, cfg: ReportConfig = REPORT_CONFIG): boolean {
  const { target, value, complete, share, nutrient } = args;
  switch (target.kind) {
    case 'limit':
      return complete && value <= target.value * (1 + EPS);
    case 'range': {
      const amdr = shareRangeOf(target, nutrient);
      return !!amdr && share !== undefined && complete && share >= amdr.low - EPS && share <= amdr.high + EPS;
    }
    case 'energy':
      return complete && Math.abs(value / target.value - 1) <= cfg.energyBand + EPS;
    default:
      return value >= target.value * cfg.meetsRatio - EPS;
  }
}
