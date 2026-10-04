import { matchName, type Food, type FoodIndex } from './match';
import { NUTRIENT_KEYS, emptyNutrients, round, type NutrientKey, type NutrientValues } from './nutrients';
import { METRIC_FACTORS } from './units';

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
