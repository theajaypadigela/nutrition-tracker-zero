/**
 * Macronutrients, fibre, sodium and potassium from the energy target and body weight (WEEKLY_BREAKDOWN_PLAN.md
 * 4.4, 4.5). Protein per kilogram with a clamp, fat a share of energy, carbohydrate the remainder with a
 * floor, fibre by energy. Total sugars get NO target: no authority limits them.
 */
import {
  AMDR,
  CARB_RDA_G,
  FAT_DEFAULT_SHARE,
  FAT_MIN_SHARE,
  FIBRE_FLOOR_G,
  FIBRE_G_PER_1000_KCAL,
  PROTEIN_MAX_G_PER_KG,
  PROTEIN_RDA_G_PER_KG,
  type SexForCalc,
} from '../reference/nasem';
import { ICMR_AMDR, ICMR_FIBRE_G_PER_1000_KCAL, ICMR_PROTEIN_RDA_G_PER_KG } from '../reference/icmr';
import type { Goal, ReferenceSet } from './types';

export const PROTEIN_G_PER_KG: Record<Goal, number> = {
  general_health: 1.0,
  maintain: 1.0,
  lose: 1.4,
  gain: 1.2,
  build_muscle: 1.6,
};
/** Age 65 and over: at least this, g per kg [G] (PROT-AGE, ESPEN). */
export const PROTEIN_G_PER_KG_OLDER = 1.2;
export const PROTEIN_OLDER_AGE = 65;

export interface MacroPlan {
  proteinG: number;
  fatG: number;
  carbsG: number;
  fatLowG: number;
  fatHighG: number;
  carbsLowG: number;
  carbsHighG: number;
  fibreG: number;
  /** Which floors bound: the carbohydrate floor (130 g), then the fat floor (20% of energy). */
  notes: ('carb_floor' | 'fat_floor')[];
  gPerKg: number;
  /** The recommended allowance per kg the protein is never below (0.8 US, 0.83 India), and the fibre per 1,000 kcal, for the explanations. */
  proteinRdaGPerKg: number;
  fibreGPer1000: number;
  /** The usual range of fat as a share of energy on this set, for the explanation. */
  fatRange: { low: number; high: number };
}

/**
 * `energy` is the target in kcal; `referenceWeightKg` the weight protein is scaled by (actual weight up
 * to BMI 30, plan 4.1). The macronutrient energy sums to `energy` within rounding.
 */
export function planMacros(args: { energy: number; referenceWeightKg: number; goal: Goal; age: number; referenceSet?: ReferenceSet }): MacroPlan {
  const { energy: E, referenceWeightKg: wref, goal, age } = args;
  const indian = args.referenceSet === 'icmr_nin';
  const rdaPerKg = indian ? ICMR_PROTEIN_RDA_G_PER_KG : PROTEIN_RDA_G_PER_KG;
  const fibrePer1000 = indian ? ICMR_FIBRE_G_PER_1000_KCAL : FIBRE_G_PER_1000_KCAL;
  const fatRange = indian ? ICMR_AMDR.fat : AMDR.fat;
  const base = PROTEIN_G_PER_KG[goal];
  const gkg = age >= PROTEIN_OLDER_AGE ? Math.max(base, PROTEIN_G_PER_KG_OLDER) : base;
  // Clamp: never under the RDA or 10% of energy, never over 2.0 g/kg or 35% of energy.
  const lower = Math.max(rdaPerKg * wref, (AMDR.protein.low * E) / 4);
  const upper = Math.min(PROTEIN_MAX_G_PER_KG * wref, (AMDR.protein.high * E) / 4);
  let P = Math.min(Math.max(gkg * wref, lower), upper);
  let F = (FAT_DEFAULT_SHARE * E) / 9;
  let C = (E - 4 * P - 9 * F) / 4;
  const notes: MacroPlan['notes'] = [];
  if (C < CARB_RDA_G) {
    C = CARB_RDA_G;
    F = (E - 4 * P - 4 * C) / 9;
    notes.push('carb_floor');
    if (F < (FAT_MIN_SHARE * E) / 9) {
      F = (FAT_MIN_SHARE * E) / 9;
      P = (E - 9 * F - 4 * C) / 4;
      notes.push('fat_floor');
    }
  }
  return {
    proteinG: Math.round(P),
    fatG: Math.round(F),
    carbsG: Math.round(C),
    fatLowG: Math.round((fatRange.low * E) / 9),
    fatHighG: Math.round((fatRange.high * E) / 9),
    carbsLowG: Math.round((AMDR.carbs.low * E) / 4),
    carbsHighG: Math.round((AMDR.carbs.high * E) / 4),
    fibreG: Math.round(Math.max((fibrePer1000 * E) / 1000, FIBRE_FLOOR_G)),
    notes,
    gPerKg: gkg,
    proteinRdaGPerKg: rdaPerKg,
    fibreGPer1000: fibrePer1000,
    fatRange: { low: fatRange.low, high: fatRange.high },
  };
}

/** Potassium Adequate Intake in mg, by sex used for calculations (the mean for `average`). */
export function potassiumAi(sex: SexForCalc): number {
  return sex === 'female' ? 2600 : sex === 'male' ? 3400 : 3000;
}
