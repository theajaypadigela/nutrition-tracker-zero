/**
 * Reading and writing health data (WEEKLY_BREAKDOWN_PLAN.md 6.2, 8.1, 9.1): the profile row, the versioned
 * target sets and the typed numbers, and the rule for what a day's goals are. The engine itself is pure and
 * lives in domain/; this file is the only place that knows the tables.
 *
 * Three rules shape it. A `reference_only` profile stores NO body data, and nothing says why. Safety answers
 * are used once to decide the mode and are never written anywhere. Target sets are immutable: changing a
 * weight or a goal adds a set, so last month is still judged by last month's targets.
 */
import { NUTRIENTS, isNutrientKey, type NutrientKey } from './domain/nutrients';
import { genericReference } from './domain/reference/nasem';
import { setInForce } from './domain/report/weekly';
import { applyOverrides, checkOverride, type Override } from './domain/targets/overrides';
import { computeTargets, genericTargetSet, referenceOnlySet } from './domain/targets/engine';
import { ageOn } from './domain/targets/profile';
import { referenceBandOf } from './domain/reference/icmr';
import {
  NO_SAFETY_FLAGS,
  type HealthProfileInput,
  type Mode,
  type SafetyAnswers,
  type Target,
  type TargetSet,
} from './domain/targets/types';

export interface HealthProfileRow {
  user_id: string;
  target_mode: 'personalised' | 'reference_only';
  birth_year: number | null;
  birth_month: number | null;
  sex_for_calc: 'female' | 'male' | 'average' | null;
  height_cm: number | null;
  activity_level: HealthProfileInput['activity'] | null;
  goal: HealthProfileInput['goal'] | null;
  pace: HealthProfileInput['pace'];
  diet_pattern: HealthProfileInput['pattern'];
  reference_set: HealthProfileInput['referenceSet'];
  diet_interacting_medicine: number;
  numbers_hidden: number;
  consent_version: string;
  consented_at: string;
  created_at: string;
  updated_at: string;
}

export interface TargetSetRow {
  id: string;
  user_id: string;
  effective_from: string;
  engine_version: string;
  reference_set: string;
  inputs_json: string;
  targets_json: string;
  created_at: string;
}

export interface WeightRow {
  id: string;
  user_id: string;
  local_date: string;
  weight_kg: number;
  created_at: string;
}

export interface GoalRow {
  nutrient: string;
  target: number;
  origin?: 'custom' | 'care_team';
  updated_at?: string | null;
}

// ---- statements ----------------------------------------------------------------------------------------

export const profileStatement = (db: D1Database, userId: string) => db.prepare('SELECT * FROM health_profiles WHERE user_id = ?').bind(userId);
export const setsStatement = (db: D1Database, userId: string) =>
  db.prepare('SELECT * FROM target_sets WHERE user_id = ? ORDER BY effective_from, created_at, id').bind(userId);
export const weightsStatement = (db: D1Database, userId: string, from?: string, to?: string) =>
  from && to
    ? db.prepare('SELECT * FROM weight_entries WHERE user_id = ?1 AND local_date BETWEEN ?2 AND ?3 ORDER BY local_date').bind(userId, from, to)
    : db.prepare('SELECT * FROM weight_entries WHERE user_id = ? ORDER BY local_date').bind(userId);
export const goalRowsStatement = (db: D1Database, userId: string) =>
  db.prepare('SELECT nutrient, target, origin, updated_at FROM user_goals WHERE user_id = ?').bind(userId);
/**
 * Only the numbers the person typed for themselves. A care-team number is health data: it exists only for a profile that told us a
 * reason not to set targets (plan 6.7), so without the profile's secret it is neither shown nor counted.
 */
export const ownGoalRowsStatement = (db: D1Database, userId: string) =>
  db.prepare("SELECT nutrient, target, origin, updated_at FROM user_goals WHERE user_id = ? AND origin = 'custom'").bind(userId);

