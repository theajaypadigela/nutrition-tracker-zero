/**
 * Parsing and validating what the person told us (WEEKLY_BREAKDOWN_PLAN.md 3.2), plus the derived
 * quantities everything else reads: age, BMI and the reference weight for protein (4.1). Pure: errors
 * come back as values, never thrown, so the routes decide how to answer.
 */
import {
  ACTIVITY_LEVELS,
  DIET_PATTERNS,
  GOALS,
  PACES,
  REFERENCE_SETS,
  SEXES_FOR_CALC,
  type HealthProfileInput,
  type SafetyAnswers,
} from './types';

export const LB_TO_KG = 0.45359237;
export const IN_TO_CM = 2.54;

export const HEIGHT_RANGE_CM = { min: 120, max: 230 } as const;
export const WEIGHT_RANGE_KG = { min: 25, max: 350 } as const;
export const MAX_AGE = 100;

export type Parsed<T> = { ok: true; value: T } | { ok: false; field: string; error: string };

const fail = (field: string, error: string): { ok: false; field: string; error: string } => ({ ok: false, field, error });

export const lbToKg = (lb: number) => lb * LB_TO_KG;
export const feetInchesToCm = (feet: number, inches: number) => (feet * 12 + inches) * IN_TO_CM;
export const stonesPoundsToKg = (stones: number, pounds: number) => (stones * 14 + pounds) * LB_TO_KG;

/**
 * Whole years of age on `today` ('YYYY-MM-DD'): the year difference, minus one when the birth month is
 * known and has not been reached yet; with no month, a birthday of 1 July is assumed (plan 4.1).
 */
export function ageOn(today: string, birthYear: number, birthMonth: number | null): number {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return year - birthYear - (month < (birthMonth ?? 7) ? 1 : 0);
}

export const bmiOf = (weightKg: number, heightCm: number) => weightKg / (heightCm / 100) ** 2;

/** BMI at which protein is no longer scaled by weight: the target uses the weight at this BMI instead [A]. */
export const BMI_PROTEIN_CAP = 30;

/** Actual weight up to BMI 30, otherwise the weight at BMI 30: avoids multiplying a protein target by body fat (plan 4.1). */
export function proteinReferenceWeight(weightKg: number, heightCm: number): number {
  return bmiOf(weightKg, heightCm) <= BMI_PROTEIN_CAP ? weightKg : BMI_PROTEIN_CAP * (heightCm / 100) ** 2;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function number(raw: Record<string, unknown>, field: string, min: number, max: number): Parsed<number> {
  const v = raw[field];
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return fail(field, `${field} is required`);
  if (n < min || n > max) return fail(field, `${field} must be between ${min} and ${max}`);
  return { ok: true, value: n };
}

function oneOf<T extends string>(raw: Record<string, unknown>, field: string, allowed: readonly T[], fallback?: T): Parsed<T> {
  const v = raw[field];
  if ((v === undefined || v === null) && fallback !== undefined) return { ok: true, value: fallback };
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) return fail(field, `${field} must be one of ${allowed.join(', ')}`);
  return { ok: true, value: v as T };
}

/** The birth year and optional month, without requiring the rest: the age gate needs only these. */
export function parseBirth(raw: unknown, today: string): Parsed<{ birthYear: number; birthMonth: number | null }> {
  if (!isObject(raw)) return fail('profile', 'profile must be an object');
  const year = number(raw, 'birthYear', 1900, Number(today.slice(0, 4)));
  if (!year.ok) return year;
  let birthMonth: number | null = null;
  if (raw.birthMonth !== undefined && raw.birthMonth !== null) {
    const m = number(raw, 'birthMonth', 1, 12);
    if (!m.ok) return m;
    if (!Number.isInteger(m.value)) return fail('birthMonth', 'birthMonth must be a whole number');
    birthMonth = m.value;
  }
  if (!Number.isInteger(year.value)) return fail('birthYear', 'birthYear must be a whole number');
  if (ageOn(today, year.value, birthMonth) > MAX_AGE) return fail('birthYear', `Age must be ${MAX_AGE} or under`);
  return { ok: true, value: { birthYear: year.value, birthMonth } };
}

/** A complete profile. `pace`, `pattern` and `referenceSet` fall back to their defaults when absent. */
export function parseHealthProfile(raw: unknown, today: string): Parsed<HealthProfileInput> {
  if (!isObject(raw)) return fail('profile', 'profile must be an object');
  const birth = parseBirth(raw, today);
  if (!birth.ok) return birth;
  const sex = oneOf(raw, 'sexForCalc', SEXES_FOR_CALC);
  if (!sex.ok) return sex;
  const height = number(raw, 'heightCm', HEIGHT_RANGE_CM.min, HEIGHT_RANGE_CM.max);
  if (!height.ok) return height;
  const weight = number(raw, 'weightKg', WEIGHT_RANGE_KG.min, WEIGHT_RANGE_KG.max);
  if (!weight.ok) return weight;
  const activity = oneOf(raw, 'activity', ACTIVITY_LEVELS);
  if (!activity.ok) return activity;
  const goal = oneOf(raw, 'goal', GOALS);
  if (!goal.ok) return goal;
  const pace = oneOf(raw, 'pace', PACES, 'standard');
  if (!pace.ok) return pace;
  const pattern = oneOf(raw, 'pattern', DIET_PATTERNS, 'omnivore');
  if (!pattern.ok) return pattern;
  const referenceSet = oneOf(raw, 'referenceSet', REFERENCE_SETS, 'nasem');
  if (!referenceSet.ok) return referenceSet;
  return {
    ok: true,
    value: {
      birthYear: birth.value.birthYear,
      birthMonth: birth.value.birthMonth,
      sexForCalc: sex.value,
      heightCm: height.value,
      weightKg: weight.value,
      activity: activity.value,
      goal: goal.value,
      pace: pace.value,
      pattern: pattern.value,
      referenceSet: referenceSet.value,
    },
  };
}

/** The safety check. Absent means "none of these"; "I would rather not say" is the same (plan 3.4, Q8). */
export function parseSafety(raw: unknown): Parsed<SafetyAnswers> {
  if (raw === undefined || raw === null) {
    return { ok: true, value: { pregnantOrBreastfeeding: false, eatingDisorder: false, clinicianDiet: false, dietInteractingMedicine: false } };
  }
  if (!isObject(raw)) return fail('safety', 'safety must be an object');
  const flag = (field: string): Parsed<boolean> => {
    const v = raw[field];
    if (v === undefined || v === null) return { ok: true, value: false };
    return typeof v === 'boolean' ? { ok: true, value: v } : fail(`safety.${field}`, `${field} must be true or false`);
  };
  const pregnant = flag('pregnantOrBreastfeeding');
  if (!pregnant.ok) return pregnant;
  const ed = flag('eatingDisorder');
  if (!ed.ok) return ed;
  const clinician = flag('clinicianDiet');
  if (!clinician.ok) return clinician;
  const medicine = flag('dietInteractingMedicine');
  if (!medicine.ok) return medicine;
  return {
    ok: true,
    value: {
      pregnantOrBreastfeeding: pregnant.value,
      eatingDisorder: ed.value,
      clinicianDiet: clinician.value,
      dietInteractingMedicine: medicine.value,
    },
  };
}
