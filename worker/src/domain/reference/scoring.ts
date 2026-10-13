import type { NutrientKey } from '../nutrients';

/**
 * The standards behind the "Nutrient mix" score (WEEKLY_BREAKDOWN_PLAN.md 5.5), and every tunable edge
 * of the weekly report in one object so the plan and the code cannot drift apart (Appendix F's
 * CONFIG). Changing a number here is a product decision; the [A] numbers are design choices tied to
 * the evidence, not standards.
 */
export interface ReportConfig {
  // --- day states (7.2) [A]
  /** A day under this many kcal is `partial` however small the target. */
  minValidKcalFloor: number;
  /** ... or under this share of the person's own energy target. */
  minValidShareOfTarget: number;
  /** More than this share of a day's items pending makes it `partial`. */
  maxPendingItemShare: number;
  // --- how sure we are (7.6) [A]
  minDaysForSummary: number;
  // --- coverage (7.3) [A]
  coverageComplete: number;
  coveragePartial: number;
  coverageForScore: number;
  // --- assessment bands (5.4) [A]
  meetsRatio: number;
  closeRatio: number;
  wellOverRatio: number;
  energyBand: number;
  // --- score (5.5)
  /** HEI-2020 sodium standard [R], mg per 1,000 kcal: full credit at or below, none at or above. */
  sodiumDensityFull: number;
  sodiumDensityZero: number;
  /** Unknown components worth more than this share of the points withhold the score [A]. */
  maxUnknownShare: number;
  lowIntakeDaysToWithhold: number;
  /** Phase 4: saturated fat and added sugars join the score. */
  moderationComponents: boolean;
  /** Phase 5, experimental: a suggestion of maintenance energy from logged intake and the weight trend (plan 4.9). Off until switched on. */
  calibration: boolean;
  /**
   * Whether to compute the Nutrient mix at all. On in the engine, so its rules stay tested; the deployment turns it off unless
   * `NUTRIENT_SCORE` says otherwise, because a score can look surer than incomplete food data allows: the insights, the averages
   * and what is missing come first, and the score is added once the foods people eat have their values (plan 5.5).
   */
  score: boolean;
  // --- insights (5.6) [A]
  weekendMinWeekendDays: number;
  weekendMinWeekdayDays: number;
  weekendDifference: number;
  /** Implausibly high single days, kcal (7.2): 3,500 on the female calculation, 4,200 male, 3,850 average and generic. */
  veryHighKcal: { female: number; male: number; average: number };
  // --- trends (5.5, 5.7) [A]
  trendMinAssessedDays: number;
  trendMinNoiseBand: number;
  /** The rolling window the high-variation vitamins are judged over, in days (4.6). */
  fourWeekDays: number;
  fourWeekMinAssessedDays: number;
  maxInsights: number;
}

export const REPORT_CONFIG: ReportConfig = {
  minValidKcalFloor: 500,
  minValidShareOfTarget: 0.6,
  maxPendingItemShare: 1 / 3,
  minDaysForSummary: 3,
  coverageComplete: 0.9,
  coveragePartial: 0.5,
  coverageForScore: 0.8,
  meetsRatio: 0.9,
  closeRatio: 0.75,
  wellOverRatio: 1.25,
  energyBand: 0.1,
  sodiumDensityFull: 1100,
  sodiumDensityZero: 2000,
  maxUnknownShare: 0.25,
  lowIntakeDaysToWithhold: 3,
  moderationComponents: false,
  calibration: false,
  score: true,
  weekendMinWeekendDays: 2,
  weekendMinWeekdayDays: 3,
  weekendDifference: 0.15,
  veryHighKcal: { female: 3500, male: 4200, average: 3850 },
  trendMinAssessedDays: 3,
  trendMinNoiseBand: 5,
  fourWeekDays: 28,
  fourWeekMinAssessedDays: 3,
  maxInsights: 3,
};

export type ScoreComponentId =
  | 'protein'
  | 'fibre'
  | 'potassium'
  | 'calcium'
  | 'iron'
  | 'magnesium'
  | 'zinc'
  | 'sodium'
  | 'saturated_fat'
  | 'added_sugars';

export interface ScoreComponentSpec {
  id: ScoreComponentId;
  /** The catalogue nutrient it reads. */
  nutrient: NutrientKey;
  points: number;
  /** `adequacy`: credit grows with density up to the reference; `limit`: credit falls with density. */
  shape: 'adequacy' | 'sodium' | 'share_of_energy';
  /** For `share_of_energy`: kcal in a gram, and the share of energy at which credit is full and zero. */
  kcalPerGram?: number;
  fullAtOrBelow?: number;
  zeroAtOrAbove?: number;
  /** The standard that was applied, in words (shown in the breakdown). */
  standard: string;
  moderation?: boolean;
}

