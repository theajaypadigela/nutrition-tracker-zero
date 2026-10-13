/**
 * What a nutrient's target means (WEEKLY_BREAKDOWN_PLAN.md 4.7). One meaning per nutrient, defined
 * here and served by `GET /meta`, so no screen has to guess it from a display name.
 *   energy   an estimate with a range (calories)
 *   minimum  get at least this much (protein, fibre, potassium, vitamins, minerals)
 *   limit    stay at or under this (sodium)
 *   range    stay inside a share of energy (fat, carbohydrate)
 *   amount   no authority sets a target: shown, never judged (total sugars)
 */
export type NutrientKind = 'energy' | 'minimum' | 'limit' | 'range' | 'amount';

/**
 * Which window judges a nutrient: `week`, or `four_weeks` for the vitamins whose day-to-day variation
 * is too large to judge from seven days (plan 4.6).
 */
export type NutrientWindow = 'week' | 'four_weeks';

/**
 * The 17 nutrients the old app tracked, and the four of migration 0003 (saturated fat, added sugars, vitamin B12 and folate).
 * Only calories is required on a food.
 *
 * `defaultGoal` is the GENERIC reference for a typical adult on a 2,000 kcal diet: the US label
 * values for energy, protein, carbohydrate, fat, fibre and sodium, 10% of energy for saturated fat
 * and added sugars (WHO), and the National Academies reference for an average adult aged 31-50 for
 * the vitamins and minerals (plan 4.6). It is shown as
 * "General reference, not personal". Total sugars have none: no authority limits them (plan 1.3).
 */
export const NUTRIENTS = [
  { key: 'calories', column: 'calories', label: 'Calories', unit: 'kcal', kind: 'energy', window: 'week', defaultGoal: 2000 },
  { key: 'protein', column: 'protein_g', label: 'Protein', unit: 'g', kind: 'minimum', window: 'week', defaultGoal: 50 },
  { key: 'carbs', column: 'carbs_g', label: 'Carbs', unit: 'g', kind: 'range', window: 'week', defaultGoal: 275 },
  { key: 'fat', column: 'fat_g', label: 'Fat', unit: 'g', kind: 'range', window: 'week', defaultGoal: 78 },
  { key: 'saturatedFat', column: 'saturated_fat_g', label: 'Saturated fat', unit: 'g', kind: 'limit', window: 'week', defaultGoal: 22 },
  { key: 'fiber', column: 'fiber_g', label: 'Fiber', unit: 'g', kind: 'minimum', window: 'week', defaultGoal: 28 },
  { key: 'sugar', column: 'sugar_g', label: 'Sugar', unit: 'g', kind: 'amount', window: 'week', defaultGoal: null },
  { key: 'addedSugar', column: 'added_sugar_g', label: 'Added sugars', unit: 'g', kind: 'limit', window: 'week', defaultGoal: 50 },
  { key: 'sodium', column: 'sodium_mg', label: 'Sodium', unit: 'mg', kind: 'limit', window: 'week', defaultGoal: 2300 },
  { key: 'vitaminA', column: 'vitamin_a_mcg', label: 'Vitamin A', unit: 'mcg', kind: 'minimum', window: 'four_weeks', defaultGoal: 800 },
  { key: 'vitaminC', column: 'vitamin_c_mg', label: 'Vitamin C', unit: 'mg', kind: 'minimum', window: 'four_weeks', defaultGoal: 82.5 },
  { key: 'vitaminD', column: 'vitamin_d_mcg', label: 'Vitamin D', unit: 'mcg', kind: 'minimum', window: 'four_weeks', defaultGoal: 15 },
  { key: 'vitaminE', column: 'vitamin_e_mg', label: 'Vitamin E', unit: 'mg', kind: 'minimum', window: 'four_weeks', defaultGoal: 15 },
  { key: 'vitaminK', column: 'vitamin_k_mcg', label: 'Vitamin K', unit: 'mcg', kind: 'minimum', window: 'four_weeks', defaultGoal: 105 },
  { key: 'vitaminB12', column: 'vitamin_b12_mcg', label: 'Vitamin B12', unit: 'mcg', kind: 'minimum', window: 'four_weeks', defaultGoal: 2.4 },
  { key: 'folate', column: 'folate_mcg', label: 'Folate', unit: 'mcg DFE', kind: 'minimum', window: 'four_weeks', defaultGoal: 400 },
  { key: 'calcium', column: 'calcium_mg', label: 'Calcium', unit: 'mg', kind: 'minimum', window: 'week', defaultGoal: 1000 },
  { key: 'iron', column: 'iron_mg', label: 'Iron', unit: 'mg', kind: 'minimum', window: 'week', defaultGoal: 13 },
  { key: 'potassium', column: 'potassium_mg', label: 'Potassium', unit: 'mg', kind: 'minimum', window: 'week', defaultGoal: 3000 },
  { key: 'magnesium', column: 'magnesium_mg', label: 'Magnesium', unit: 'mg', kind: 'minimum', window: 'week', defaultGoal: 370 },
  { key: 'zinc', column: 'zinc_mg', label: 'Zinc', unit: 'mg', kind: 'minimum', window: 'week', defaultGoal: 9.5 },
] as const satisfies readonly {
  key: string;
  column: string;
  label: string;
  unit: string;
  kind: NutrientKind;
  window: NutrientWindow;
  defaultGoal: number | null;
}[];

export type NutrientKey = (typeof NUTRIENTS)[number]['key'];

/**
 * The share of energy a `range` nutrient is expected to supply, and the energy in a gram of it:
 * fat 20-35% (9 kcal/g), carbohydrate 45-65% (4 kcal/g). NASEM acceptable macronutrient ranges
 * (plan 4.4). Served by `GET /meta` so the app never repeats the numbers.
 */
export const ENERGY_SHARE: Partial<Record<NutrientKey, { low: number; high: number; kcalPerGram: number }>> = {
  fat: { low: 0.2, high: 0.35, kcalPerGram: 9 },
  carbs: { low: 0.45, high: 0.65, kcalPerGram: 4 },
};
export type NutrientColumn = (typeof NUTRIENTS)[number]['column'];
export type NutrientValues = Record<NutrientKey, number | null>;

export const NUTRIENT_KEYS = NUTRIENTS.map((n) => n.key) as NutrientKey[];
export const NUTRIENT_COLUMNS = NUTRIENTS.map((n) => n.column) as NutrientColumn[];

export function isNutrientKey(key: string): key is NutrientKey {
  return (NUTRIENT_KEYS as string[]).includes(key);
}

export function emptyNutrients(): NutrientValues {
  return Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, null])) as NutrientValues;
}

/** Rounds for API output; keeps nulls (unknown) distinct from 0. */
export function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
