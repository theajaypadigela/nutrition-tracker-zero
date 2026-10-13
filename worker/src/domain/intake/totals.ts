/**
 * Adding up what was logged (the intake calculator, see ./types.ts): an item's energy and amounts, a day's energy, a nutrient's
 * total over a set of days together with how much of it is known, and the foods that supplied the most. A pending item and a blank
 * value add nothing and are counted, never filled in (WEEKLY_BREAKDOWN_PLAN.md 7.1, 7.3). Nothing here knows about targets.
 */
import type { NutrientKey } from '../nutrients';
import type { IntakeDay, IntakeItem } from './types';

/** Energy of a resolved item; null for a pending one. */
export const itemKcal = (item: IntakeItem): number | null => (item.pending ? null : (item.nutrients.calories ?? null));

/** Logged energy of a day: the resolved items only. */
export function dayKcal(day: IntakeDay): number {
  let kcal = 0;
  for (const item of day.items) kcal += itemKcal(item) ?? 0;
  return kcal;
}

/** The known amount of a nutrient in one item: calories come from the item's energy, everything else from its nutrients. */
export function itemAmount(item: IntakeItem, nutrient: NutrientKey): number | null {
  if (item.pending) return null;
  const v = nutrient === 'calories' ? item.nutrients.calories : item.nutrients[nutrient];
  return typeof v === 'number' ? v : null;
}

export interface NutrientTotals {
  /** Sum of the amounts that are known. */
  known: number;
  /** Energy of the items that have a value for the nutrient. */
  energyKnown: number;
  /** Energy of every resolved item. */
  energyAll: number;
  itemsKnown: number;
  itemsAll: number;
}

/** Totals for one nutrient over `days` (pending items are left out of coverage; day classification handles them). */
export function totalsOf(days: readonly IntakeDay[], nutrient: NutrientKey): NutrientTotals {
  const t: NutrientTotals = { known: 0, energyKnown: 0, energyAll: 0, itemsKnown: 0, itemsAll: 0 };
  for (const day of days) {
    for (const item of day.items) {
      const kcal = itemKcal(item);
      if (item.pending || kcal === null) continue;
      t.energyAll += kcal;
      t.itemsAll += 1;
      const v = itemAmount(item, nutrient);
      if (v !== null) {
        t.known += v;
        t.energyKnown += kcal;
        t.itemsKnown += 1;
      }
    }
  }
  return t;
}

/** Up to three foods that supply the most of a nutrient's known total over `days`, as shares (plan 5.2). */
export function topSources(days: readonly IntakeDay[], nutrient: NutrientKey, limit = 3): { foodId: string; name: string; share: number }[] {
  const byFood = new Map<string, { name: string; amount: number }>();
  let total = 0;
  for (const day of days) {
    for (const item of day.items) {
      const v = itemAmount(item, nutrient);
      if (v === null || v <= 0 || !item.foodId) continue;
      total += v;
      const entry = byFood.get(item.foodId) ?? { name: item.name, amount: 0 };
      entry.amount += v;
      byFood.set(item.foodId, entry);
    }
  }
  if (total <= 0) return [];
  return [...byFood.entries()]
    .map(([foodId, e]) => ({ foodId, name: e.name, share: e.amount / total }))
    .sort((a, b) => b.share - a.share || a.name.localeCompare(b.name))
    .slice(0, limit);
}
