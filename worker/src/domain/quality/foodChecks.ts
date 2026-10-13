/**
 * Checking the food data itself (WEEKLY_BREAKDOWN_PLAN.md 7.4). The shared foods table is the largest source of silent error: one
 * wrong edit changes every person's totals. These checks run in the editor (`POST /foods/check`) and on every save, and they never
 * block a save unless the numbers cannot all be true.
 *
 *   errors    hard rules: the values are impossible (sugars over carbohydrate, a pure-fat food over 900 kcal per 100 g, ...)
 *   warnings  soft rules: probably a typo, so ask the person to confirm (calories far from 4P + 4C + 9F, an implausible serving)
 *
 * Like the report's insights, an issue is an id with numbers: the app words it from one strings table. A value that is null is unknown
 * and is never checked; a value of 0 is known, with one exception: the food form saves an empty field as 0, so a part-of-whole rule
 * (sugars within carbohydrate, fibre within carbohydrate, saturated fat within fat, added sugars within sugars) reads a whole of 0 as
 * "not filled in" and says nothing. A person who knows a food's fibre but not its carbohydrate can still save it.
 */
import type { FoodForm } from '../match';
import type { NutrientKey } from '../nutrients';
import { genericReference } from '../reference/nasem';

export type FoodIssueId =
  // hard rules
  | 'sugar_over_carbs'
  | 'fibre_over_carbs'
  | 'sat_fat_over_fat'
  | 'added_over_sugar'
  | 'macros_over_100g'
  | 'calories_over_900'
  | 'sodium_over_40000'
  // soft rules
  | 'calories_vs_macros'
  | 'serving_calories_high'
  | 'serving_sodium_high'
  | 'serving_nutrient_high'
  | 'unit_weight_implausible'
  | 'raw_serving_unit';

export interface FoodIssue {
  id: FoodIssueId;
  severity: 'error' | 'warning';
  nutrient?: NutrientKey;
  params: Record<string, number | string>;
}

export interface FoodCheckInput {
  baseUnit: string;
  nutrients: Partial<Record<NutrientKey, number | null>>;
  /** Conversions to the base unit already stored or being saved: `{ unit: 'piece', servings: 0.5 }` is half a base unit. */
  units?: readonly { unit: string; servings: number }[];
  /** Whether the numbers are for the food as eaten or raw and dry (plan 7.7); null or absent when nobody said. */
  form?: FoodForm | null;
}

export interface FoodCheckResult {
  errors: FoodIssue[];
  warnings: FoodIssue[];
}

/** Rounding on a pack label can put a part a hair over its whole: a gram's worth of slack before it is called impossible. */
const SLACK_G = 0.5;
/** Protein, carbohydrate and fat cannot exceed the 100 g they are in; a little over for rounding (plan 7.4). */
const MACROS_PER_100G_MAX = 102;
/** Pure fat is about 900 kcal per 100 g, and pure salt about 39,000 mg of sodium per 100 g. */
const CALORIES_PER_100G_MAX = 900;
const SODIUM_PER_100G_MAX_MG = 40_000;
/** Energy from the general Atwater factors; labels may differ by 20% either way, so warn outside 75% to 125%. */
const ATWATER_LOW = 0.75;
const ATWATER_HIGH = 1.25;
const ATWATER_MIN_KCAL = 20;
/** Heuristics [A] for a serving (a katori, cup, piece or slice): more than this much in one is probably a typo. */
const SERVING_CALORIES_MAX = 1500;
const SERVING_SODIUM_MAX_MG = 5000;
const SERVING_MICRO_FACTOR = 10;
/** A conversion that puts a unit of a per-100 g food outside this weight is probably wrong (grams or millilitres). */
const UNIT_WEIGHT_MIN_G = 2;
const UNIT_WEIGHT_MAX_G = 1500;

/**
 * The helpings people measure cooked food in. Numbers for RAW or dry food in one of these are most likely a cooked katori typed
 * against the dry food's values, about three times the energy of the real thing for rice or dal (plan 7.7).
 */
const COOKED_SERVINGS: readonly string[] = ['katori', 'bowl', 'plate', 'serving'];

/** The vitamins and minerals whose daily reference is compared with one serving. */
const MICRO_KEYS: readonly NutrientKey[] = ['vitaminA', 'vitaminC', 'vitaminD', 'vitaminE', 'vitaminK', 'vitaminB12', 'folate', 'calcium', 'iron', 'potassium', 'magnesium', 'zinc'];

const round1 = (x: number) => Math.round(x * 10) / 10;
const isPer100 = (baseUnit: string) => baseUnit === '100 g' || baseUnit === '100 ml';

