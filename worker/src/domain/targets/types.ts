/**
 * The types the targets engine, the weekly report and the API share (WEEKLY_BREAKDOWN_PLAN.md 4.7, 9.3).
 * The engine is deterministic and uses no AI: every result carries the inputs it used, an evidence tag,
 * a source and one plain sentence of how it was worked out.
 */
import type { NutrientKey } from '../nutrients';
import type { ReferenceBand } from '../reference/icmr';
import type { ActivityLevel, AgeBand, SexForCalc } from '../reference/nasem';
import type { SourceId } from '../reference/sources';

export type { ActivityLevel, AgeBand, SexForCalc } from '../reference/nasem';

/**
 * Which kind of targets a profile gets (plan 8.1). `generic`: nothing is known, so reference values
 * for a typical adult. `reference_only`: a reason not to set targets (a gate fired). `personalised`:
 * a complete profile and no gate fired.
 */
export type Mode = 'personalised' | 'generic' | 'reference_only';
export type TargetKind = 'energy' | 'minimum' | 'limit' | 'range';
/** [R] reference value, [E] estimate with known error, [G] guidance, [A] assumption (plan section 1). */
export type Evidence = 'R' | 'E' | 'G' | 'A';
/** An `AI` never gets "deficient" wording (plan 4.6). */
export type RefType = 'RDA' | 'EAR' | 'AI' | 'limit' | 'range' | 'estimate';
export type TargetOrigin = 'recommended' | 'custom' | 'care_team';

export const GOALS = ['general_health', 'maintain', 'lose', 'gain', 'build_muscle'] as const;
export type Goal = (typeof GOALS)[number];
export const PACES = ['gentle', 'standard', 'faster'] as const;
export type Pace = (typeof PACES)[number];
export const DIET_PATTERNS = ['omnivore', 'eggetarian', 'vegetarian', 'vegan', 'pescatarian'] as const;
export type DietPattern = (typeof DIET_PATTERNS)[number];
export const REFERENCE_SETS = ['nasem', 'icmr_nin'] as const;
export type ReferenceSet = (typeof REFERENCE_SETS)[number];
export const SEXES_FOR_CALC = ['female', 'male', 'average'] as const;
export const ACTIVITY_LEVELS = ['inactive', 'low_active', 'active', 'very_active'] as const;

/** What the person told us that changes a number or a message (plan 3.2). */
export interface HealthProfileInput {
  birthYear: number;
  /** Optional: tightens the age-band edges. */
  birthMonth: number | null;
  sexForCalc: SexForCalc;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  goal: Goal;
  /** Lose and Gain only. */
  pace: Pace;
  pattern: DietPattern;
  referenceSet: ReferenceSet;
}

/**
 * The safety check (plan 3.4). Used once to decide the mode and then discarded: the server keeps the
 * mode and the medicine flag, never which answer caused it.
 */
export interface SafetyAnswers {
  pregnantOrBreastfeeding: boolean;
  eatingDisorder: boolean;
  clinicianDiet: boolean;
  /** A medicine that can interact with food: turns off verdicts for vitamin K, potassium and sodium. */
  dietInteractingMedicine: boolean;
}

export const NO_SAFETY_FLAGS: SafetyAnswers = {
  pregnantOrBreastfeeding: false,
  eatingDisorder: false,
  clinicianDiet: false,
  dietInteractingMedicine: false,
};

export type WarningId =
  | 'reference_only'
  | 'under_19'
  | 'bmi_out_of_range'
  | 'lose_not_indicated_bmi'
  | 'lose_needs_clinician_80plus'
  | 'lose_65plus_needs_obesity'
  | 'gain_not_indicated_bmi'
  | 'underweight_notice'
  | 'floor_limited_deficit'
  | 'deficit_too_small'
  | 'iron_plant_based'
  | 'estimates_disagree'
  | 'medicine_amounts_only'
  | 'stale_weight';

export interface Warning {
  id: WarningId;
  severity: 'info' | 'caution' | 'stop';
}

export interface Target {
  nutrient: NutrientKey;
  kind: TargetKind;
  unit: string;
  /** What the bar is drawn against, per day. */
  value: number;
  /** The typical range around an energy estimate, or the edges of a `range` target. */
  low?: number;
  high?: number;
  refType: RefType;
  /** Only where the level covers food-sourced intake (plan 4.6). */
  upperLevel?: number;
  /**
   * For fat and carbohydrate: the share of energy the day and the week are judged by (fat 20% to 35% on the National Academies
   * set, 15% to 35% on ICMR-NIN's). A target stored before this existed has none and is judged by the National Academies' ranges.
   */
  shareRange?: { low: number; high: number };
  /** Which window judges it: a week, or four weeks for the vitamins that vary too much day to day. */
  window: 'week' | 'four_weeks';
  evidence: Evidence;
  /** A key into the sources registry. */
  basis: SourceId;
  /** One plain sentence for "How was this calculated?". */
  how: string;
  /** Whether it counts toward the Nutrient mix score. */
  scored: boolean;
  /** False with the medicine flag: amounts only, no verdict or nudge. */
  verdicts: boolean;
  origin: TargetOrigin;
}

export interface TargetInputs {
  /** The reference band the micronutrient values were read for: a National Academies age band, or ICMR's 19-59 / 60+. */
  ageBand: ReferenceBand;
  sexForCalc: SexForCalc;
  heightCm: number;
  weightKg: number;
  bmi: number;
  activity: ActivityLevel;
  goal: Goal;
  goalApplied: Goal;
  pace: Pace;
  pattern: DietPattern;
}

export interface EnergyEstimate {
  /** The NASEM estimate for a weight-stable adult, kcal a day, to the nearest 10. */
  maintenance: number;
  target: number;
  /** The typical range (one standard error either side) of the maintenance estimate. */
  low: number;
  high: number;
  method: 'nasem2023';
  /** The calorie floor shortened a loss. */
  floorApplied: boolean;
  /** kcal a day added to (positive) or taken from (negative) maintenance, to the nearest 10. */
  delta: number;
  crossCheck: { mifflinPal: number; disagree: boolean };
}

export interface TargetSet {
  id: string | null;
  /** 'YYYY-MM-DD' in the person's time zone. */
  effectiveFrom: string;
  engineVersion: string;
  referenceSet: ReferenceSet;
  mode: Mode;
  inputs: TargetInputs | null;
  energy: EnergyEstimate | null;
  targets: Target[];
  warnings: Warning[];
  /** The goals that were offered: a blocked goal is applied as Maintain, with the reason (plan 4.3). */
  availableGoals: Goal[];
  /** The week of the loss goal's start, for the 12-week check-in (plan 6.2, 8.1 G11). */
  lossStartedOn?: string | null;
}

export const ENGINE_VERSION = '1.1.0';
