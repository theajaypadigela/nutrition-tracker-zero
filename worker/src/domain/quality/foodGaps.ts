/**
 * "Foods with gaps" (WEEKLY_BREAKDOWN_PLAN.md 7.4, Phase 4): the foods a person ate recently that are missing values the report needs,
 * ranked by how much of their logged energy each one is, so the data gets filled in where it matters. A nutrient with no value is
 * unknown, never zero (7.1); every unknown value is why a nutrient reads "not enough data" or a score reads "at least".
 */
import { itemNutrients } from '../intake/items';
import type { FoodIndex, FoodSource } from '../match';
import type { NutrientKey } from '../nutrients';

/**
 * The nutrients the weekly view and the Nutrient mix read: the ones worth a person's time to fill in. Vitamins are left out on
 * purpose: most foods lack them, they are judged over four weeks, and a list that held every food would help nobody.
 */
export const GAP_NUTRIENTS: readonly NutrientKey[] = ['protein', 'fiber', 'sodium', 'potassium', 'calcium', 'iron', 'magnesium', 'zinc', 'saturatedFat', 'addedSugar'];

export interface GapItem {
  food_id: string | null;
  quantity: number;
  unit: string;
  status: string;
}

export interface FoodGap {
  foodId: string;
  name: string;
  baseUnit: string;
  /** This food's share of the energy logged in the window, 0 to 1. */
  share: number;
  /** How many items of it were logged. */
  items: number;
  /** Which of the nutrients the report needs have no value on this food. */
  missing: NutrientKey[];
  source: FoodSource | null;
  reviewedAt: string | null;
}

export interface FoodGaps {
  foods: FoodGap[];
  /** Distinct foods logged in the window, and how many have every value the report needs. */
  loggedFoods: number;
  completeFoods: number;
  /** The share of logged energy that comes from foods with every value: how far the score can go. */
  completeShare: number;
}

export function foodGaps(index: FoodIndex, items: readonly GapItem[], limit = 30): FoodGaps {
  const perFood = new Map<string, { energy: number; count: number }>();
  let total = 0;
  for (const item of items) {
    // A pending item has no energy and says nothing about the food's own gaps.
    if (item.status !== 'resolved' || !item.food_id || !index.byId.has(item.food_id)) continue;
    const kcal = itemNutrients(index, item).calories ?? 0;
    const entry = perFood.get(item.food_id) ?? { energy: 0, count: 0 };
    entry.energy += kcal;
    entry.count += 1;
    perFood.set(item.food_id, entry);
    total += kcal;
  }

  const gaps: FoodGap[] = [];
  let completeEnergy = 0;
  let completeFoods = 0;
  for (const [id, { energy, count }] of perFood) {
    const food = index.byId.get(id)!;
    const missing = GAP_NUTRIENTS.filter((k) => food.nutrients[k] === null);
    if (missing.length === 0) {
      completeFoods++;
      completeEnergy += energy;
      continue;
    }
    gaps.push({
      foodId: id,
      name: food.displayName,
      baseUnit: food.baseUnit,
      share: total > 0 ? energy / total : 0,
      items: count,
      missing,
      source: food.source ?? null,
      reviewedAt: food.reviewedAt ?? null,
    });
  }
  // Most of the energy first; among foods with none, the one eaten most often; then by name, so the order never wobbles.
  gaps.sort((a, b) => b.share - a.share || b.items - a.items || a.name.localeCompare(b.name));
  return { foods: gaps.slice(0, limit), loggedFoods: perFood.size, completeFoods, completeShare: total > 0 ? completeEnergy / total : 0 };
}
