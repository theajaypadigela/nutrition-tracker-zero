/**
 * The weekly report's output, and what each day is judged against (WEEKLY_BREAKDOWN_PLAN.md 9.3). The report generator is the
 * last of the four modules of the weekly pipeline: it takes what was logged (../intake), what is complete or missing (../quality)
 * and the target set in force on each day (../targets). It is computed at read time; nothing derived is stored, so correcting a
 * food still corrects every past week.
 */
import type { NutrientKey } from '../nutrients';
import type { ScoreComponentId } from '../reference/scoring';
import type { SexForCalc } from '../reference/nasem';
import type { DayLimits } from '../quality/days';
import type { Confidence, DayState } from '../quality/types';
import type { WeekQuality } from '../quality/week';
import type { Mode, Target } from '../targets/types';
import type { Calibration, PlanCheck, TrendPoint } from './weight';

/** Neutral by design: there is no "bad". Falling short and going over are described, not graded (plan 5.4). */
export type Assessment =
  | 'meets'
  | 'close'
  | 'below'
  | 'over'
  | 'well_over'
  | 'in_range'
  | 'outside'
  | 'unknown'
  | 'amount_only';

export type Withheld =
  /** The deployment does not show a score (`NUTRIENT_SCORE` is off): not a judgement on the week, so the app shows no card. */
  | 'off'
  | 'few_days'
  | 'unknown_foods'
  | 'incomplete_days'
  | 'thin_data'
  | 'low_intake'
  | 'generic'
  | 'reference_only'
  | 'numbers_hidden';

/**
 * What one day is judged against: the target set in force that day with any custom or care-team
 * override applied (`targets`, what the bars are drawn against), and the recommended reference values
 * the score uses (`standards`), which an override never changes (plan 6.1).
 */
export interface DayTargets extends DayLimits {
  mode: Mode;
  /** A personal energy target exists: the 60% rule for a half-logged day uses it. */
  personal: boolean;
  /** The target energy, kcal a day, or null. */
  energy: number | null;
  /** The recommended energy target the score's densities are measured against, or null (no score). */
  energyForScore: number | null;
  /** The lowest intake the app does not comment on (plan 4.3, 8.6): the sex-specific floor, 1,200 when unknown. */
  floor: number;
  /** An intake above this in one day is probably a typo (plan 7.2). */
  veryHigh: number;
  sex: SexForCalc | null;
  targets: Partial<Record<NutrientKey, Target>>;
  /** Recommended reference values per day for the score components (protein, fibre, potassium, minerals). */
  standards: Partial<Record<NutrientKey, number>>;
  /** The reference set of the target set in force that day (personalised mode only). */
  referenceSet?: 'nasem' | 'icmr_nin';
}

export interface DayReport {
  date: string;
  state: DayState;
  /** Logged energy (resolved items only), or null when the day is not shown (numbers hidden) or not logged. */
  kcal: number | null;
  lowIntake: boolean;
  veryHigh: boolean;
  pendingItems: number;
}

export interface NutrientReport {
  nutrient: NutrientKey;
  /** The target the bars are drawn against: null when there is none (total sugars, or reference-only without care-team numbers). */
  target: Target | null;
  /** The mean per assessed day; null when coverage is too low to say anything. */
  meanPerAssessedDay: number | null;
  /** Some foods had no value: the total can only be higher. */
  isLowerBound: boolean;
  /** Share of logged energy from foods that have a value (for a limit, the lower of that and the item share). */
  dataCoverage: number;
  daysMeeting: number;
  assessedDays: number;
  /** Seven entries, Monday first; null for a day that is not assessed or where no food had a value. */
  dayValues: (number | null)[];
  assessment: Assessment;
  /** For fat and carbohydrate: the share of logged energy, 0 to 1. */
  shareOfEnergy?: number;
  topSources: { foodId: string; name: string; share: number }[];
  /** The week's average against the earlier weeks that had enough days and values; null until there are three (plan 5.7). */
  trend: NutrientTrend | null;
}

