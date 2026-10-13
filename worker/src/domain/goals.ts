import type { NutrientKey } from './nutrients';

/**
 * Guardrails on a typed goal (WEEKLY_BREAKDOWN_PLAN.md P4, 4.3, 6.4). A typed goal is the person's own choice: it is
 * refused only when it is not a usable number. A goal away from the usual values is saved and comes with a warning
 * (`checkOverride` in targets/overrides.ts); without a profile, the calorie warnings use these sex-blind placeholders.
 */
export const CALORIE_FLOOR_WARNING = 1200;
export const CALORIE_CEILING = 6000;
export const MAX_GOAL = 100_000;

export interface GoalWarning {
  nutrient: NutrientKey;
  id: 'below_floor';
  /** The lowest calorie target the app shows without a warning. */
  floor: number;
}

/** A reason to refuse a goal, or null. */
export function goalRejection(nutrient: NutrientKey, value: number): string | null {
  if (!Number.isFinite(value) || value <= 0 || value > MAX_GOAL) return `${nutrient} goal must be a positive number`;
  return null;
}

/** Warnings for the goals as stored. */
export function goalWarnings(goals: { nutrient: string; target: number }[]): GoalWarning[] {
  const calories = goals.find((g) => g.nutrient === 'calories');
  if (calories && calories.target < CALORIE_FLOOR_WARNING) {
    return [{ nutrient: 'calories', id: 'below_floor', floor: CALORIE_FLOOR_WARNING }];
  }
  return [];
}
