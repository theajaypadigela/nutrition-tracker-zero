/**
 * What is missing or uncertain in a week's figures (WEEKLY_BREAKDOWN_PLAN.md 7.4, 7.7, 7.8): the data-quality checker's summary
 * for the report, in counts and shares a person can act on. The foods behind the week that lack values the report reads, the
 * amounts worth a second look, and where the numbers come from (a pack label, a food database, a recipe, a guess, or nobody
 * said). It describes and changes nothing: no figure is corrected and no food is ranked by trust.
 */
import { itemKcal } from '../intake/totals';
import type { IntakeDay, IntakeItem } from '../intake/types';
import type { FoodSource } from '../match';
import type { NutrientKey } from '../nutrients';
import { GAP_NUTRIENTS } from './foodGaps';
import { amountSeverity, checkAmount, type AmountCheck } from './items';

export interface AmountToCheck {
  date: string;
  name: string;
  quantity: number;
  unit: string;
  /** The item's energy; null while it is pending. */
  kcal: number | null;
  reason: AmountCheck;
}

export type ValueSource = FoodSource | 'none';

export interface WeekQuality {
  /**
   * Foods logged on the days that count that lack a value the weekly view reads, the share of logged energy they carry, the largest
   * by name, and the values missing most often (by the energy of the foods that lack them), so a person knows what to look for.
   */
  foodsWithGaps: { count: number; energyShare: number; names: string[]; missing: NutrientKey[] };
  /** The logged energy of the days that count, by where its food's numbers came from, as shares (all zero with nothing logged). */
  valueSources: Record<ValueSource, number>;
  /** Amounts that look unusual on the days up to today that are not left out, the most unusual first. Each still counts. */
  amountsToCheck: AmountToCheck[];
}

export const MAX_AMOUNTS_SHOWN = 5;
const MAX_GAP_NAMES = 3;
const MAX_MISSING = 3;
const SOURCES: readonly ValueSource[] = ['label', 'database', 'recipe', 'estimate', 'none'];

/** A nutrient the report reads that has no value on this item's food. Absent counts as unknown, like null (plan 7.1). */
const missingOf = (item: IntakeItem) => GAP_NUTRIENTS.filter((k) => typeof item.nutrients[k] !== 'number');

export function weekQuality(args: {
  /** The days that count in the week's figures. */
  counted: readonly IntakeDay[];
  /** The days up to today that are not left out: an amount on a day that does not count yet is still worth fixing. */
  open: readonly IntakeDay[];
}): WeekQuality {
  let total = 0;
  const bySource = Object.fromEntries(SOURCES.map((s) => [s, 0])) as Record<ValueSource, number>;
  const gapFoods = new Map<string, { name: string; energy: number }>();
  const missingEnergy = new Map<NutrientKey, number>();
  for (const day of args.counted) {
    for (const item of day.items) {
      const kcal = itemKcal(item);
      if (kcal === null) continue;
      total += kcal;
      bySource[item.source ?? 'none'] += kcal;
      const missing = missingOf(item);
      if (!item.foodId || missing.length === 0) continue;
      const entry = gapFoods.get(item.foodId) ?? { name: item.name, energy: 0 };
      entry.energy += kcal;
      gapFoods.set(item.foodId, entry);
      for (const k of missing) missingEnergy.set(k, (missingEnergy.get(k) ?? 0) + kcal);
    }
  }
  const gaps = [...gapFoods.values()].sort((a, b) => b.energy - a.energy || a.name.localeCompare(b.name));
  const gapEnergy = gaps.reduce((s, g) => s + g.energy, 0);
  // Ties keep the catalogue's order, so the list never wobbles between reads.
  const missing = [...missingEnergy.entries()]
    .sort((a, b) => b[1] - a[1] || GAP_NUTRIENTS.indexOf(a[0]) - GAP_NUTRIENTS.indexOf(b[0]))
    .slice(0, MAX_MISSING)
    .map(([k]) => k);

  const amounts: { amount: AmountToCheck; severity: number }[] = [];
  for (const day of args.open) {
    for (const item of day.items) {
      if (item.quantity === undefined || item.unit === undefined) continue;
      const input = { quantity: item.quantity, unit: item.unit, kcal: itemKcal(item) };
      const reason = checkAmount(input);
      if (reason) amounts.push({ amount: { date: day.date, name: item.name, quantity: item.quantity, unit: item.unit, kcal: input.kcal, reason }, severity: amountSeverity(input) });
    }
  }
  amounts.sort((a, b) => b.severity - a.severity || a.amount.date.localeCompare(b.amount.date) || a.amount.name.localeCompare(b.amount.name));

  return {
    foodsWithGaps: { count: gaps.length, energyShare: total > 0 ? gapEnergy / total : 0, names: gaps.slice(0, MAX_GAP_NAMES).map((g) => g.name), missing },
    valueSources: Object.fromEntries(SOURCES.map((s) => [s, total > 0 ? bySource[s] / total : 0])) as Record<ValueSource, number>,
    amountsToCheck: amounts.slice(0, MAX_AMOUNTS_SHOWN).map((a) => a.amount),
  };
}
