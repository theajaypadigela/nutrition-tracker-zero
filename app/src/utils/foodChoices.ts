/**
 * The foods the log screen offers, and in what order. Three sources become one catalog:
 *
 *   history  the person's own log (`GET /foods/history`): how often and how lately each food was logged at each meal, and the amount
 *            they usually have. Only their own, so two people never share a list.
 *   food     the foods list (`GET /foods`), with the units each one already has a conversion for.
 *   common   a short list of what many people have at each meal (`data/commonFoods.ts`): the fallback, shown only for a meal the
 *            person has nothing logged for.
 *
 * A food that is in more than one source is one choice. The ranking of a meal's list is the Worker's score for that meal (frequency
 * and recency together); this file only sorts by it, searches, and picks the amount to start from.
 */
import type { Food, HistoryFood, Meal, MealHistory } from '@/api/types';
import { COMMON_FOODS, type CommonFood } from '@/data/commonFoods';
import { MEALS } from './meals';
import { normalizeName } from './names';

export type ChoiceOrigin = 'history' | 'food' | 'common';

export interface FoodChoice {
  /** One per food: `food:<id>`, `name:<normalized name>` for a name still waiting for its values, or `common:<name>`. */
  key: string;
  /** What the item is called when it is logged. */
  name: string;
  /** Every name the Worker knows it by, normalized (`normalizeName`): what logging it resolves by, and what a new food would clash with. */
  names: string[];
  /** The food it counts as, or null while nobody has entered values for it. */
  foodId: string | null;
  origin: ChoiceOrigin;
  /** The amount to start from when no meal's habit applies. */
  quantity: number;
  unit: string;
  /** Units the food already has a conversion for, so an amount in one of them counts right away. Empty when that is not known. */
  units: string[];
  /** The person's own log of it. Absent for a food they have never logged. */
  history?: { days: number; score: number; meals: Partial<Record<Meal, MealHistory>> };
}

/** A food just created from the log screen, handed back to it to be logged: its amount to start from and the units that count right away. */
export interface AddedFood {
  foodId: string;
  name: string;
  quantity: number;
  unit: string;
  units: string[];
}

export interface Catalog {
  list: FoodChoice[];
  /** The Worker's normalized names and aliases (and the common keys) to the choice they belong to. */
  byName: Map<string, FoodChoice>;
}

