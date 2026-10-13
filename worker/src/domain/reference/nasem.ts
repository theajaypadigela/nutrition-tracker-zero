/**
 * The US/Canada reference set (National Academies), every value tagged with its source
 * (WEEKLY_BREAKDOWN_PLAN.md 4.2 to 4.6, Appendix B). Pure data and tiny lookups: no formulas live here.
 *
 * Evidence tags as in the plan: [R] a reference value from a standards body, [E] an estimate with known
 * error, [G] guidance, [A] an assumption. A change to any table changes its hash (`tableHash`), which a
 * test pins, so every edit shows up in review (plan 11.3).
 */
import type { NutrientKey } from '../nutrients';
import type { SourceId } from './sources';

// ---- age bands ---------------------------------------------------------------------------------------

export const AGE_BANDS = ['19-30', '31-50', '51-70', '>70'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

/** The reference age band for an adult of `age` whole years. Bands cover 19 to 100 with no gap or overlap. */
export function ageBandOf(age: number): AgeBand {
  return age <= 30 ? '19-30' : age <= 50 ? '31-50' : age <= 70 ? '51-70' : '>70';
}

const bandIndex = (band: AgeBand) => AGE_BANDS.indexOf(band);

// ---- energy: NASEM 2023, Table 5-5 [R] ---------------------------------------------------------------

export type ActivityLevel = 'inactive' | 'low_active' | 'active' | 'very_active';
export const ACTIVITY_ORDER: readonly ActivityLevel[] = ['inactive', 'low_active', 'active', 'very_active'];

/** kcal/day = c0 + cAge x age (years) + cHeight x height (cm) + cWeight x weight (kg); adults 19 and over, all BMIs. */
export interface EerCoefficients {
  c0: number;
  cAge: number;
  cHeight: number;
  cWeight: number;
}

export const EER_COEFFICIENTS: Record<'male' | 'female', Record<ActivityLevel, EerCoefficients>> = {
  male: {
    inactive: { c0: 753.07, cAge: -10.83, cHeight: 6.5, cWeight: 14.1 },
    low_active: { c0: 581.47, cAge: -10.83, cHeight: 8.3, cWeight: 14.94 },
    active: { c0: 1004.82, cAge: -10.83, cHeight: 6.52, cWeight: 15.91 },
    very_active: { c0: -517.88, cAge: -10.83, cHeight: 15.61, cWeight: 19.11 },
  },
  female: {
    inactive: { c0: 584.9, cAge: -7.01, cHeight: 5.72, cWeight: 11.71 },
    low_active: { c0: 575.77, cAge: -7.01, cHeight: 6.6, cWeight: 12.14 },
    active: { c0: 710.25, cAge: -7.01, cHeight: 6.54, cWeight: 12.34 },
    very_active: { c0: 511.83, cAge: -7.01, cHeight: 9.07, cWeight: 12.56 },
  },
};

/** Standard error of a predicted value, kcal/day [R] (NASEM Table 5-8). */
export const EER_STANDARD_ERROR = { male: 342, female: 241 } as const;

/** NASEM Table 7-1 physical activity levels, used only for the Mifflin-St Jeor cross-check [R]. */
export const PAL_TABLE_7_1: Record<ActivityLevel, number> = {
  inactive: 1.4,
  low_active: 1.6,
  active: 1.75,
  very_active: 2.05,
};

// ---- macronutrients ----------------------------------------------------------------------------------

/** Acceptable Macronutrient Distribution Ranges, as a share of energy [R] (NASEM). */
export const AMDR = {
  protein: { low: 0.1, high: 0.35 },
  fat: { low: 0.2, high: 0.35 },
  carbs: { low: 0.45, high: 0.65 },
} as const;

/** Protein Recommended Dietary Allowance, g per kg of body weight [R]. */
export const PROTEIN_RDA_G_PER_KG = 0.8;
/** The highest protein figure the guidelines treat as typical, g per kg [G] (ISSN; Morton 2018). */
export const PROTEIN_MAX_G_PER_KG = 2.0;
/** Carbohydrate Recommended Dietary Allowance, g per day [R]. */
export const CARB_RDA_G = 130;
/** Fibre Adequate Intake per 1,000 kcal, and the WHO floor in grams [R]. */
export const FIBRE_G_PER_1000_KCAL = 14;
export const FIBRE_FLOOR_G = 25;
/** Fat: the default share of energy [A] and the lowest the engine will hold it at [R range edge]. */
export const FAT_DEFAULT_SHARE = 0.3;
export const FAT_MIN_SHARE = 0.2;

// ---- sodium and potassium (NASEM 2019) ---------------------------------------------------------------

/** Chronic Disease Risk Reduction level: the intake above which reducing sodium is expected to help [R]. */
export const SODIUM_LIMIT_MG = 2300;
/** WHO's stricter limit, the default on the Indian reference set [R]. */
export const SODIUM_LIMIT_WHO_MG = 2000;
/** The 1,500 mg Adequate Intake is an adequacy value and is never shown as a target [R]. */
export const SODIUM_AI_MG = 1500;

// ---- vitamins and minerals: NASEM consolidated tables (Appendix J, 2019) [R] -------------------------

export type MicroKey =
  | 'vitaminA'
  | 'vitaminC'
  | 'vitaminD'
  | 'vitaminE'
  | 'vitaminK'
  | 'vitaminB12'
  | 'folate'
  | 'calcium'
  | 'iron'
  | 'magnesium'
  | 'zinc'
  | 'potassium';

export const MICRO_KEYS: readonly MicroKey[] = [
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

/**
 * What an Upper Level covers. Only `all_sources` limits cover intake from food, so only those are
 * ever compared with a food log (plan 4.6): vitamin A's is preformed retinol only, and the vitamin E,
 * folic acid, niacin and magnesium limits are for supplements and fortified foods only.
 */
export type UpperLevelScope = 'all_sources' | 'supplements_only' | 'preformed_only';

export interface DriValue {
  /** The RDA, or the Adequate Intake where there is no RDA. */
  ref: number;
  type: 'RDA' | 'AI';
  /** Estimated Average Requirement; none for an Adequate Intake. */
  ear?: number;
}

export interface MicroTable {
  unit: string;
  basis: SourceId;
  /** female, male: one row of four age bands each (19-30, 31-50, 51-70, over 70). */
  female: readonly [DriValue, DriValue, DriValue, DriValue];
  male: readonly [DriValue, DriValue, DriValue, DriValue];
  /** The Upper Level per age band, when there is one. */
  upper?: { scope: UpperLevelScope; values: readonly [number, number, number, number] };
}

const rda = (ref: number, ear: number): DriValue => ({ ref, type: 'RDA', ear });
const ai = (ref: number): DriValue => ({ ref, type: 'AI' });
const four = <T>(v: T): readonly [T, T, T, T] => [v, v, v, v];

export const NASEM_MICROS: Record<MicroKey, MicroTable> = {
  vitaminA: {
    unit: 'mcg RAE',
    basis: 'nasem-dri-appendix-j',
    female: four(rda(700, 500)),
    male: four(rda(900, 625)),
    upper: { scope: 'preformed_only', values: four(3000) },
  },
  vitaminC: {
    unit: 'mg',
    basis: 'nasem-dri-appendix-j',
    female: four(rda(75, 60)),
    male: four(rda(90, 75)),
    upper: { scope: 'all_sources', values: four(2000) },
  },
  vitaminD: {
    unit: 'mcg',
    basis: 'nasem-dri-appendix-j',
    female: [rda(15, 10), rda(15, 10), rda(15, 10), rda(20, 10)],
    male: [rda(15, 10), rda(15, 10), rda(15, 10), rda(20, 10)],
    upper: { scope: 'all_sources', values: four(100) },
  },
  vitaminE: {
    unit: 'mg',
    basis: 'nasem-dri-appendix-j',
    female: four(rda(15, 12)),
    male: four(rda(15, 12)),
    upper: { scope: 'supplements_only', values: four(1000) },
  },
  vitaminK: {
    unit: 'mcg',
    basis: 'nasem-dri-appendix-j',
    female: four(ai(90)),
    male: four(ai(120)),
  },
  // Phase 4 (migration 0003). The same consolidated tables: B12 is 2.4 mcg for every adult (no Upper Level); folate is 400 mcg of
  // dietary folate equivalents, and its Upper Level of 1,000 mcg is for synthetic folic acid in supplements and fortified foods only.
  vitaminB12: {
    unit: 'mcg',
    basis: 'nasem-dri-appendix-j',
    female: four(rda(2.4, 2)),
    male: four(rda(2.4, 2)),
  },
  folate: {
    unit: 'mcg DFE',
    basis: 'nasem-dri-appendix-j',
    female: four(rda(400, 320)),
    male: four(rda(400, 320)),
    upper: { scope: 'supplements_only', values: four(1000) },
  },
  calcium: {
    unit: 'mg',
    basis: 'nasem-dri-appendix-j',
    female: [rda(1000, 800), rda(1000, 800), rda(1200, 1000), rda(1200, 1000)],
    male: [rda(1000, 800), rda(1000, 800), rda(1000, 800), rda(1200, 1000)],
    upper: { scope: 'all_sources', values: [2500, 2500, 2000, 2000] },
  },
  iron: {
    unit: 'mg',
    basis: 'nasem-dri-appendix-j',
    female: [rda(18, 8.1), rda(18, 8.1), rda(8, 5), rda(8, 5)],
    male: four(rda(8, 6)),
    upper: { scope: 'all_sources', values: four(45) },
  },
  magnesium: {
    unit: 'mg',
    basis: 'nasem-dri-appendix-j',
    female: [rda(310, 255), rda(320, 265), rda(320, 265), rda(320, 265)],
    male: [rda(400, 330), rda(420, 350), rda(420, 350), rda(420, 350)],
    upper: { scope: 'supplements_only', values: four(350) },
  },
  zinc: {
    unit: 'mg',
    basis: 'nasem-dri-appendix-j',
    female: four(rda(8, 6.8)),
    male: four(rda(11, 9.4)),
    upper: { scope: 'all_sources', values: four(40) },
  },
  potassium: {
    unit: 'mg',
    basis: 'nasem2019-potassium-ai',
    female: four(ai(2600)),
    male: four(ai(3400)),
  },
};

export type SexForCalc = 'female' | 'male' | 'average';

export interface MicroReference {
  value: number;
  type: 'RDA' | 'AI';
  ear?: number;
  upperLevel?: number;
  upperScope?: UpperLevelScope;
}

/**
 * The reference intake for a nutrient, sex used for calculations and age band. `average` is the mean
 * of the female and male values at every step (plan 4.1); its type and Upper Level come from the
 * female row, which agrees with the male row wherever the two differ only in size.
 */
export function microReference(nutrient: MicroKey, sex: SexForCalc, band: AgeBand): MicroReference {
  const table = NASEM_MICROS[nutrient];
  const i = bandIndex(band);
  const f = table.female[i]!;
  const m = table.male[i]!;
  const pick = sex === 'female' ? f : sex === 'male' ? m : undefined;
  const value = pick ? pick.ref : (f.ref + m.ref) / 2;
  const ear = pick ? pick.ear : f.ear !== undefined && m.ear !== undefined ? (f.ear + m.ear) / 2 : undefined;
  return {
    value,
    type: f.type,
    ...(ear !== undefined ? { ear } : {}),
    ...(table.upper ? { upperLevel: table.upper.values[i]!, upperScope: table.upper.scope } : {}),
  };
}

/** Iron on a plant-based pattern is 1.8 times the reference: 10% absorption against 18% [R] (NASEM 2001). */
export const IRON_PLANT_BASED_FACTOR = 1.8;
export const PLANT_BASED_PATTERNS = ['eggetarian', 'vegetarian', 'vegan'] as const;

// ---- the generic reference (no health profile): plan 4.6 --------------------------------------------

/** US label values for a 2,000 kcal diet [R], the standard reference energy on US and Indian labels. */
export const GENERIC_ENERGY_KCAL = 2000;
export const GENERIC_LABEL_VALUES = { protein: 50, carbs: 275, fat: 78, fiber: 28, sodium: 2300 } as const;
/** WHO's limit of 10% of energy from saturated fat (9 kcal a gram) and from free sugars (4 kcal a gram), on the 2,000 kcal reference [R]. */
export const ENERGY_LIMIT_SHARE = { saturatedFat: { share: 0.1, kcalPerGram: 9 }, addedSugar: { share: 0.1, kcalPerGram: 4 } } as const;
/** The grams that share of an energy target comes to, rounded to a whole gram. */
export const energyLimitGrams = (key: keyof typeof ENERGY_LIMIT_SHARE, energyKcal: number): number =>
  Math.round((ENERGY_LIMIT_SHARE[key].share * energyKcal) / ENERGY_LIMIT_SHARE[key].kcalPerGram);
/** The micronutrients of an average adult aged 31-50, from the table above [R]; the choice of that adult is [A]. */
export const GENERIC_BAND: AgeBand = '31-50';

/** The generic reference for one nutrient, or null where there is none (total sugars). */
export function genericReference(key: NutrientKey): number | null {
  if (key === 'calories') return GENERIC_ENERGY_KCAL;
  if (key === 'protein' || key === 'carbs' || key === 'fat' || key === 'fiber' || key === 'sodium') return GENERIC_LABEL_VALUES[key];
  if (key === 'saturatedFat' || key === 'addedSugar') return energyLimitGrams(key, GENERIC_ENERGY_KCAL);
  if ((MICRO_KEYS as readonly string[]).includes(key)) return microReference(key as MicroKey, 'average', GENERIC_BAND).value;
  return null;
}

// ---- table hashes (plan 11.3) ------------------------------------------------------------------------

/** JSON with sorted keys, so a hash does not depend on how a table was written. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/** A 32-bit FNV-1a hash as 8 hex digits. Not cryptographic: it only has to change when a number does. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