/**
 * Which components, in order, with their points (5.5): 10 protein, 10 fibre, 5 potassium, 5 each for
 * four minerals, 10 sodium = 55; saturated fat and added sugars add 10 each in Phase 4 (75). The
 * vitamins are not here: they vary too much day to day and have a four-week view of their own.
 */
export const SCORE_COMPONENTS: readonly ScoreComponentSpec[] = [
  { id: 'protein', nutrient: 'protein', points: 10, shape: 'adequacy', standard: 'Protein per 1,000 kcal against your protein target' },
  { id: 'fibre', nutrient: 'fiber', points: 10, shape: 'adequacy', standard: 'Fibre per 1,000 kcal against 14 g per 1,000 kcal (National Academies)' },
  { id: 'potassium', nutrient: 'potassium', points: 5, shape: 'adequacy', standard: 'Potassium per 1,000 kcal against the Adequate Intake (National Academies)' },
  { id: 'calcium', nutrient: 'calcium', points: 5, shape: 'adequacy', standard: 'Calcium per 1,000 kcal against the Recommended Dietary Allowance (National Academies)' },
  { id: 'iron', nutrient: 'iron', points: 5, shape: 'adequacy', standard: 'Iron per 1,000 kcal against the Recommended Dietary Allowance (National Academies)' },
  { id: 'magnesium', nutrient: 'magnesium', points: 5, shape: 'adequacy', standard: 'Magnesium per 1,000 kcal against the Recommended Dietary Allowance (National Academies)' },
  { id: 'zinc', nutrient: 'zinc', points: 5, shape: 'adequacy', standard: 'Zinc per 1,000 kcal against the Recommended Dietary Allowance (National Academies)' },
  { id: 'sodium', nutrient: 'sodium', points: 10, shape: 'sodium', standard: 'Sodium: full credit at 1,100 mg per 1,000 kcal or less, none at 2,000 or more (Healthy Eating Index-2020)' },
];

/**
 * Phase 4 components (HEI-2020 linear standards [R]), switched on by `ReportConfig.moderationComponents`: saturated fat full at 8% of
 * energy or less and none at 16% or more, added sugars full at 6.5% or less and none at 26% or more, 10 points each, so the score is
 * then out of 75. Both are limits: a partial total can prove "over" but never "within", so an unknown one earns nothing, and with both
 * unknown (20 of 75 points) the score is withheld. They switch on once the foods people eat have values for them (plan 5.5, Phase 4).
 */
export const MODERATION_COMPONENTS: readonly ScoreComponentSpec[] = [
  {
    id: 'saturated_fat',
    nutrient: 'saturatedFat',
    points: 10,
    shape: 'share_of_energy',
    kcalPerGram: 9,
    fullAtOrBelow: 0.08,
    zeroAtOrAbove: 0.16,
    standard: 'Saturated fat as a share of energy: full credit at 8% or less, none at 16% or more (Healthy Eating Index-2020)',
    moderation: true,
  },
  {
    id: 'added_sugars',
    nutrient: 'addedSugar',
    points: 10,
    shape: 'share_of_energy',
    kcalPerGram: 4,
    fullAtOrBelow: 0.065,
    zeroAtOrAbove: 0.26,
    standard: 'Added sugars as a share of energy: full credit at 6.5% or less, none at 26% or more (Healthy Eating Index-2020)',
    moderation: true,
  },
];

/**
 * What each adequacy component is measured against on the India set (ICMR-NIN, 2020): the tables are its own, and iron and zinc are read
 * against the Estimated Average Requirement. The sodium and moderation standards are the score's own (Healthy Eating Index-2020), on both sets.
 */
const INDIAN_STANDARDS: Partial<Record<ScoreComponentId, string>> = {
  fibre: 'Fibre per 1,000 kcal against 15 g per 1,000 kcal (ICMR-NIN)',
  potassium: 'Potassium per 1,000 kcal against the recommended intake (ICMR-NIN)',
  calcium: 'Calcium per 1,000 kcal against the Recommended Dietary Allowance (ICMR-NIN)',
  iron: 'Iron per 1,000 kcal against the Estimated Average Requirement (ICMR-NIN)',
  magnesium: 'Magnesium per 1,000 kcal against the Recommended Dietary Allowance (ICMR-NIN)',
  zinc: 'Zinc per 1,000 kcal against the Estimated Average Requirement (ICMR-NIN)',
};

/** The components the score uses under a config, with the standards worded for the reference set the person's targets come from. */
export function scoreComponents(config: ReportConfig, referenceSet: 'nasem' | 'icmr_nin' = 'nasem'): readonly ScoreComponentSpec[] {
  const components = config.moderationComponents ? [...SCORE_COMPONENTS, ...MODERATION_COMPONENTS] : SCORE_COMPONENTS;
  if (referenceSet !== 'icmr_nin') return components;
  return components.map((c) => (INDIAN_STANDARDS[c.id] ? { ...c, standard: INDIAN_STANDARDS[c.id]! } : c));
}
