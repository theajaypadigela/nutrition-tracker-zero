/**
 * Vitamins and minerals: the reference intake for the person's sex and age band, with its adjustments,
 * its type (RDA or Adequate Intake) and, only where it covers food, its Upper Level
 * (WEEKLY_BREAKDOWN_PLAN.md 4.6).
 */
import { ICMR_EAR_TARGETS, icmrReference, type IcmrBand, type ReferenceBand } from '../reference/icmr';
import {
  IRON_PLANT_BASED_FACTOR,
  PLANT_BASED_PATTERNS,
  microReference,
  type AgeBand,
  type MicroKey,
  type SexForCalc,
} from '../reference/nasem';
import type { DietPattern, ReferenceSet } from './types';

/** The vitamins and minerals plus potassium the app tracks, in display order. */
export const MICRO_TARGETS: readonly MicroKey[] = [
  'vitaminA',
  'vitaminC',
  'vitaminD',
  'vitaminE',
  'vitaminK',
  'vitaminB12',
  'folate',
  'calcium',
  'iron',
  'magnesium',
  'zinc',
  'potassium',
];

/** The vitamins judged over four weeks, not one: their day-to-day variation is far too large for seven days (plan 4.6). */
export const FOUR_WEEK_MICROS: ReadonlySet<MicroKey> = new Set(['vitaminA', 'vitaminC', 'vitaminD', 'vitaminE', 'vitaminK', 'vitaminB12', 'folate']);

export interface MicroTarget {
  nutrient: MicroKey;
  value: number;
  type: 'RDA' | 'EAR' | 'AI';
  /** On the Indian set, where the target is the Estimated Average Requirement: the allowance it stands in for. */
  allowance?: number;
  /** Only where the Upper Level covers food-sourced intake and the app can measure it. */
  upperLevel?: number;
  /** Iron was multiplied by 1.8 for a plant-based pattern. */
  plantBasedAdjusted: boolean;
}

/** One decimal, as the tables give them (82.5 mg vitamin C for the average adult). */
const round1 = (x: number) => Math.round(x * 10) / 10;

export function microTarget(
  nutrient: MicroKey,
  sex: SexForCalc,
  band: ReferenceBand,
  pattern: DietPattern,
  referenceSet: ReferenceSet = 'nasem',
): MicroTarget {
  if (referenceSet === 'icmr_nin') {
    // ICMR-NIN (plan 4.10, Q2): iron, zinc and vitamin B12 are judged against the Estimated Average Requirement, because ICMR's own model
    // diets do not reach the allowance for them. The plant-based multiplier is a National Academies rule (10% against 18% absorption) and
    // is not applied here: ICMR's iron figures already assume about 8% absorption.
    const ref = icmrReference(nutrient, sex, band as IcmrBand);
    const asEar = ICMR_EAR_TARGETS.has(nutrient) && ref.ear !== undefined;
    return {
      nutrient,
      value: round1(asEar ? ref.ear! : ref.value),
      type: asEar ? 'EAR' : ref.type,
      ...(asEar ? { allowance: round1(ref.value) } : {}),
      ...(ref.upperScope === 'all_sources' && ref.upperLevel !== undefined ? { upperLevel: ref.upperLevel } : {}),
      plantBasedAdjusted: false,
    };
  }
  const ref = microReference(nutrient, sex, band as AgeBand);
  const plantBasedAdjusted = nutrient === 'iron' && (PLANT_BASED_PATTERNS as readonly string[]).includes(pattern);
  const value = plantBasedAdjusted ? ref.value * IRON_PLANT_BASED_FACTOR : ref.value;
  return {
    nutrient,
    value: round1(value),
    type: ref.type,
    ...(ref.upperScope === 'all_sources' && ref.upperLevel !== undefined ? { upperLevel: ref.upperLevel } : {}),
    plantBasedAdjusted,
  };
}
