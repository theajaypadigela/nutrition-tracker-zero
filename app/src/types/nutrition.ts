/** Nutrition view models for the report screens. */

// Simple current/goal pair: one nutrient's week so far
export interface NutrientData {
  current: number;
  goal: number;
  weeklyGoal?: number;
}

// Weekly summary view model
export type Status = 'good' | 'warn' | 'bad';
export type Direction = 'higher' | 'lower' | 'window';

export interface WeeklyNutrient {
  id: string;
  name: string;
  unit: string;
  /** Total over the days of the week so far. */
  amount: number;
  /** Goal for the days elapsed (daily goal × days); 0 when the nutrient has no goal. */
  goal: number;
  /** The user's daily goal, or null when none is set. */
  dailyGoal: number | null;
  dir: Direction;
  /** Seven daily values, Monday first. */
  trend: number[];
  /** Days with anything logged, for the "daily average on logged days" figure. */
  loggedDays: number;
  category?: string;
}
