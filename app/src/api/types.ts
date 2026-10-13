/** Response shapes of the Worker API (worker/src/routes/*). */

export type Meal = 'breakfast' | 'lunch' | 'snack' | 'dinner';
export type ItemStatus = 'resolved' | 'pending_food' | 'pending_unit';
export type CallKind = 'scheduled' | 'retry' | 'test' | 'manual';
export type CallStatus = 'queued' | 'called' | 'tool_saved' | 'no_list' | 'failed';

export type NutrientKind = 'energy' | 'minimum' | 'limit' | 'range' | 'amount';

export interface NutrientInfo {
  key: string;
  label: string;
  unit: string;
  /** What a target for the nutrient means (the Worker's catalogue). */
  kind: NutrientKind;
  /** Which span judges it: a week, or four weeks for vitamins that vary too much day to day. */
  window: 'week' | 'four_weeks';
  /** Where it sits on the "All nutrients" screen. */
  group?: 'energy_and_macros' | 'get_enough' | 'keep_in_check' | 'vitamins_and_minerals';
  /** The general reference for a typical adult (2,000 kcal), not a personal target. */
  defaultGoal: number | null;
  /** A `range` nutrient's expected share of energy, and the energy in a gram of it. */
  energyShare?: { low: number; high: number; kcalPerGram: number };
}

export interface Meta {
  units: string[];
  baseUnits: string[];
  meals: Meal[];
  nutrients: NutrientInfo[];
  engineVersion?: string;
  referenceSets?: { id: string; label: string; available: boolean }[];
}

export type NutrientValues = Record<string, number | null>;
export type Totals = Record<string, { value: number; missingItems: number }>;

export interface Profile {
  id: string;
  name: string;
}

export interface CallInfo {
  id: number;
  vapiCallId: string | null;
  localDate: string;
  kind: CallKind | 'unknown';
  status: CallStatus;
  endedReason: string | null;
  durationSeconds: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  transcript?: string | null;
}

export interface Settings {
  id: string;
  name: string;
  timezone: string;
  callTime: string | null;
  callEnabled: boolean;
  vapi: { configured: boolean };
  lastCall: CallInfo | null;
}

export interface Goal {
  key: string;
  label: string;
  unit: string;
  kind: NutrientKind;
  defaultGoal: number | null;
  target: number | null;
  custom: boolean;
}

export interface GoalWarning {
  nutrient: string;
  id: 'below_floor';
  /** The lowest calorie target shown without a warning. */
  floor: number;
}

export interface GoalsResponse {
  goals: Goal[];
  warnings: GoalWarning[];
}

export interface Item {
  id: string;
  localDate: string;
  meal: Meal | null;
  rawName: string;
  normalizedName: string;
  quantity: number;
  unit: string;
  foodId: string | null;
  foodName: string | null;
  baseUnit: string | null;
  status: ItemStatus;
  source: 'call' | 'manual' | 'import';
  callId: string | null;
  createdAt: string;
  nutrients: NutrientValues;
  /** What the amount comes to in grams or millilitres, when the food says (plan 7.7). Absent from an older Worker. */
  weight?: { value: number; unit: 'g' | 'ml' } | null;
  /** An amount worth a second look (a misheard call, a typo), or null. It still counts. */
  amountCheck?: AmountCheck | null;
}

/** Why a logged amount is worth a second look: more energy than one dish has, more helpings than usual, or a large weight. */
export type AmountCheck = 'large_energy' | 'many_servings' | 'large_weight';

/** What a person can say about a day (plan 7.2): it is complete, it looks incomplete, or leave it out of the reports. */
export type DayMark = 'complete' | 'partial' | 'skip';

export interface Day {
  date: string;
  /** The person's own mark on the day, or null. */
  status: DayMark | null;
  /** How the weekly figures read the day (plan 7.2), by the report's own rules. Absent from an older Worker. */
  dayState?: { state: DayState; reason: PartialReason | null };
  items: Item[];
  totals: Totals;
  goals: Record<string, number | null>;
  /** The nutrients whose goal the person typed; the rest read the general reference. */
  customGoals: string[];
  pendingCount: number;
  calls: CallInfo[];
}

