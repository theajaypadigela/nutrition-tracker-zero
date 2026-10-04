/** The 17 nutrients the old app tracked. Only calories is required on a food. */
export const NUTRIENTS = [
  { key: 'calories', column: 'calories', label: 'Calories', unit: 'kcal', defaultGoal: 2500 },
  { key: 'protein', column: 'protein_g', label: 'Protein', unit: 'g', defaultGoal: 180 },
  { key: 'carbs', column: 'carbs_g', label: 'Carbs', unit: 'g', defaultGoal: 250 },
  { key: 'fat', column: 'fat_g', label: 'Fat', unit: 'g', defaultGoal: 70 },
  { key: 'fiber', column: 'fiber_g', label: 'Fiber', unit: 'g', defaultGoal: 30 },
  { key: 'sugar', column: 'sugar_g', label: 'Sugar', unit: 'g', defaultGoal: 40 },
  { key: 'sodium', column: 'sodium_mg', label: 'Sodium', unit: 'mg', defaultGoal: 2300 },
  { key: 'vitaminA', column: 'vitamin_a_mcg', label: 'Vitamin A', unit: 'mcg', defaultGoal: null },
  { key: 'vitaminC', column: 'vitamin_c_mg', label: 'Vitamin C', unit: 'mg', defaultGoal: null },
  { key: 'vitaminD', column: 'vitamin_d_mcg', label: 'Vitamin D', unit: 'mcg', defaultGoal: null },
  { key: 'vitaminE', column: 'vitamin_e_mg', label: 'Vitamin E', unit: 'mg', defaultGoal: null },
  { key: 'vitaminK', column: 'vitamin_k_mcg', label: 'Vitamin K', unit: 'mcg', defaultGoal: null },
  { key: 'calcium', column: 'calcium_mg', label: 'Calcium', unit: 'mg', defaultGoal: null },
  { key: 'iron', column: 'iron_mg', label: 'Iron', unit: 'mg', defaultGoal: null },
  { key: 'potassium', column: 'potassium_mg', label: 'Potassium', unit: 'mg', defaultGoal: null },
  { key: 'magnesium', column: 'magnesium_mg', label: 'Magnesium', unit: 'mg', defaultGoal: null },
  { key: 'zinc', column: 'zinc_mg', label: 'Zinc', unit: 'mg', defaultGoal: null },
] as const satisfies readonly {
  key: string;
  column: string;
  label: string;
  unit: string;
  defaultGoal: number | null;
}[];

export type NutrientKey = (typeof NUTRIENTS)[number]['key'];
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
