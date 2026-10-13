/**
 * Goal adjustment: from maintenance to a daily target (WEEKLY_BREAKDOWN_PLAN.md 4.3, 4.9). Every limit
 * is [A], anchored on [G] sources; none is a formal standard (there is no universal "never below 1,200").
 * The deficit is a starting point, not a prediction.
 */
import type { SexForCalc } from '../reference/nasem';
import type { Goal, Pace, Warning } from './types';
import { round10 } from './energy';

/** The lowest loss target the app shows [G: the lower edges of the AHA/ACC/TOS "usual" ranges]. */
export const CALORIE_FLOOR: Record<SexForCalc, number> = { female: 1200, male: 1500, average: 1350 };
/** Nothing is ever set under this: the very-low-calorie-diet line, medically supervised only [G]. */
export const CALORIE_WALL = 800;

/** Share of maintenance, minimum and maximum kcal of the deficit, by pace [A]. */
export const PACE_DEFICIT: Record<Pace, { share: number; min: number; max: number }> = {
  gentle: { share: 0.1, min: 200, max: 300 },
  standard: { share: 0.15, min: 200, max: 500 },
  faster: { share: 0.2, min: 200, max: 600 },
};
export const DEFICIT_CAP_SHARE = 0.25;
export const DEFICIT_CAP_KCAL = 750;
export const MIN_USEFUL_DEFICIT = 150;
/** The static first-weeks rate never exceeds this share of body weight, nor this many kg, a week [A]. */
export const MAX_WEEKLY_LOSS_SHARE = 0.01;
export const MAX_WEEKLY_LOSS_KG = 1;
/** kcal in a kg of body weight loss, for the static first-weeks rate used on screen. */
export const KCAL_PER_KG_STATIC = 7700;

export const GAIN_RULE = { share: 0.15, min: 250, max: 500, capShare: 0.2 } as const;
export const MUSCLE_RULE = {
  under25: { share: 0.1, min: 150, max: 300 },
  from25: { share: 0.05, min: 100, max: 200 },
  from30: { share: 0, min: 0, max: 0 },
} as const;

export interface GoalAdjustment {
  goalApplied: Goal;
  /** The target in kcal, to the nearest 10. */
  target: number;
  /** kcal added (positive) or taken (negative), to the nearest 10; 0 for none. */
  delta: number;
  floorApplied: boolean;
  warnings: Warning[];
}

/**
 * The daily energy target for the goal that applies. `tee` is the unrounded maintenance estimate.
 * Loss: a deficit by pace, never more than 25% of maintenance or 750 kcal, never taking the target under
 * the floor, never a first-weeks rate above 1% of body weight or 1 kg a week, and never smaller than 150
 * kcal (then the goal is Maintain).
 */
export function adjustForGoal(args: {
  goalApplied: Goal;
  pace: Pace;
  sex: SexForCalc;
  weightKg: number;
  bmi: number;
  tee: number;
}): GoalAdjustment {
  const { pace, sex, weightKg, bmi, tee } = args;
  let goal = args.goalApplied;
  const warnings: Warning[] = [];
  const floor = CALORIE_FLOOR[sex];
  let delta = 0;
  let floorApplied = false;

  if (goal === 'lose') {
    const p = PACE_DEFICIT[pace];
    let deficit = Math.min(Math.max(p.share * tee, p.min), p.max, DEFICIT_CAP_SHARE * tee, DEFICIT_CAP_KCAL);
    if (tee - deficit < floor) {
      deficit = tee - floor;
      floorApplied = true;
      warnings.push({ id: 'floor_limited_deficit', severity: 'caution' });
    }
    deficit = Math.min(deficit, (Math.min(MAX_WEEKLY_LOSS_SHARE * weightKg, MAX_WEEKLY_LOSS_KG) * KCAL_PER_KG_STATIC) / 7);
    if (deficit < MIN_USEFUL_DEFICIT) {
      // Too little room for a loss: Maintain applies, and the floor did not shorten anything after all.
      warnings.length = 0;
      warnings.push({ id: 'deficit_too_small', severity: 'caution' });
      goal = 'maintain';
      deficit = 0;
      floorApplied = false;
    }
    delta = -deficit;
  } else if (goal === 'gain') {
    delta = Math.min(Math.max(GAIN_RULE.share * tee, GAIN_RULE.min), GAIN_RULE.max, GAIN_RULE.capShare * tee);
  } else if (goal === 'build_muscle') {
    const rule = bmi < 25 ? MUSCLE_RULE.under25 : bmi < 30 ? MUSCLE_RULE.from25 : MUSCLE_RULE.from30;
    delta = rule.share > 0 ? Math.min(Math.max(rule.share * tee, rule.min), rule.max) : 0;
  }

  let target = round10(tee + delta);
  if (goal === 'lose' && target < floor) target = floor;
  return { goalApplied: goal, target, delta: delta ? round10(delta) : 0, floorApplied, warnings };
}

/** A loss goal's static first-weeks rate in kg a week, for display only (deficit x 7 / 7,700). */
export const staticWeeklyKg = (deficitKcal: number) => (Math.abs(deficitKcal) * 7) / KCAL_PER_KG_STATIC;

/**
 * Weight change from a steady daily deficit by the dynamic model's rule of thumb (plan 4.9, Hall 2011): the
 * eventual change is deficit / k kg with k between 20 (linearised, for people with excess weight) and 24
 * (the conservative rule of thumb) kcal per kg per day, approached as 1 - exp(-t / 500 days). Valid for
 * modest changes (about 10 to 15% of body weight). Returns the range in kg, never a point: real results
 * vary by about 4 kg between people after several years.
 */
export function projectWeightChange(deficitKcalPerDay: number, days: number): { lowKg: number; highKg: number } {
  const d = Math.abs(deficitKcalPerDay);
  const approach = 1 - Math.exp(-days / 500);
  return { lowKg: (d / 24) * approach, highKg: (d / 20) * approach };
}
