import type { BaseUnit } from './units';
import type { NutrientValues } from './nutrients';

export interface Food {
  id: string;
  name: string;
  displayName: string;
  baseUnit: BaseUnit;
  nutrients: NutrientValues;
}

export interface AliasRow {
  alias: string;
  food_id: string;
}

export interface UnitRow {
  food_id: string;
  unit: string;
  servings: number;
}

/** In-memory view of the shared cache, built once per request from one D1 batch. */
export interface FoodIndex {
  byId: Map<string, Food>;
  /** Canonical names and aliases → food. */
  byName: Map<string, Food>;
  aliasesByFood: Map<string, string[]>;
  /** foodId → unit → servings of the base unit. */
  units: Map<string, Map<string, number>>;
}

export function buildIndex(foods: Food[], aliases: AliasRow[], units: UnitRow[]): FoodIndex {
  const byId = new Map<string, Food>();
  const byName = new Map<string, Food>();
  const aliasesByFood = new Map<string, string[]>();
  const unitMap = new Map<string, Map<string, number>>();
  for (const food of foods) {
    byId.set(food.id, food);
    byName.set(food.name, food);
  }
  for (const a of aliases) {
    const food = byId.get(a.food_id);
    if (!food) continue;
    if (!byName.has(a.alias)) byName.set(a.alias, food);
    const list = aliasesByFood.get(food.id) ?? [];
    list.push(a.alias);
    aliasesByFood.set(food.id, list);
  }
  for (const u of units) {
    const m = unitMap.get(u.food_id) ?? new Map<string, number>();
    m.set(u.unit, u.servings);
    unitMap.set(u.food_id, m);
  }
  return { byId, byName, aliasesByFood, units: unitMap };
}

/** Exact match only; fuzzy matches are suggestions, never auto-accepted. */
export function matchName(index: FoodIndex, normalizedName: string): Food | undefined {
  return index.byName.get(normalizedName);
}
