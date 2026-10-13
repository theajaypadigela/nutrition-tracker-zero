import type { DayRange, NutrientInfo } from '@/api/types';
import type { WeeklyNutrient } from '@/types/nutrition';
import { addDays } from './dates';
import { inferDirection } from './nutrition';

/** Days of the Monday-first week starting at `start` that are not in the future (0–7). */
export function daysElapsed(start: string, today: string): number {
  let n = 0;
  for (let i = 0; i < 7; i++) if (addDays(start, i) <= today) n++;
  return n;
}

/**
 * Per-nutrient weekly view models from the Worker's day totals (no AI, PLAN.md §12).
 * Goals are prorated to the days elapsed, so a Wednesday compares against three days of goal.
 */
export function buildWeeklyNutrients(
  range: DayRange,
  start: string,
  today: string,
  nutrients: NutrientInfo[],
): WeeklyNutrient[] {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const byDate = new Map(range.days.map(d => [d.date, d]));
  const elapsed = daysElapsed(start, today);
  const loggedDays = range.days.filter(d => d.itemCount > 0 && d.date <= today).length;

  return nutrients.map(n => {
    const trend = dates.map(date => (date <= today ? byDate.get(date)?.totals[n.key]?.value ?? 0 : 0));
    const dailyGoal = range.goals[n.key] ?? null;
    return {
      id: n.key,
      name: n.label,
      unit: n.unit,
      amount: trend.reduce((a, b) => a + b, 0),
      goal: dailyGoal ? dailyGoal * elapsed : 0,
      dailyGoal,
      dir: inferDirection(n.label),
      trend,
      loggedDays,
    };
  });
}