/** How a week's daily average compares with earlier weeks: only a change past the noise reads as one (plan 5.5, 5.7). */
export interface NutrientTrend {
  direction: 'higher' | 'lower' | 'about_the_same';
  /** The mean of the earlier weeks' daily averages. */
  previousMean: number;
  /** How many earlier weeks (three or four) it is compared with. */
  weeks: number;
}

export interface ScoreComponent {
  id: ScoreComponentId;
  points: number;
  outOf: number;
  coverage: number;
  scorable: boolean;
  density?: number;
  standard: string;
}

export interface ScoreReport {
  value: number | null;
  /** Nearest 5; rounded down when `isMinimum`. */
  shown: number | null;
  /** A component is unknown: "at least N". */
  isMinimum: boolean;
  points: number;
  outOf: number;
  /** Leave-one-day-out range, with 4 or 5 assessed days. */
  range: [number, number] | null;
  components: ScoreComponent[];
  withheld?: Withheld;
}

export interface Insight {
  id: string;
  priority: 1 | 2 | 3 | 4 | 5;
  nutrient?: NutrientKey;
  params: Record<string, number | string>;
}

export interface HistoryWeek {
  weekStart: string;
  assessedDays: number;
  energyPct: number | null;
  proteinPct: number | null;
  score: number | null;
}

/** The weight line of the weekly view (plan 5.7, Phase 5): weigh-ins with their smoothed trend. Never present in low-pressure mode. */
export interface WeightReport {
  latest: { date: string; weightKg: number };
  trendKg: number;
  /** kg a week from the trend; null until there are three weeks and six weigh-ins. */
  ratePerWeekKg: number | null;
  /** About 0.35% of body weight: a change smaller than this is the scale's ordinary swing. */
  noiseBandKg: number;
  weighIns: number;
  /** The last twelve weeks of weigh-ins up to the end of the reported week, oldest first. */
  points: TrendPoint[];
  /** The trend against what the plan expects, for a plan that asks for a change; null with too little data. */
  plan: PlanCheck | null;
}

export interface WeeklyReport {
  engineVersion: string;
  week: { start: string; end: string; today: string; isCurrent: boolean };
  mode: Mode;
  targetSet: { id: string | null; effectiveFrom: string | null };
  display: { numbersHidden: boolean };
  coverage: {
    days: DayReport[];
    assessedDays: number;
    weekendAssessedDays: number;
    pendingItems: number;
    confidence: Confidence;
  };
  /** null in low-pressure mode, generic mode and reference-only mode without a care-team energy target. */
  energy: { meanKcal: number | null; target: number; low: number; high: number; daysInBand: number; assessedDays: number } | null;
  /** The nutrients that lead the Report tab for this person's goal and pattern (plan 5.3). */
  lead: NutrientKey[];
  nutrients: NutrientReport[];
  /** The vitamins (A, C, D, E, K, B12 and folate) over the rolling four weeks. */
  fourWeek: NutrientReport[];
  /**
   * What is missing or uncertain in the week's figures (the data-quality checker's summary, plan 7.8): foods without the values the
   * report reads, amounts worth a second look, and where the numbers come from. null with numbers hidden.
   */
  quality: WeekQuality | null;
  score: ScoreReport;
  /** How the score compares with the previous four weeks that had enough days: only a real change reads as one (plan 5.5). */
  scoreTrend: 'higher' | 'lower' | 'about_the_same' | null;
  insights: Insight[];
  /** null without weigh-ins, in low-pressure mode, and without personal targets. */
  weight: WeightReport | null;
  /** EXPERIMENTAL and off unless switched on: what the logs and the trend suggest maintenance is. Never applied. */
  calibration: Calibration | null;
  history: HistoryWeek[];
  disclaimerId: string;
}