/** profile, sets, weights, goals in one batch. */
export const healthStatements = (db: D1Database, userId: string) => [
  profileStatement(db, userId),
  setsStatement(db, userId),
  weightsStatement(db, userId),
  goalRowsStatement(db, userId),
];

/**
 * What the goals of a request need: with the secret, every typed number and the profile and its sets; without it, only the numbers
 * the person typed for themselves (no care-team numbers, which would say why there are no personal targets).
 */
export const goalStatements = (db: D1Database, userId: string, unlocked: boolean) =>
  unlocked ? [goalRowsStatement(db, userId), profileStatement(db, userId), setsStatement(db, userId)] : [ownGoalRowsStatement(db, userId)];

export interface HealthState {
  profile: HealthProfileRow | null;
  sets: TargetSet[];
  weights: WeightRow[];
  goals: GoalRow[];
}

export function healthFromResults(results: D1Result[]): HealthState {
  const [profile, sets, weights, goals] = results as [D1Result<HealthProfileRow>, D1Result<TargetSetRow>, D1Result<WeightRow>, D1Result<GoalRow>];
  return { profile: profile.results[0] ?? null, sets: sets.results.map(setFromRow), weights: weights.results, goals: goals.results };
}

export function goalStateFromResults(results: D1Result[], unlocked: boolean): HealthState {
  const goals = (results[0] as D1Result<GoalRow>).results;
  if (!unlocked) return { profile: null, sets: [], weights: [], goals };
  return {
    profile: (results[1] as D1Result<HealthProfileRow>).results[0] ?? null,
    sets: (results[2] as D1Result<TargetSetRow>).results.map(setFromRow),
    weights: [],
    goals,
  };
}

export async function loadHealth(db: D1Database, userId: string): Promise<HealthState> {
  return healthFromResults(await db.batch(healthStatements(db, userId)));
}

// ---- target sets, as stored ----------------------------------------------------------------------------

/**
 * A stored set. `inputs_json` holds what the person's inputs and the loss-goal start were; `targets_json` the
 * energy estimate, every Target, the warnings and the goals that were offered. No safety answer is in either.
 */
export function setFromRow(row: TargetSetRow): TargetSet {
  const inputs = JSON.parse(row.inputs_json) as { inputs: TargetSet['inputs']; lossStartedOn?: string | null };
  const out = JSON.parse(row.targets_json) as Pick<TargetSet, 'energy' | 'targets' | 'warnings' | 'availableGoals'>;
  return {
    id: row.id,
    effectiveFrom: row.effective_from,
    engineVersion: row.engine_version,
    referenceSet: row.reference_set as TargetSet['referenceSet'],
    mode: 'personalised',
    inputs: inputs.inputs,
    energy: out.energy,
    targets: out.targets,
    warnings: out.warnings,
    availableGoals: out.availableGoals,
    lossStartedOn: inputs.lossStartedOn ?? null,
  };
}

export function insertSetStatement(db: D1Database, userId: string, set: TargetSet, createdAt: string): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO target_sets (id, user_id, effective_from, engine_version, reference_set, inputs_json, targets_json, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
    .bind(
      set.id!,
      userId,
      set.effectiveFrom,
      set.engineVersion,
      set.referenceSet,
      JSON.stringify({ inputs: set.inputs, lossStartedOn: set.lossStartedOn ?? null }),
      JSON.stringify({ energy: set.energy, targets: set.targets, warnings: set.warnings, availableGoals: set.availableGoals }),
      createdAt,
    );
}

/** Whether two sets say the same thing, ignoring when and under which id they were made. */
export function sameSet(a: TargetSet, b: TargetSet): boolean {
  const body = (s: TargetSet) => JSON.stringify({ i: s.inputs, e: s.energy, t: s.targets, w: s.warnings, a: s.availableGoals, r: s.referenceSet, v: s.engineVersion, l: s.lossStartedOn ?? null });
  return body(a) === body(b);
}