export interface DayRange {
  from: string;
  to: string;
  days: { date: string; status: DayMark | null; itemCount: number; pendingCount: number; totals: Totals }[];
  goals: Record<string, number | null>;
  customGoals: string[];
}

/** Where a food's numbers came from (plan 7.4): provenance, not authority. */
export type FoodSource = 'label' | 'database' | 'recipe' | 'estimate';
/** What a food's numbers describe: the food as eaten (cooked, or eaten as it is), or raw and dry, before cooking (plan 7.7). */
export type FoodForm = 'as_eaten' | 'raw';

export interface Food {
  id: string;
  name: string;
  displayName: string;
  baseUnit: string;
  nutrients: NutrientValues;
  aliases: string[];
  units: { unit: string; servings: number }[];
  source: FoodSource | null;
  /** When someone last saved its numbers or its source. */
  reviewedAt: string | null;
  /** Raw or as eaten; null when nobody said (and from an older Worker). */
  form?: FoodForm | null;
}

/**
 * A problem the Worker found in a food's numbers (plan 7.4): an id and the numbers involved, worded by the app. An `error`
 * means the values cannot all be true and the save is refused; a `warning` is a probable typo, for the person to confirm.
 */
export interface FoodIssue {
  id: string;
  severity: 'error' | 'warning';
  nutrient?: string;
  params: Record<string, number | string>;
}

export interface FoodCheck {
  errors: FoodIssue[];
  warnings: FoodIssue[];
}

/** How often and how lately one food was logged for one meal (worker/src/domain/history.ts). */
export interface MealHistory {
  /** Days it was logged for the meal. */
  days: number;
  /** Frequency and recency in one number; higher is more likely. */
  score: number;
  lastDate: string;
  /** The amount logged most often for the meal. */
  quantity: number;
  unit: string;
}

/** One food in a person's own log, with how it was logged at each meal. Only the meals it was logged for are present. */
export interface HistoryFood {
  foodId: string | null;
  /** The normalized name logging it again resolves by. */
  name: string;
  displayName: string;
  days: number;
  score: number;
  lastDate: string;
  quantity: number;
  unit: string;
  meals: Partial<Record<Meal, MealHistory>>;
}

export interface FoodHistory {
  asOf: string;
  windowDays: number;
  halfLifeDays: number;
  foods: HistoryFood[];
}

/** A food eaten in the last four weeks that is missing values the weekly view needs. */
export interface FoodGap {
  foodId: string;
  name: string;
  baseUnit: string;
  /** Its share of the energy logged in the window, 0 to 1. */
  share: number;
  items: number;
  missing: string[];
  source: FoodSource | null;
  reviewedAt: string | null;
}

export interface FoodGaps {
  from: string;
  to: string;
  foods: FoodGap[];
  loggedFoods: number;
  completeFoods: number;
  /** The share of logged energy that comes from foods with every value. */
  completeShare: number;
}

export interface Suggestion {
  foodId: string;
  name: string;
  displayName: string;
  matched: string;
  score: number;
}

export interface UnknownFood {
  normalizedName: string;
  examples: string[];
  units: string[];
  itemCount: number;
  userCount: number;
  suggestions: Suggestion[];
}

export interface MissingUnit {
  foodId: string;
  foodName: string;
  baseUnit: string;
  unit: string;
  itemCount: number;
  userCount: number;
}

export interface Uncached {
  totals: { unknownFoods: number; missingUnits: number };
  unknownFoods: UnknownFood[];
  missingUnits: MissingUnit[];
}

export interface ItemInput {
  name: string;
  quantity: number;
  unit: string;
  meal?: Meal | null;
}

