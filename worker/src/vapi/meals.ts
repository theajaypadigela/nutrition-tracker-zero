import { MEALS, type Meal } from '../domain/units';

/**
 * Where a meal stands when the call starts, from the user's local time and what is already logged:
 * - `ask`: should have happened by now, so ask what they had;
 * - `check`: may or may not have happened yet, so first ask whether they've had it;
 * - `later`: still ahead today, so don't bring it up;
 * - `logged`: already has items today, so don't ask again.
 */
export type MealState = 'ask' | 'check' | 'later' | 'logged';

export interface MealStep {
  meal: Meal;
  state: MealState;
}

/** Minutes since local midnight: `check` from `from`, `ask` from `past`. */
const WINDOWS: Record<Meal, { from: number; past: number }> = {
  breakfast: { from: 0, past: 10 * 60 },
  lunch: { from: 12 * 60, past: 14 * 60 + 30 },
  // Snacks and drinks between meals are one catch-all question once the morning is under way.
  snack: { from: 10 * 60 + 30, past: 10 * 60 + 30 },
  dinner: { from: 18 * 60 + 30, past: 22 * 60 },
};

/** 'HH:MM' → minutes since midnight. */
export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
}

/** Breakfast, lunch, snack, dinner in call order, each with its state at `localTime` ('HH:MM'). */
export function planMeals(localTime: string, loggedMeals: Iterable<string | null>): MealStep[] {
  const now = minutesOf(localTime);
  const logged = new Set(loggedMeals);
  return MEALS.map((meal) => {
    const w = WINDOWS[meal];
    // Another snack or drink may have happened since one was logged, so snacks are always asked once due.
    if (meal !== 'snack' && logged.has(meal)) return { meal, state: 'logged' };
    if (now >= w.past) return { meal, state: 'ask' };
    if (now >= w.from) return { meal, state: 'check' };
    return { meal, state: 'later' };
  });
}

export const isDue = (s: MealStep) => s.state === 'ask' || s.state === 'check';