export function checkFood(input: FoodCheckInput): FoodCheckResult {
  const v = input.nutrients;
  const val = (k: NutrientKey): number | null => (typeof v[k] === 'number' ? (v[k] as number) : null);
  const errors: FoodIssue[] = [];
  const warnings: FoodIssue[] = [];
  const per100 = isPer100(input.baseUnit);

  const protein = val('protein');
  const carbs = val('carbs');
  const fat = val('fat');
  const sugar = val('sugar');
  const fibre = val('fiber');
  const satFat = val('saturatedFat');
  const added = val('addedSugar');
  const calories = val('calories');
  const sodium = val('sodium');

  // ---- hard rules: the values cannot all be true
  // A part over its whole, when the whole was given (a whole of 0 is "not filled in": see the header).
  const overWhole = (part: number | null, whole: number | null): whole is number => part !== null && whole !== null && whole > 0 && part > whole + SLACK_G;
  if (overWhole(sugar, carbs)) errors.push({ id: 'sugar_over_carbs', severity: 'error', nutrient: 'sugar', params: { sugar: sugar!, carbs } });
  if (overWhole(fibre, carbs)) errors.push({ id: 'fibre_over_carbs', severity: 'error', nutrient: 'fiber', params: { fiber: fibre!, carbs } });
  if (overWhole(satFat, fat)) errors.push({ id: 'sat_fat_over_fat', severity: 'error', nutrient: 'saturatedFat', params: { saturatedFat: satFat!, fat } });
  if (overWhole(added, sugar)) errors.push({ id: 'added_over_sugar', severity: 'error', nutrient: 'addedSugar', params: { addedSugar: added!, sugar } });
  if (per100) {
    const total = (protein ?? 0) + (carbs ?? 0) + (fat ?? 0);
    if (total > MACROS_PER_100G_MAX) errors.push({ id: 'macros_over_100g', severity: 'error', params: { total: round1(total), base: input.baseUnit } });
    if (calories !== null && calories > CALORIES_PER_100G_MAX) errors.push({ id: 'calories_over_900', severity: 'error', nutrient: 'calories', params: { calories, base: input.baseUnit } });
    if (sodium !== null && sodium > SODIUM_PER_100G_MAX_MG) errors.push({ id: 'sodium_over_40000', severity: 'error', nutrient: 'sodium', params: { sodium, base: input.baseUnit } });
  }

  // ---- soft rules: ask before saving
  if (calories !== null && calories >= ATWATER_MIN_KCAL && protein !== null && carbs !== null && fat !== null) {
    const expected = 4 * protein + 4 * carbs + 9 * fat;
    if (expected === 0 || calories < ATWATER_LOW * expected || calories > ATWATER_HIGH * expected) {
      warnings.push({ id: 'calories_vs_macros', severity: 'warning', nutrient: 'calories', params: { calories, expected: Math.round(expected) } });
    }
  }
  if (!per100) {
    if (calories !== null && calories > SERVING_CALORIES_MAX) warnings.push({ id: 'serving_calories_high', severity: 'warning', nutrient: 'calories', params: { calories, base: input.baseUnit } });
    if (sodium !== null && sodium > SERVING_SODIUM_MAX_MG) warnings.push({ id: 'serving_sodium_high', severity: 'warning', nutrient: 'sodium', params: { sodium, base: input.baseUnit } });
    for (const key of MICRO_KEYS) {
      const value = val(key);
      const reference = genericReference(key);
      if (value !== null && reference !== null && value > SERVING_MICRO_FACTOR * reference) {
        warnings.push({ id: 'serving_nutrient_high', severity: 'warning', nutrient: key, params: { nutrient: key, value, reference, base: input.baseUnit } });
      }
    }
  } else {
    for (const u of input.units ?? []) {
      const amount = u.servings * 100;
      if (amount < UNIT_WEIGHT_MIN_G || amount > UNIT_WEIGHT_MAX_G) {
        warnings.push({ id: 'unit_weight_implausible', severity: 'warning', params: { unit: u.unit, amount: Math.round(amount * 10) / 10, base: input.baseUnit } });
      }
    }
  }
  warnings.push(...rawServingIssues(input.form, [input.baseUnit, ...(input.units ?? []).map((u) => u.unit)]));
  return { errors, warnings };
}

/**
 * Raw or dry food measured in a cooked helping (plan 7.7): for each such unit, ask whether its amount is the raw food that goes into
 * one helping, or whether the cooked dish should be a food of its own. Nothing for food as eaten, or when nobody said.
 */
export function rawServingIssues(form: FoodForm | null | undefined, units: readonly string[]): FoodIssue[] {
  if (form !== 'raw') return [];
  return [...new Set(units.filter((u) => COOKED_SERVINGS.includes(u)))].map((unit) => ({ id: 'raw_serving_unit', severity: 'warning', params: { unit } }));
}