export interface FoodInput {
  displayName: string;
  baseUnit: string;
  nutrients: Record<string, number | null>;
  aliases?: string[];
  units?: { unit: string; servings: number }[];
  /** `null` clears it; leave it out to keep what is there. */
  source?: FoodSource | null;
  /** The same for raw or as eaten. */
  form?: FoodForm | null;
}

export interface StartCallResponse {
  callId: number;
  localDate: string;
  publicKey: string;
  /** Inline Vapi assistant, passed straight to vapi.start(). */
  assistant: Record<string, unknown>;
}

// ---- personal targets (WEEKLY_BREAKDOWN_PLAN.md 9.3): the shapes the Worker serves ----------------------

export type Mode = 'personalised' | 'generic' | 'reference_only';
export type TargetKind2 = 'energy' | 'minimum' | 'limit' | 'range';
/** [R] reference value, [E] estimate with known error, [G] guidance, [A] assumption. */
export type Evidence = 'R' | 'E' | 'G' | 'A';
export type SexForCalc = 'female' | 'male' | 'average';
export type ActivityLevel = 'inactive' | 'low_active' | 'active' | 'very_active';
export type HealthGoal = 'general_health' | 'maintain' | 'lose' | 'gain' | 'build_muscle';
export type Pace = 'gentle' | 'standard' | 'faster';
export type DietPattern = 'omnivore' | 'eggetarian' | 'vegetarian' | 'vegan' | 'pescatarian';
export type ReferenceSetId = 'nasem' | 'icmr_nin';

export interface HealthWarning {
  id: string;
  severity: 'info' | 'caution' | 'stop';
}

export interface TargetInfo {
  nutrient: string;
  kind: TargetKind2;
  unit: string;
  value: number;
  low?: number;
  high?: number;
  /** `EAR` on the Indian set for iron, zinc and vitamin B12: the Estimated Average Requirement stands in for the allowance. */
  refType: 'RDA' | 'EAR' | 'AI' | 'limit' | 'range' | 'estimate';
  upperLevel?: number;
  /** Fat and carbohydrate: the share of energy the day and the week are judged by (fat is 15% to 35% on the Indian set, 20% to 35% on the US one). */
  shareRange?: { low: number; high: number };
  window: 'week' | 'four_weeks';
  evidence: Evidence;
  basis: string;
  how: string;
  scored: boolean;
  verdicts: boolean;
  origin: 'recommended' | 'custom' | 'care_team';
}

export interface TargetSetInfo {
  id: string | null;
  effectiveFrom: string;
  engineVersion: string;
  referenceSet: ReferenceSetId;
  mode: Mode;
  inputs: {
    ageBand: string;
    sexForCalc: SexForCalc;
    heightCm: number;
    weightKg: number;
    bmi: number;
    activity: ActivityLevel;
    goal: HealthGoal;
    goalApplied: HealthGoal;
    pace: Pace;
    pattern: DietPattern;
  } | null;
  energy: {
    maintenance: number;
    target: number;
    low: number;
    high: number;
    method: 'nasem2023';
    floorApplied: boolean;
    delta: number;
    crossCheck: { mifflinPal: number; disagree: boolean };
  } | null;
  targets: TargetInfo[];
  warnings: HealthWarning[];
  availableGoals: HealthGoal[];
}

export interface HealthProfile {
  mode: Mode;
  birthYear?: number;
  birthMonth?: number;
  sexForCalc?: SexForCalc;
  heightCm?: number;
  activity?: ActivityLevel;
  goal?: HealthGoal;
  pace?: Pace;
  pattern?: DietPattern;
  referenceSet?: ReferenceSetId;
  weightKg?: number;
  weightDate?: string;
  dietInteractingMedicine?: boolean;
  numbersHidden?: boolean;
  consentVersion?: string;
  consentedAt?: string;
}

export interface CheckIn {
  due: boolean;
  weeks: number;
}

export interface ProfileResponse {
  profile: HealthProfile;
  targetSet: TargetSetInfo | null;
  warnings?: HealthWarning[];
  checkIn?: CheckIn | null;
}

