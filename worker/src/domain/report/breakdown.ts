/**
 * "Which foods added up to this number?": the logged items behind one nutrient's total, each with what it contributed. Pure, and shared:
 * the Worker answers `GET /reports/breakdown` with it for any span of days, and the app builds the same list from a day it already has,
 * so the list, the dashboard and the report can only ever agree.
 *
 * The rules are the dashboard's, not new ones. An item's amount is the nutrient value its food gives for the quantity logged, rounded to
 * two decimals (domain/intake/items.ts). The total is the sum of the amounts that are known, rounded to two decimals again, exactly as
 * `sumNutrients` totals a day and `buildRangeReport` totals a range. An item with no value for the nutrient (a food that does not say, or
 * an item still waiting for its food or its unit) adds nothing and is counted, never read as zero: the total is then a minimum.
 */
import { round, type NutrientKey, type NutrientValues } from '../nutrients';

/** One logged item, with its nutrients already worked out from its food. */
export interface BreakdownInput {
  id: string;
  date: string;
  meal: string | null;
  /** What the person called it. */
  rawName: string;
  /** What the food is called in the shared list, when it is known. */
  foodName: string | null;
  quantity: number;
  unit: string;
  foodId: string | null;
  status: string;
  nutrients: Partial<Record<NutrientKey, number | null>> | NutrientValues;
}

export interface BreakdownItem {
  id: string;
  date: string;
  meal: string | null;
  rawName: string;
  foodName: string | null;
  quantity: number;
  unit: string;
  foodId: string | null;
  status: string;
  /** This nutrient's amount from this item, or null when it is not known. */
  amount: number | null;
}

export interface Breakdown {
  nutrient: NutrientKey;
  /** The sum of the known amounts; null when none is known. */
  total: number | null;
  /** Items with a known amount, and without one. */
  knownItems: number;
  missingItems: number;
  /** Some items have no amount: the total can only be higher. */
  isLowerBound: boolean;
  /** In the order given (by day, then as logged). */
  items: BreakdownItem[];
}

export function buildBreakdown(inputs: readonly BreakdownInput[], nutrient: NutrientKey): Breakdown {
  let sum = 0;
  let knownItems = 0;
  const items: BreakdownItem[] = inputs.map((i) => {
    const value = i.nutrients[nutrient];
    // A pending item has no nutrients at all, so it reads as unknown here without a special case.
    const amount = typeof value === 'number' ? value : null;
    if (amount !== null) {
      sum += amount;
      knownItems++;
    }
    return {
      id: i.id,
      date: i.date,
      meal: i.meal,
      rawName: i.rawName,
      foodName: i.foodName,
      quantity: i.quantity,
      unit: i.unit,
      foodId: i.foodId,
      status: i.status,
      amount,
    };
  });
  const missingItems = items.length - knownItems;
  return {
    nutrient,
    total: knownItems > 0 ? round(sum) : null,
    knownItems,
    missingItems,
    isLowerBound: knownItems > 0 && missingItems > 0,
    items,
  };
}
