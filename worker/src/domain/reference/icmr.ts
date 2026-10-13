/**
 * The Indian reference set: ICMR-NIN "Nutrient Requirements for Indians" (2020), the national reference
 * (WEEKLY_BREAKDOWN_PLAN.md 1.6, 4.4 to 4.6, decision Q2, Phase 6). Pure data and tiny lookups.
 *
 * Where it differs from the US/Canada set (nasem.ts), and why the engine reads it separately:
 *   - Adults are NOT age-banded. The tables give a reference man (65 kg) and woman (55 kg), and a separate table for
 *     people 60 and over, so there are two bands here, 19 to 59 and 60+.
 *   - Iron, zinc and vitamin B12 are judged against the Estimated Average Requirement, not the allowance (plan 4.10):
 *     ICMR's own model diets do not reach the allowance for them, so a "percent of the allowance" would under-score
 *     typical adequate Indian diets. The allowance is kept in the table (`rda`) and named in the explanation.
 *   - Iron already assumes about 8% absorption from Indian diets, so the National Academies' plant-based multiplier of
 *     1.8 is NOT applied on this set.
 *   - Sodium 2,000 mg, potassium 3,500 mg, protein 0.83 g/kg, fibre about 15 g per 1,000 kcal, fat 15 to 35% of energy.
 *   - Vitamin A is in retinol equivalents (carotenoids at 6:1), not retinol activity equivalents (12:1): the two are not
 *     interchangeable (plan 4.6). Vitamin D is given in IU and converted at 40 IU to 1 mcg.
 *
 * SOURCE AND REVIEW STATUS. The tables below were read from page images of a college-hosted copy of the short report
 * (the plan's Appendix A lists it as the "secondary copy", used for the tables), page numbers as printed: EAR p.12, RDA
 * p.13, fat p.14, the elderly p.15, AMDR with sodium and potassium p.16, tolerable upper limits p.17, vitamin E and K in
 * the text of p.10. Each value was read twice (from the image and from an OCR pass) and agreed. They have NOT been
 * re-derived by a second person from the official publication, which the plan requires (11.3, 11.7).
 */
import type { MicroKey, MicroReference, SexForCalc, UpperLevelScope } from './nasem';
import { ageBandOf, type AgeBand } from './nasem';

// ---- bands -------------------------------------------------------------------------------------------

export const ICMR_BANDS = ['19-59', '60+'] as const;
export type IcmrBand = (typeof ICMR_BANDS)[number];

export const icmrBandOf = (age: number): IcmrBand => (age >= 60 ? '60+' : '19-59');

/** A reference band of either set: what a stored target set records, so a birthday that changes it can be noticed (plan 6.2). */
export type ReferenceBand = AgeBand | IcmrBand;

export function referenceBandOf(referenceSet: 'nasem' | 'icmr_nin', age: number): ReferenceBand {
  return referenceSet === 'icmr_nin' ? icmrBandOf(age) : ageBandOf(age);
}

// ---- vitamins and minerals: summary tables [R] ----------------------------------------------------------

export interface IcmrValue {
  /** The Recommended Dietary Allowance, or the Adequate Intake where there is no allowance. */
  rda: number;
  /** The Estimated Average Requirement; none where ICMR gives none. */
  ear?: number;
  type: 'RDA' | 'AI';
}

export interface IcmrTable {
  /** What the values are counted in. */
  unit: string;
  /** Adults 19 to 59, then 60 and over. */
  female: readonly [IcmrValue, IcmrValue];
  male: readonly [IcmrValue, IcmrValue];
  /** The Tolerable Upper Limit, for both sexes and bands, and what it covers. */
  upper?: { scope: UpperLevelScope; value: number };
}

const rda = (r: number, ear: number): IcmrValue => ({ rda: r, ear, type: 'RDA' });
const ai = (r: number): IcmrValue => ({ rda: r, type: 'AI' });
const same = <T>(v: T): readonly [T, T] => [v, v];

