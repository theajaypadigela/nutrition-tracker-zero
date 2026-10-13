/**
 * How much of a nutrient is known (WEEKLY_BREAKDOWN_PLAN.md 7.3): the share of logged energy that comes from foods with a value,
 * and for a limit the lower of that and the share of items, so a pickle's sodium is not hidden behind a main meal's calories.
 * Coverage says how far a total can be trusted; the report decides what a total may then prove (the lower-bound rule).
 */
import type { NutrientTotals } from '../intake/totals';

export const energyCoverage = (t: NutrientTotals): number => (t.energyAll > 0 ? t.energyKnown / t.energyAll : 0);
export const itemCoverage = (t: NutrientTotals): number => (t.itemsAll > 0 ? t.itemsKnown / t.itemsAll : 0);

/** Coverage of a nutrient: energy share, and for a limit the lower of that and the item share (plan 7.3). */
export function coverageOf(t: NutrientTotals, isLimit: boolean): number {
  return isLimit ? Math.min(energyCoverage(t), itemCoverage(t)) : energyCoverage(t);
}
