import { ReactNode } from 'react';

/**
 * Nutrition view models for the report screens, ported from the old app's
 * src/types/nutrition.ts (only the shapes these screens use).
 */

// Simple current/goal pair — used by macro & micro summary cards
export interface NutrientData {
  current: number;
  goal: number;
  weeklyGoal?: number;
}

export interface MacroNutrient {
  label: string;
  current: number;
  goal: number;
  weeklyGoal?: number;
  unit: string;
  icon: ReactNode;
  color: string;
  bgColor: string;
  progressColor: string;
  progressBgColor: string;
  textColor: string;
  borderColor: string;
}

export interface MicroNutrient {
  key: string;
  label: string;
  current: number;
  goal: number;
  weeklyGoal?: number;
  unit: string;
  icon: ReactNode;
  iconBg: string;
  color: string;
  status: string;
  statusBg: string;
  statusColor: string;
}

export interface MacroNutrients {
  protein: NutrientData;
  carbs: NutrientData;
  fats: NutrientData;
}

export interface MicroNutrients {
  sugar: NutrientData;
  fiber: NutrientData;
  sodium: NutrientData;
}

// Weekly summary view model (weekly-summary components)
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