export interface SafetyAnswers {
  pregnantOrBreastfeeding: boolean;
  eatingDisorder: boolean;
  clinicianDiet: boolean;
  dietInteractingMedicine: boolean;
}

/** What the person typed, in metric: the body of `PUT /me/profile` and `POST /me/targets/preview`. */
export interface ProfileInput {
  birthYear?: number;
  birthMonth?: number | null;
  sexForCalc?: SexForCalc;
  heightCm?: number;
  weightKg?: number;
  activity?: ActivityLevel;
  goal?: HealthGoal;
  pace?: Pace;
  pattern?: DietPattern;
  referenceSet?: ReferenceSetId;
  numbersHidden?: boolean;
}

export interface SourceInfo {
  title: string;
  publisher: string;
  year: number | null;
  url: string;
}

export interface TargetsResponse {
  mode: Mode;
  numbersHidden: boolean;
  targetSet: Partial<TargetSetInfo> & { id: string | null; effectiveFrom: string };
  targets: TargetInfo[];
  sources: Record<string, SourceInfo>;
  checkIn: CheckIn | null;
}

export interface GoalDetail extends Goal {
  origin: 'recommended' | 'custom' | 'care_team' | 'reference' | null;
  recommended: number | null;
  how?: string;
  basis?: string;
  evidence?: Evidence;
  setAt?: string | null;
  outsideBounds?: boolean;
}

export interface GoalsResponseV2 extends GoalsResponse {
  mode: Mode;
  hidden: boolean;
  goals: GoalDetail[];
  notes?: { nutrient: string; note: string }[];
}

export interface WeightEntry {
  date: string;
  weightKg: number;
}

// ---- the weekly report (WEEKLY_BREAKDOWN_PLAN.md 9.3): computed by the Worker, drawn by the app ------------

/** How a nutrient's week reads against its reference. There is no "bad": falling short and going over are described (plan 5.4). */
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

export type DayState = 'valid' | 'confirmed' | 'partial' | 'empty' | 'skipped' | 'in_progress' | 'future';
/** Why a day does not count yet: the person said so, too many foods are still unknown, or very little was logged. */
export type PartialReason = 'marked' | 'pending' | 'low';
export type Confidence = 'good' | 'fair' | 'rough' | 'insufficient';

/** Why a score is not shown (plan 5.5). `off`: the deployment does not show one, so there is no card at all. */
export type Withheld =
  | 'off'
  | 'few_days'
  | 'unknown_foods'
  | 'incomplete_days'
  | 'thin_data'
  | 'low_intake'
  | 'generic'
  | 'reference_only'
  | 'numbers_hidden';

export interface DayReport {
  date: string;
  state: DayState;
  /** Logged energy, or null for a day that is not shown (numbers hidden, nothing logged, left out, not yet). */
  kcal: number | null;
  lowIntake: boolean;
  veryHigh: boolean;
  pendingItems: number;
}

export interface NutrientReport {
  nutrient: string;
  /** What the bar is drawn against; null where there is none (total sugars, or reference-only without care-team numbers). */
  target: TargetInfo | null;
  /** The mean per assessed day; null when there is no figure to give. */
  meanPerAssessedDay: number | null;
  /** Some foods had no value: the total can only be higher. */
  isLowerBound: boolean;
  /** Share of logged energy from foods that have a value (for a limit, the lower of that and the share of items). */
  dataCoverage: number;
  daysMeeting: number;
  assessedDays: number;
  /** Seven entries, Monday first; null for a day that was not assessed. */
  dayValues: (number | null)[];
  assessment: Assessment;
  /** For fat and carbohydrate: the share of logged energy, 0 to 1. */
  shareOfEnergy?: number;
  topSources: { foodId: string; name: string; share: number }[];
  /** The week's average against earlier weeks with enough days and values; null until there are three. */
  trend?: NutrientTrend | null;
}

