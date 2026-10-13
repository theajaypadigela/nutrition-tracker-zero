import { computeTargets } from '../../../src/domain/targets/engine';
import type { ActivityLevel, DietPattern, Goal, HealthProfileInput, Pace, ReferenceSet, SafetyAnswers, SexForCalc, Target, TargetSet } from '../../../src/domain/targets/types';

/** Every golden vector is computed on this day; with no birth month an age is `year - birthYear` from July on. */
export const TODAY = '2026-10-12';

export interface FixtureInput {
  name: string;
  sex: SexForCalc;
  age: number;
  height: number;
  weight: number;
  activity: ActivityLevel;
  goal: Goal;
  pace: Pace;
  pattern: DietPattern;
  referenceSet: ReferenceSet;
  flags: string[];
}

export function profileOf(i: FixtureInput): HealthProfileInput {
  return {
    birthYear: 2026 - i.age,
    birthMonth: null,
    sexForCalc: i.sex,
    heightCm: i.height,
    weightKg: i.weight,
    activity: i.activity,
    goal: i.goal,
    pace: i.pace,
    pattern: i.pattern,
    referenceSet: i.referenceSet,
  };
}

export function safetyOf(flags: string[]): SafetyAnswers {
  return {
    pregnantOrBreastfeeding: flags.includes('pregnant_lactating'),
    eatingDisorder: flags.includes('ed_history'),
    clinicianDiet: flags.includes('clinician_diet'),
    dietInteractingMedicine: false,
  };
}

export const compute = (i: FixtureInput): TargetSet => computeTargets(profileOf(i), TODAY, { safety: safetyOf(i.flags) });

export const target = (set: TargetSet, nutrient: string): Target => {
  const t = set.targets.find((x) => x.nutrient === nutrient);
  if (!t) throw new Error(`no target for ${nutrient}`);
  return t;
};

/** A profile with sensible defaults, for the tests that vary one thing. */
export function profile(over: Partial<HealthProfileInput> = {}): HealthProfileInput {
  return {
    birthYear: 1996,
    birthMonth: null,
    sexForCalc: 'female',
    heightCm: 160,
    weightKg: 60,
    activity: 'low_active',
    goal: 'general_health',
    pace: 'standard',
    pattern: 'omnivore',
    referenceSet: 'nasem',
    ...over,
  };
}
