/**
 * Unit conversions for the profile forms (WEEKLY_BREAKDOWN_PLAN.md 4.1, Q23): forms accept kg, lb and st+lb, cm and
 * ft+in, and everything is converted to metric the moment it is typed; the Worker only ever sees metric.
 */
export const LB_TO_KG = 0.45359237;
export const IN_TO_CM = 2.54;

export const lbToKg = (lb: number) => lb * LB_TO_KG;
export const feetInchesToCm = (feet: number, inches: number) => (feet * 12 + inches) * IN_TO_CM;
export const stonesPoundsToKg = (stones: number, pounds: number) => (stones * 14 + pounds) * LB_TO_KG;
export const kgToLb = (kg: number) => kg / LB_TO_KG;
export const cmToFeetInches = (cm: number): { feet: number; inches: number } => {
  const total = cm / IN_TO_CM;
  const feet = Math.floor(total / 12);
  return { feet, inches: Math.round((total - feet * 12) * 10) / 10 };
};

/** A number typed by a person: accepts a decimal comma and surrounding space; null when it is not a finite number. */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export type HeightUnit = 'cm' | 'ftin';
export type WeightUnit = 'kg' | 'lb' | 'st';

export interface HeightEntry {
  unit: HeightUnit;
  cm: string;
  feet: string;
  inches: string;
}
export interface WeightEntry {
  unit: WeightUnit;
  kg: string;
  lb: string;
  stones: string;
  stonePounds: string;
}

/** Height in cm from the form, or null while it is incomplete. */
export function heightCm(h: HeightEntry): number | null {
  if (h.unit === 'cm') return parseNumber(h.cm);
  const feet = parseNumber(h.feet);
  const inches = parseNumber(h.inches || '0');
  return feet === null || inches === null ? null : feetInchesToCm(feet, inches);
}

/** Weight in kg from the form, or null while it is incomplete. */
export function weightKg(w: WeightEntry): number | null {
  if (w.unit === 'kg') return parseNumber(w.kg);
  if (w.unit === 'lb') {
    const lb = parseNumber(w.lb);
    return lb === null ? null : lbToKg(lb);
  }
  const st = parseNumber(w.stones);
  const lb = parseNumber(w.stonePounds || '0');
  return st === null || lb === null ? null : stonesPoundsToKg(st, lb);
}

/** The steps helper: it only pre-selects a card; the bands are published step-count bands, not calibrated to these categories [A]. */
export function activityFromSteps(steps: number): 'inactive' | 'low_active' | 'active' | 'very_active' {
  if (steps < 5000) return 'inactive';
  if (steps < 10000) return 'low_active';
  if (steps < 12500) return 'active';
  return 'very_active';
}
