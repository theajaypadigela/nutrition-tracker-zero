import type { Meal } from '@/api/types';

export const MEALS: readonly Meal[] = ['breakfast', 'lunch', 'snack', 'dinner'];

/**
 * The meal a time of day most likely is, for the log screen to start on: breakfast to 10:59, lunch to 15:29, a snack to 18:29, then
 * dinner (and the small hours, which are a late dinner). It only picks where to start; the person changes it with one tap.
 */
export function mealAt(hour: number, minute = 0): Meal {
  const t = hour * 60 + minute;
  if (t < 4 * 60) return 'dinner';
  if (t < 11 * 60) return 'breakfast';
  if (t < 15 * 60 + 30) return 'lunch';
  if (t < 18 * 60 + 30) return 'snack';
  return 'dinner';
}
