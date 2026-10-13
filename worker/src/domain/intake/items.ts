/**
 * The intake calculator's first step (see ./types.ts): which food a logged item is, how many base servings its amount is, and the
 * nutrients that gives, computed at read time so a corrected food corrects every past log. Null is unknown, never zero.
 */
import { matchName, type Food, type FoodIndex } from '../match';
import { NUTRIENT_KEYS, emptyNutrients, round, type NutrientKey, type NutrientValues } from '../nutrients';
import { METRIC_FACTORS } from '../units';

export type ItemStatus = 'resolved' | 'pending_food' | 'pending_unit';

/** Same-dimension conversions derived from a stored conversion row (e.g. kg from a g row). */
const DERIVED: Record<string, { from: string; multiplier: number }[]> = {
  kg: [{ from: 'g', multiplier: 1000 }],
  g: [{ from: 'kg', multiplier: 0.001 }],
  l: [{ from: 'ml', multiplier: 1000 }],
  ml: [{ from: 'l', multiplier: 0.001 }],
};

/** How many base servings one `unit` of `food` is, or null if unknown (PLAN.md §7). */
export function factor(index: FoodIndex, food: Food, unit: string): number | null {
  if (unit === food.baseUnit) return 1;
  const stored = index.units.get(food.id);
  const direct = stored?.get(unit);
  if (direct !== undefined) return direct;
  const metric = METRIC_FACTORS[unit];
  if (metric && metric.base === food.baseUnit) return metric.factor;
  for (const d of DERIVED[unit] ?? []) {
    const via = stored?.get(d.from);
    if (via !== undefined) return via * d.multiplier;
  }
  return null;
}

export interface Resolution {
  foodId: string | null;
  status: ItemStatus;
}

export function resolveItem(index: FoodIndex, normalizedName: string, unit: string): Resolution {
  const food = matchName(index, normalizedName);
  if (!food) return { foodId: null, status: 'pending_food' };
  return { foodId: food.id, status: factor(index, food, unit) === null ? 'pending_unit' : 'resolved' };
}

/** Per-item nutrients, computed at read time. Null means unknown (pending, or missing on the food). */
export function itemNutrients(
  index: FoodIndex,
  item: { food_id: string | null; quantity: number; unit: string; status: string },
): NutrientValues {
  const out = emptyNutrients();
  if (item.status !== 'resolved' || !item.food_id) return out;
  const food = index.byId.get(item.food_id);
  if (!food) return out;
  const f = factor(index, food, item.unit);
  if (f === null) return out;
  for (const key of NUTRIENT_KEYS) {
    const v = food.nutrients[key];
    out[key] = v === null ? null : round(v * item.quantity * f);
  }
  return out;
}

export type Totals = Record<NutrientKey, { value: number; missingItems: number }>;

/** Sums resolved values; every item without a value for a nutrient counts as missing for it. */
export function sumNutrients(items: NutrientValues[]): Totals {
  const totals = {} as Totals;
  for (const key of NUTRIENT_KEYS) {
    let value = 0;
    let missingItems = 0;
    for (const n of items) {
      const v = n[key];
      if (v === null) missingItems++;
      else value += v;
    }
    totals[key] = { value: round(value), missingItems };
  }
  return totals;
}

const METRIC_UNITS: Record<string, true> = { g: true, kg: true, ml: true, l: true };

/**
 * What a logged amount comes to in grams (or millilitres), so a person can see what "1 katori" of a food was taken to be (plan 7.7:
 * the unit people say most can differ threefold). Known when the food's numbers are per 100 g or 100 ml, or when the food has a
 * gram or millilitre conversion; null otherwise, while the item is pending, and when the amount was given in grams already.
 */
export function itemWeight(
  index: FoodIndex,
  item: { food_id: string | null; quantity: number; unit: string; status: string },
): { value: number; unit: 'g' | 'ml' } | null {
  if (item.status !== 'resolved' || !item.food_id || METRIC_UNITS[item.unit]) return null;
  const food = index.byId.get(item.food_id);
  if (!food) return null;
  const f = factor(index, food, item.unit);
  if (f === null) return null;
  const servings = item.quantity * f;
  if (food.baseUnit === '100 g' || food.baseUnit === '100 ml') {
    return { value: round(servings * 100, 1), unit: food.baseUnit === '100 g' ? 'g' : 'ml' };
  }
  // A count base (piece, katori) with a stored weight: 1 g is `perGram` base servings.
  for (const unit of ['g', 'ml'] as const) {
    const perGram = index.units.get(food.id)?.get(unit);
    if (perGram !== undefined && perGram > 0) return { value: round(servings / perGram, 1), unit };
  }
  return null;
}