export const ICMR_MICROS: Record<MicroKey, IcmrTable> = {
  // Retinol equivalents. The Committee asks that at least half come from animal sources. TUL 3,000 is for preformed retinol only.
  vitaminA: { unit: 'mcg RE', female: same(rda(840, 390)), male: same(rda(1000, 460)), upper: { scope: 'preformed_only', value: 3000 } },
  vitaminC: { unit: 'mg', female: same(rda(65, 55)), male: same(rda(80, 65)), upper: { scope: 'all_sources', value: 2000 } },
  // 600 IU (EAR 400) for adults, 800 IU for people 60 and over; 40 IU = 1 mcg. TUL 4,000 IU = 100 mcg.
  vitaminD: { unit: 'mcg', female: [rda(15, 10), rda(20, 10)], male: [rda(15, 10), rda(20, 10)], upper: { scope: 'all_sources', value: 100 } },
  // Not in the summary tables: the text suggests 0.8 mg of alpha-tocopherol per gram of essential fatty acids, "roughly 7.5 to
  // 10 mg a day" depending on the oil. 10 mg, the top of that range, is used [A] and said so in the explanation.
  vitaminE: { unit: 'mg', female: same(ai(10)), male: same(ai(10)) },
  // The text recommends 55 mcg for adults, in line with FAO/WHO.
  vitaminK: { unit: 'mcg', female: same(ai(55)), male: same(ai(55)) },
  // The 2020 allowances for B12 and folate are lower than the National Academies'. The folate TUL of 1,000 mcg is, as in the US set,
  // not compared with food.
  vitaminB12: { unit: 'mcg', female: same(rda(2.2, 2)), male: same(rda(2.2, 2)) },
  folate: { unit: 'mcg DFE', female: [rda(220, 180), rda(200, 180)], male: same(rda(300, 250)), upper: { scope: 'supplements_only', value: 1000 } },
  calcium: { unit: 'mg', female: [rda(1000, 800), rda(1200, 1000)], male: [rda(1000, 800), rda(1200, 1000)], upper: { scope: 'all_sources', value: 2500 } },
  // 8% absorption is assumed: the allowance for women 19 to 59 is 29 mg, and 19 mg for everyone else.
  iron: { unit: 'mg', female: [rda(29, 15), rda(19, 11)], male: [rda(19, 11), rda(19, 11)], upper: { scope: 'all_sources', value: 45 } },
  // The magnesium TUL is for non-dietary pharmacological doses only.
  magnesium: { unit: 'mg', female: same(rda(370, 310)), male: same(rda(440, 370)), upper: { scope: 'supplements_only', value: 350 } },
  // 23% bioavailability is assumed.
  zinc: { unit: 'mg', female: same(rda(13.2, 11)), male: [rda(17, 14.1), rda(17, 14)], upper: { scope: 'all_sources', value: 40 } },
  // Recommended on the WHO basis, a sodium:potassium ratio of 1:1 in mmol being desirable.
  potassium: { unit: 'mg', female: same(ai(3500)), male: same(ai(3500)) },
};

/** The nutrients whose target is the Estimated Average Requirement on this set, not the allowance (plan 4.10, Q2). */
export const ICMR_EAR_TARGETS: ReadonlySet<MicroKey> = new Set(['iron', 'zinc', 'vitaminB12']);

export interface IcmrReference extends MicroReference {
  /** The Estimated Average Requirement, when ICMR gives one. */
  ear?: number;
}

/**
 * The allowance (or Adequate Intake), its Estimated Average Requirement and its Upper Limit for a sex used for calculations and a band.
 * `average` is the mean of the female and male values at every step, as on the National Academies' side (plan 4.1).
 */
export function icmrReference(nutrient: MicroKey, sex: SexForCalc, band: IcmrBand): IcmrReference {
  const table = ICMR_MICROS[nutrient];
  const i = ICMR_BANDS.indexOf(band);
  const f = table.female[i]!;
  const m = table.male[i]!;
  const pick = sex === 'female' ? f : sex === 'male' ? m : undefined;
  const value = pick ? pick.rda : (f.rda + m.rda) / 2;
  const ear = pick ? pick.ear : f.ear !== undefined && m.ear !== undefined ? (f.ear + m.ear) / 2 : undefined;
  return {
    value,
    type: f.type,
    ...(ear !== undefined ? { ear } : {}),
    ...(table.upper ? { upperLevel: table.upper.value, upperScope: table.upper.scope } : {}),
  };
}

// ---- macronutrients, sodium and potassium [R] ----------------------------------------------------------------

/** 0.83 g per kg of body weight: 54 g for the 65 kg man and 46 g for the 55 kg woman (1.0 for low-quality cereal diets). */
export const ICMR_PROTEIN_RDA_G_PER_KG = 0.83;
/** About 15 g per 1,000 kcal: ICMR's own table gives 14.1 to 15.1 g for every activity category of both sexes [A, read from the table]. */
export const ICMR_FIBRE_G_PER_1000_KCAL = 15;
/** The acceptable macronutrient distribution ranges for adults (% of energy): fat 15 to 35 (a minimum of 20 for total fat), carbohydrate 45 to 65. */
export const ICMR_AMDR = { fat: { low: 0.15, high: 0.35 }, carbs: { low: 0.45, high: 0.65 } } as const;
/** A safe sodium intake of 2,000 mg a day (5 g of salt), because of how common high blood pressure is in India; the WHO figure. */
export const ICMR_SODIUM_LIMIT_MG = 2000;
/** Potassium 3,500 mg a day, from the WHO recommendation. */
export const ICMR_POTASSIUM_MG = 3500;
/** Dietary Guidelines for Indians 2024: added sugar under 5% of energy. */
export const ICMR_ADDED_SUGAR_SHARE = 0.05;