// ---- the stored profile as engine input ----------------------------------------------------------------

/** The engine's input from a stored personalised row and the latest weight. Null for a reference-only row. */
export function profileInputOf(row: HealthProfileRow, weightKg: number | null): HealthProfileInput | null {
  if (row.target_mode !== 'personalised' || weightKg === null) return null;
  return {
    birthYear: row.birth_year!,
    birthMonth: row.birth_month,
    sexForCalc: row.sex_for_calc!,
    heightCm: row.height_cm!,
    weightKg,
    activity: row.activity_level!,
    goal: row.goal!,
    pace: row.pace,
    pattern: row.diet_pattern,
    referenceSet: row.reference_set,
  };
}

/** The safety flags that are stored (only the medicine one): the rest are never kept. */
export const storedSafety = (row: HealthProfileRow | null): SafetyAnswers => ({ ...NO_SAFETY_FLAGS, dietInteractingMedicine: row?.diet_interacting_medicine === 1 });

export const latestWeight = (weights: readonly WeightRow[]): WeightRow | null => weights[weights.length - 1] ?? null;

export function overridesOf(goals: readonly GoalRow[]): Override[] {
  const out: Override[] = [];
  for (const g of goals) if (isNutrientKey(g.nutrient)) out.push({ nutrient: g.nutrient, value: g.target, origin: g.origin === 'care_team' ? 'care_team' : 'custom' });
  return out;
}

/** The mode of the stored profile: no row means generic. */
export const modeOf = (row: HealthProfileRow | null): Mode => (row ? (row.target_mode === 'personalised' ? 'personalised' : 'reference_only') : 'generic');

// ---- the set in force, brought up to date --------------------------------------------------------------

/**
 * The newest set for a personalised profile, appended first if the person has crossed an age band since it
 * was made (30 to 31, 50 to 51, 70 to 71), so the micronutrient references move with the birthday
 * (plan 6.2). Returns the sets with any new one, and the statement that stores it.
 */
export function withCurrentAgeBand(
  state: HealthState,
  today: string,
): { sets: TargetSet[]; added: TargetSet | null } {
  const row = state.profile;
  const latest = state.sets[state.sets.length - 1];
  const weight = latestWeight(state.weights);
  if (!row || row.target_mode !== 'personalised' || !latest?.inputs || !weight) return { sets: state.sets, added: null };
  const band = referenceBandOf(row.reference_set as 'nasem' | 'icmr_nin', ageOn(today, row.birth_year!, row.birth_month));
  if (band === latest.inputs.ageBand) return { sets: state.sets, added: null };
  const input = profileInputOf(row, weight.weight_kg)!;
  const fresh = computeTargets(input, today, { safety: storedSafety(row), id: crypto.randomUUID() });
  if (fresh.mode !== 'personalised') return { sets: state.sets, added: null };
  fresh.lossStartedOn = fresh.inputs?.goalApplied === 'lose' ? (latest.lossStartedOn ?? today) : null;
  return { sets: [...state.sets, fresh], added: fresh };
}

// ---- goals: what a day's numbers are -------------------------------------------------------------------

export interface GoalsView {
  /** The target per nutrient (the recommended value, a typed number, or null), as `GET /days` and `/me/goals` serve it. */
  goals: Record<NutrientKey, number | null>;
  /** Where each goal came from. */
  origins: Partial<Record<NutrientKey, Target['origin'] | 'reference'>>;
  mode: Mode;
  /** Low-pressure mode: every number is withheld. */
  hidden: boolean;
  /** The recommended targets by nutrient, when the profile is unlocked and personalised. */
  recommended: Partial<Record<NutrientKey, Target>>;
}

/**
 * The goals a request sees. Without the profile's secret, or with no health profile, they are the generic
 * reference plus whatever the person typed (the Phase 0 behaviour, which older app versions keep). With the
 * secret they come from the target set in force today: personal numbers are readable only by their owner
 * (plan 8.3.2 reads a report as health data, and a goal is the same numbers).
 */
