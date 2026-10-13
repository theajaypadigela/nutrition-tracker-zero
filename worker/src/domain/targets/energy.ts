/**
 * Energy: the maintenance estimate (WEEKLY_BREAKDOWN_PLAN.md 4.2). NASEM 2023 equations for adults 19 and
 * over, with ONE guard of ours, a range from the equation's own standard error, and a Mifflin-St Jeor
 * cross-check. The estimate is shown as a range, never a point: a person's real needs can sit anywhere
 * within about 240 to 340 kcal either side of it, and their weight trend tells more than the number does.
 */
import {
  ACTIVITY_ORDER,
  EER_COEFFICIENTS,
  EER_STANDARD_ERROR,
  PAL_TABLE_7_1,
  type ActivityLevel,
  type SexForCalc,
} from '../reference/nasem';

/** Round half up to a multiple of 10 (kcal are never shown to a finer grain than their uncertainty). */
export const round10 = (x: number): number => Math.round(x / 10) * 10;

/** The published equation, unguarded. */
export function rawEer(sex: 'male' | 'female', age: number, heightCm: number, weightKg: number, activity: ActivityLevel): number {
  const c = EER_COEFFICIENTS[sex][activity];
  return c.c0 + c.cAge * age + c.cHeight * heightCm + c.cWeight * weightKg;
}

/**
 * The NASEM maintenance estimate. A higher activity category never lowers it [A]: the published men's
 * "very active" equation falls below "active" for short, light men (an artefact of its steep height
 * term), so the estimate is the maximum over the chosen category and the ones below it. `average` is
 * the mean of the male and female result.
 */
export function maintenanceEstimate(sex: SexForCalc, age: number, heightCm: number, weightKg: number, activity: ActivityLevel): number {
  if (sex === 'average') {
    return (maintenanceEstimate('male', age, heightCm, weightKg, activity) + maintenanceEstimate('female', age, heightCm, weightKg, activity)) / 2;
  }
  const upTo = ACTIVITY_ORDER.slice(0, ACTIVITY_ORDER.indexOf(activity) + 1);
  return Math.max(...upTo.map((a) => rawEer(sex, age, heightCm, weightKg, a)));
}

/** Standard error of a predicted value, kcal a day; the mean of the two for `average`. */
export function standardError(sex: SexForCalc): number {
  return sex === 'average' ? (EER_STANDARD_ERROR.male + EER_STANDARD_ERROR.female) / 2 : EER_STANDARD_ERROR[sex];
}

/** Mifflin-St Jeor resting metabolic rate, kcal a day [E] (a cross-check only). */
export function mifflinRmr(sex: SexForCalc, age: number, heightCm: number, weightKg: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : sex === 'female' ? base - 161 : base + (5 - 161) / 2;
}

/** Mifflin-St Jeor times NASEM's own activity values (Table 7-1), rounded to 10 kcal. */
export function mifflinTimesPal(sex: SexForCalc, age: number, heightCm: number, weightKg: number, activity: ActivityLevel): number {
  return round10(mifflinRmr(sex, age, heightCm, weightKg) * PAL_TABLE_7_1[activity]);
}

/** The cross-check disagrees when the two estimates differ by more than this share of the NASEM value [A]. */
export const CROSS_CHECK_THRESHOLD = 0.15;

export interface EnergyBase {
  /** Unrounded NASEM estimate, kcal a day. */
  tee: number;
  maintenance: number;
  /** The typical range: one standard error either side, rounded to 10. */
  low: number;
  high: number;
  /** The 95% range, about twice as wide. */
  low95: number;
  high95: number;
  mifflinPal: number;
  disagree: boolean;
}

export function energyBase(sex: SexForCalc, age: number, heightCm: number, weightKg: number, activity: ActivityLevel): EnergyBase {
  const tee = maintenanceEstimate(sex, age, heightCm, weightKg, activity);
  const se = standardError(sex);
  const mifflinPal = mifflinTimesPal(sex, age, heightCm, weightKg, activity);
  return {
    tee,
    maintenance: round10(tee),
    low: round10(tee - se),
    high: round10(tee + se),
    low95: round10(tee - 1.96 * se),
    high95: round10(tee + 1.96 * se),
    mifflinPal,
    disagree: Math.abs(mifflinPal - round10(tee)) > CROSS_CHECK_THRESHOLD * round10(tee),
  };
}