/** Lowercase words with accents and punctuation gone: what a search compares. */
export function searchKey(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Units the Worker turns into each other without a conversion of their own: a kilo from a gram, a litre from a millilitre. */
const SAME_DIMENSION: Record<string, string> = { g: 'kg', kg: 'g', ml: 'l', l: 'ml' };

/** The units that already count for a food: its base unit, its conversions, and the kilo or litre that goes with a gram or millilitre. */
function countingUnits(units: readonly string[]): string[] {
  return [...new Set(units.flatMap(u => (SAME_DIMENSION[u] ? [u, SAME_DIMENSION[u]!] : [u])))];
}

/** The amount to start a food from: one of its base unit, or a katori (or 100 g) when its numbers are per 100 g or 100 ml. */
export function foodStart(food: Food): { quantity: number; unit: string; units: string[] } {
  const base = food.baseUnit;
  if (!base.startsWith('100')) return { quantity: 1, unit: base, units: countingUnits([base, ...food.units.map(u => u.unit)]) };
  const metric = base === '100 g' ? 'g' : 'ml';
  const helping = food.units.find(u => u.unit !== 'g' && u.unit !== 'ml' && u.unit !== 'kg' && u.unit !== 'l');
  const units = countingUnits([...food.units.map(u => u.unit), metric]);
  return helping ? { quantity: 1, unit: helping.unit, units } : { quantity: 100, unit: metric, units };
}

export function buildCatalog({ history, foods }: { history: readonly HistoryFood[] | null; foods: readonly Food[] | null }): Catalog {
  const list: FoodChoice[] = [];
  const byName = new Map<string, FoodChoice>();
  const foodsById = new Map((foods ?? []).map(f => [f.id, f]));
  const represented = new Set<string>();
  const claim = (choice: FoodChoice, names: string[]) => {
    for (const name of names) if (!byName.has(name)) byName.set(name, choice);
  };

  for (const h of history ?? []) {
    const food = h.foodId ? foodsById.get(h.foodId) : undefined;
    const choice: FoodChoice = {
      key: h.foodId ? `food:${h.foodId}` : `name:${h.name}`,
      name: h.displayName,
      names: [...new Set([h.name, ...(food ? [food.name, ...food.aliases] : [])])],
      foodId: h.foodId,
      origin: 'history',
      quantity: h.quantity,
      unit: h.unit,
      units: food ? foodStart(food).units : [],
      history: { days: h.days, score: h.score, meals: h.meals },
    };
    list.push(choice);
    claim(choice, [h.name, ...(food ? [food.name, ...food.aliases] : [])]);
    if (h.foodId) represented.add(h.foodId);
  }

  for (const food of foods ?? []) {
    if (represented.has(food.id)) continue;
    const d = foodStart(food);
    const choice: FoodChoice = {
      key: `food:${food.id}`,
      name: food.displayName,
      names: [food.name, ...food.aliases],
      foodId: food.id,
      origin: 'food',
      quantity: d.quantity,
      unit: d.unit,
      units: d.units,
    };
    list.push(choice);
    claim(choice, [food.name, ...food.aliases]);
  }

  const seen = new Set<string>();
  for (const meal of MEALS) {
    for (const common of COMMON_FOODS[meal]) {
      if (seen.has(common.key)) continue;
      seen.add(common.key);
      if (byName.has(common.key)) continue; // a food or a history entry of that name is already here, with its own values
      const choice: FoodChoice = {
        key: `common:${common.key}`,
        name: common.name,
        names: [common.key],
        foodId: null,
        origin: 'common',
        quantity: common.quantity,
        unit: common.unit,
        units: [],
      };
      list.push(choice);
      claim(choice, [common.key]);
    }
  }
  return { list, byName };
}

/** How likely the person is to log this at this meal, by their own log; with no meal chosen, over every meal. 0 for a food they never logged. */
export function mealScore(choice: FoodChoice, meal: Meal | null): number {
  if (!choice.history) return 0;
  return meal ? (choice.history.meals[meal]?.score ?? 0) : choice.history.score;
}

/** The amount to fill in: what the person usually has at this meal, else what they usually have, else the food's own start. */
export function amountFor(choice: FoodChoice, meal: Meal | null): { quantity: number; unit: string } {
  const usual = meal ? choice.history?.meals[meal] : undefined;
  return usual ? { quantity: usual.quantity, unit: usual.unit } : { quantity: choice.quantity, unit: choice.unit };
}

const byName = (a: FoodChoice, b: FoodChoice) => a.name.localeCompare(b.name);

/** Best first for a meal: that meal's score, then the score over all meals, then more days, then the name. */
const byMeal = (meal: Meal | null) => (a: FoodChoice, b: FoodChoice) =>
  mealScore(b, meal) - mealScore(a, meal) ||
  (b.history?.score ?? 0) - (a.history?.score ?? 0) ||
  (b.history?.days ?? 0) - (a.history?.days ?? 0) ||
  byName(a, b);

/**
 * A common food that is also a food in the list starts from the common amount (two idli, not one), but only when that amount counts
 * right away for the food. A food the person has logged keeps the amount they use.
 */
function adopt(choice: FoodChoice, common: CommonFood): FoodChoice {
  if (choice.origin !== 'food' || (choice.units.length > 0 && !choice.units.includes(common.unit))) return choice;
  return { ...choice, quantity: common.quantity, unit: common.unit };
}

/** A few of each meal's common foods, for a log with no meal chosen. */
function commonForAnyMeal(): CommonFood[] {
  const out: CommonFood[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 4; i++) {
    for (const meal of MEALS) {
      const common = COMMON_FOODS[meal][i];
      if (common && !seen.has(common.key)) {
        seen.add(common.key);
        out.push(common);
      }
    }
  }
  return out;
}

export interface Suggestions {
  /** The list to show first: the person's own foods for this meal, best first, else what many people have at it. */
  top: FoodChoice[];
  /** Whether `top` is the person's own log for this meal. The common foods are shown only when it is not. */
  personal: boolean;
  /** Foods the person has logged, at other meals, that are not in `top`. */
  also: FoodChoice[];
  /** The rest of the foods list, A to Z, up to a limit. */
  all: FoodChoice[];
  /** How many more of the foods list there are than `all` shows. */
  moreCount: number;
}

export const TOP_COUNT = 10;
export const ALSO_COUNT = 8;
export const ALL_COUNT = 40;

export function suggestionsFor(catalog: Catalog, meal: Meal | null): Suggestions {
  const own = catalog.list.filter(c => mealScore(c, meal) > 0).sort(byMeal(meal));
  const personal = own.length > 0;
  let top: FoodChoice[];
  if (personal) top = own.slice(0, TOP_COUNT);
  else {
    top = [];
    for (const common of meal ? COMMON_FOODS[meal] : commonForAnyMeal()) {
      const choice = catalog.byName.get(common.key);
      if (choice && !top.some(t => t.key === choice.key)) top.push(adopt(choice, common));
      if (top.length === TOP_COUNT) break;
    }
  }
  const shown = new Set(top.map(c => c.key));
  const also = catalog.list.filter(c => c.history && !shown.has(c.key)).sort(byMeal(null)).slice(0, ALSO_COUNT);
  for (const c of also) shown.add(c.key);
  const rest = catalog.list.filter(c => c.origin === 'food' && !shown.has(c.key)).sort(byName);
  return { top, personal, also, all: rest.slice(0, ALL_COUNT), moreCount: Math.max(0, rest.length - ALL_COUNT) };
}

// ---- searching

/** The queries to try: as typed, and as the Worker would name it ("tomatoes" finds tomato, "sandwiches" finds sandwich). */
function variants(query: string): string[] {
  return [...new Set([query, normalizeName(query)].filter(q => q !== ''))];
}

/** 0 the name itself, 1 starts with it, 2 every word typed starts a word of it, 3 contains it; Infinity when none. */
function tierOf(name: string, query: string): number {
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  const words = name.split(' ');
  if (query.split(' ').every(token => words.some(w => w.startsWith(token)))) return 2;
  return name.includes(query) ? 3 : Infinity;
}

/** What a choice can be found by: how it reads, and every name the Worker has for it. */
const namesOf = (choice: FoodChoice): string[] => [...new Set([searchKey(choice.name), ...choice.names.map(searchKey)])];

/**
 * The choices that match what was typed, best first: a closer match first, then what the person logs at this meal, then what they log
 * at all, then foods over common ones, then the name.
 */
export function searchChoices(catalog: Catalog, query: string, meal: Meal | null): FoodChoice[] {
  const q = searchKey(query);
  if (q === '') return [];
  const tries = variants(q);
  const origin: Record<ChoiceOrigin, number> = { history: 0, food: 1, common: 2 };
  const hits: { choice: FoodChoice; tier: number }[] = [];
  for (const choice of catalog.list) {
    let tier = Infinity;
    for (const name of namesOf(choice)) for (const v of tries) tier = Math.min(tier, tierOf(name, v));
    if (tier !== Infinity) hits.push({ choice, tier });
  }
  return hits
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        mealScore(b.choice, meal) - mealScore(a.choice, meal) ||
        (b.choice.history?.score ?? 0) - (a.choice.history?.score ?? 0) ||
        origin[a.choice.origin] - origin[b.choice.origin] ||
        byName(a.choice, b.choice),
    )
    .map(h => h.choice);
}

/**
 * Whether the Worker already has a food of this name: the same name or alias once both are normalized, or a food that reads exactly
 * like it. If not, the person can add it as a new food. (If it were, adding it would be refused as a name already taken.)
 */
export function hasExactMatch(catalog: Catalog, query: string): boolean {
  const q = searchKey(query);
  if (q === '') return false;
  const tries = variants(q);
  return tries.some(v => catalog.byName.has(v)) || catalog.list.some(c => namesOf(c).some(name => tries.includes(name)));
}
