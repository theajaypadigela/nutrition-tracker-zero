/**
 * Who gets personal targets, and which goals are offered (WEEKLY_BREAKDOWN_PLAN.md 8.1, gates G1 to G10).
 * Safety lives in these gates and in the defaults, not in disclaimers: a gate that never produces a risky
 * target works whether or not anyone reads anything. They run on self-declaration, so they stop people
 * who tell us and nobody else; the floors and caps in goal.ts hold whatever the answers.
 */
import type { Goal, ReferenceSet, SafetyAnswers, Warning } from './types';

export const MIN_AGE = 19;
/** BMI outside this range is reference-only: below 16 is a malnutrition risk, above 60 is more likely a typo [A]. */
export const BMI_MIN = 16;
export const BMI_MAX = 60;
/** Loss is offered from this BMI on the international set, and from 23 on the Indian one [G]. */
export const LOSE_MIN_BMI: Record<ReferenceSet, number> = { nasem: 25, icmr_nin: 23 };
/** "Obesity" for the older-adult rule: 30, or 27.5 on the Indian set [G]. */
export const OBESE_BMI: Record<ReferenceSet, number> = { nasem: 30, icmr_nin: 27.5 };
export const UNDERWEIGHT_BMI = 18.5;
export const LOSE_MAX_AGE = 80;
export const LOSE_OLDER_AGE = 65;

export interface EntryGate {
  /** `reference_only` when any gate fired; nothing about which one is stored. */
  mode: 'personalised' | 'reference_only';
  warnings: Warning[];
  /** Low-pressure mode goes on by default after an eating-disorder answer (plan 8.2). */
  numbersHiddenByDefault: boolean;
}

/**
 * G1 to G5: age from birth year, the safety check and BMI. `age` or `bmi` may be null when the person
 * has not given them yet (a reference-only request carries neither).
 */
export function entryGate(args: { age: number | null; bmi: number | null; safety: SafetyAnswers }): EntryGate {
  const { age, bmi, safety } = args;
  const warnings: Warning[] = [];
  let fired = false;
  if (age !== null && age < MIN_AGE) {
    warnings.push({ id: 'under_19', severity: 'info' });
    fired = true;
  }
  // Pregnancy, an eating-disorder history and a clinician's diet each put the profile in reference-only
  // mode. The response says only that it did, never which answer it was.
  if (safety.pregnantOrBreastfeeding || safety.eatingDisorder || safety.clinicianDiet) fired = true;
  if (bmi !== null && (bmi < BMI_MIN || bmi > BMI_MAX)) {
    warnings.push({ id: 'bmi_out_of_range', severity: 'info' });
    fired = true;
  }
  if (fired) warnings.unshift({ id: 'reference_only', severity: 'info' });
  return { mode: fired ? 'reference_only' : 'personalised', warnings, numbersHiddenByDefault: safety.eatingDisorder };
}

export interface GoalGate {
  goalApplied: Goal;
  warnings: Warning[];
  /** The goals that were offered. A blocked goal is applied as Maintain, with the reason. */
  available: Goal[];
}

/** Whether a loss goal is offered at this age and BMI (G7 and G8). */
export function loseAllowed(age: number, bmi: number, set: ReferenceSet): { allowed: boolean; reason?: Warning['id'] } {
  if (bmi < UNDERWEIGHT_BMI || bmi < LOSE_MIN_BMI[set]) return { allowed: false, reason: 'lose_not_indicated_bmi' };
  if (age >= LOSE_MAX_AGE) return { allowed: false, reason: 'lose_needs_clinician_80plus' };
  if (age >= LOSE_OLDER_AGE && bmi < OBESE_BMI[set]) return { allowed: false, reason: 'lose_65plus_needs_obesity' };
  return { allowed: true };
}

/** Whether a gain goal is offered: not in the overweight range or above (G9). */
export const gainAllowed = (bmi: number, set: ReferenceSet) => bmi < LOSE_MIN_BMI[set];

/** G6 to G9: which goals are offered, and what is applied when the chosen one is not. */
export function goalGate(args: { goal: Goal; age: number; bmi: number; referenceSet: ReferenceSet }): GoalGate {
  const { goal, age, bmi, referenceSet } = args;
  const warnings: Warning[] = [];
  let applied = goal;
  const lose = loseAllowed(age, bmi, referenceSet);
  if (goal === 'lose' && !lose.allowed) {
    warnings.push({ id: lose.reason!, severity: 'caution' });
    applied = 'maintain';
  }
  if (goal === 'gain' && !gainAllowed(bmi, referenceSet)) {
    warnings.push({ id: 'gain_not_indicated_bmi', severity: 'caution' });
    applied = 'maintain';
  }
  if (bmi < UNDERWEIGHT_BMI) warnings.push({ id: 'underweight_notice', severity: 'caution' });
  const available: Goal[] = ['general_health', 'maintain'];
  if (lose.allowed) available.push('lose');
  if (gainAllowed(bmi, referenceSet)) available.push('gain');
  available.push('build_muscle');
  return { goalApplied: applied, warnings, available };
}
