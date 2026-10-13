import type { NutrientKey } from './nutrients';

/**
 * Guardrails on a typed goal (WEEKLY_BREAKDOWN_PLAN.md P4, 4.3, 6.4). Until the engine has a person's
 * sex and maintenance estimate, these are sex-blind placeholders: an absolute wall, a warning band
 * and a ceiling for calories. Every other nutrient only has to be a positive number.
 */
export const CALORIE_WALL = 800;
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
  if (nutrient === 'calories') {
    if (value < CALORIE_WALL) return `Calorie targets under ${CALORIE_WALL} kcal need a doctor or dietitian`;
    if (value > CALORIE_CEILING) return `A calorie target above ${CALORIE_CEILING.toLocaleString('en-US')} kcal is out of range`;
  }
  return null;
}

/**
 * Warnings for the goals as stored. A value saved before the guardrails existed stays in force and is
 * labelled rather than silently changed (plan 6.4).
 */
export function goalWarnings(goals: { nutrient: string; target: number }[]): GoalWarning[] {
  const calories = goals.find((g) => g.nutrient === 'calories');
  if (calories && calories.target < CALORIE_FLOOR_WARNING) {
    return [{ nutrient: 'calories', id: 'below_floor', floor: CALORIE_FLOOR_WARNING }];
  }
  return [];
}