export function goalsView(args: { state: HealthState | null; today: string; unlocked: boolean }): GoalsView {
  const { state, today, unlocked } = args;
  const typed = state ? overridesOf(state.goals) : [];
  const base = (): GoalsView => {
    const goals = Object.fromEntries(NUTRIENTS.map((n) => [n.key, genericReference(n.key)])) as Record<NutrientKey, number | null>;
    const origins: GoalsView['origins'] = {};
    for (const n of NUTRIENTS) if (goals[n.key] !== null) origins[n.key] = 'reference';
    return { goals, origins, mode: 'generic', hidden: false, recommended: {} };
  };

  // Typed numbers are applied over any base the same way.
  const withTyped = (view: GoalsView): GoalsView => {
    for (const o of typed) {
      view.goals[o.nutrient] = o.value;
      view.origins[o.nutrient] = o.origin;
    }
    return view;
  };

  if (!unlocked || !state?.profile) return withTyped(base());
  const mode = modeOf(state.profile);
  const hidden = state.profile.numbers_hidden === 1;
  if (hidden) {
    const none = Object.fromEntries(NUTRIENTS.map((n) => [n.key, null])) as Record<NutrientKey, number | null>;
    return { goals: none, origins: {}, mode, hidden: true, recommended: {} };
  }
  if (mode === 'reference_only') {
    // No adult reference values for someone who told us a reason not to set targets: only numbers they typed.
    const none = Object.fromEntries(NUTRIENTS.map((n) => [n.key, null])) as Record<NutrientKey, number | null>;
    return withTyped({ goals: none, origins: {}, mode, hidden: false, recommended: {} });
  }
  const set = setInForce(state.sets, today);
  if (!set) return withTyped({ ...base(), mode });
  const recommended = Object.fromEntries(set.targets.map((t) => [t.nutrient, t])) as Partial<Record<NutrientKey, Target>>;
  const goals = Object.fromEntries(NUTRIENTS.map((n) => [n.key, recommended[n.key]?.value ?? null])) as Record<NutrientKey, number | null>;
  const origins: GoalsView['origins'] = {};
  for (const n of NUTRIENTS) if (goals[n.key] !== null) origins[n.key] = 'recommended';
  return withTyped({ goals, origins, mode, hidden: false, recommended });
}

/** The effective targets (recommended with typed numbers applied) of a set, for `GET /me/targets`. */
export function effectiveTargets(set: TargetSet | null, goals: readonly GoalRow[], mode: Mode): Target[] {
  const overrides = overridesOf(goals);
  if (mode === 'reference_only') return applyOverrides([], overrides);
  return applyOverrides((set ?? genericTargetSet('')).targets, overrides);
}

/**
 * The effective targets, each typed one with the recommended value it replaced and, when it is away from the usual
 * values, a warning (plan 6.4): the targets screen shows the ideal next to the person's own number.
 */
export function targetsWithAdvice(set: TargetSet | null, goals: readonly GoalRow[], mode: Mode): (Target & { recommended?: number; warning?: string })[] {
  const personal = mode === 'personalised' ? set : null;
  const recommended = new Map(mode === 'reference_only' ? [] : (set ?? genericTargetSet('')).targets.map((t) => [t.nutrient, t.value]));
  return effectiveTargets(set, goals, mode).map((t) => {
    if (t.origin !== 'custom') return t;
    const rec = recommended.get(t.nutrient);
    const warning = checkOverride({ nutrient: t.nutrient, value: t.value, set: personal, sex: personal?.inputs?.sexForCalc ?? null }).note;
    return { ...t, ...(rec !== undefined ? { recommended: rec } : {}), ...(warning ? { warning } : {}) };
  });
}

export { referenceOnlySet, genericTargetSet };