/** How a week's average compares with earlier weeks: only a change past the noise reads as one (plan 5.7). */
export interface NutrientTrend {
  direction: 'higher' | 'lower' | 'about_the_same';
  previousMean: number;
  weeks: number;
}

/** An amount worth a second look, on a day of the week up to today. */
export interface AmountToCheck {
  date: string;
  name: string;
  quantity: number;
  unit: string;
  kcal: number | null;
  reason: AmountCheck;
}

/** What is missing or uncertain in the week's figures (plan 7.8): the Worker's data-quality summary. */
export interface WeekQuality {
  /** `missing`: the values the gap foods lack most often, by the energy of the foods that lack them (absent from an older Worker). */
  foodsWithGaps: { count: number; energyShare: number; names: string[]; missing?: string[] };
  valueSources: Record<FoodSource | 'none', number>;
  amountsToCheck: AmountToCheck[];
}

export interface ScoreComponent {
  id: string;
  points: number;
  outOf: number;
  coverage: number;
  scorable: boolean;
  density?: number;
  standard: string;
}

export interface ScoreReport {
  value: number | null;
  /** The card's figure: the nearest 5, rounded down when `isMinimum`. */
  shown: number | null;
  /** A component is unknown: "at least". */
  isMinimum: boolean;
  points: number;
  outOf: number;
  /** The leave-one-day-out range, with four or five assessed days. */
  range: [number, number] | null;
  components: ScoreComponent[];
  withheld?: Withheld;
}

export interface Insight {
  id: string;
  priority: 1 | 2 | 3 | 4 | 5;
  nutrient?: string;
  params: Record<string, number | string>;
}

export interface HistoryWeek {
  weekStart: string;
  assessedDays: number;
  energyPct: number | null;
  proteinPct: number | null;
  score: number | null;
}

export interface TrendPoint {
  date: string;
  weightKg: number;
  /** The smoothed trend at that weigh-in: one day's water does not move it. */
  trendKg: number;
}

/** The trend set against what the plan expects over the same weeks (plan 4.9): information, with its range. */
export interface PlanCheck {
  weeks: number;
  /** What the trend actually did, kg (negative is a loss). */
  observedKg: number;
  expectedKg: { low: number; high: number };
}

/** The weight line of the weekly view (plan 5.7, Phase 5). Absent in low-pressure mode. */
export interface WeightReport {
  latest: { date: string; weightKg: number };
  trendKg: number;
  /** kg a week from the trend; null until there are three weeks and six weigh-ins. */
  ratePerWeekKg: number | null;
  /** About 0.35% of body weight: a change smaller than this is the scale's ordinary swing. */
  noiseBandKg: number;
  weighIns: number;
  points: TrendPoint[];
  plan: PlanCheck | null;
}

/** EXPERIMENTAL (plan 4.9): what four weeks of logs and the weight trend suggest maintenance energy is. Never applied. */
export interface Calibration {
  suggestedKcal: number;
  currentKcal: number;
  uncertaintyKcal: number;
  days: number;
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
  /** null in low-pressure mode, generic mode, and reference-only mode without a care-team energy target. */
  energy: { meanKcal: number | null; target: number; low: number; high: number; daysInBand: number; assessedDays: number } | null;
  /** The rows that lead the Report tab, in order (plan 5.3). */
  lead: string[];
  nutrients: NutrientReport[];
  /** The vitamins (A, C, D, E, K, B12 and folate) over the rolling four weeks. */
  fourWeek: NutrientReport[];
  /** What is missing or uncertain; null with numbers hidden, absent from an older Worker. */
  quality?: WeekQuality | null;
  score: ScoreReport;
  scoreTrend: 'higher' | 'lower' | 'about_the_same' | null;
  insights: Insight[];
  weight: WeightReport | null;
  calibration: Calibration | null;
  /** Oldest first, ending with the reported week. */
  history: HistoryWeek[];
  disclaimerId: string;
}
