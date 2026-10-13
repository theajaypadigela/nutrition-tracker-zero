/**
 * `buildWeeklyReport`: the whole weekly view model, from the week's items and the target set in force on
 * each day (WEEKLY_BREAKDOWN_PLAN.md sections 5 and 7, with the shape of 9.3). Pure: no database, no
 * clock, no AI. The same inputs give the same report, and Appendix F of the plan is the independent second
 * implementation the numbers are tested against.
 *
 * Reading order: resolve what each day is judged against; classify each day; assess every nutrient over
 * the days that count (with the lower-bound rule); score the mix (or say why not); turn the week into at
 * most three insights; add the rolling four-week view for the high-variation vitamins and eight weeks of
 * history. Low-pressure mode strips every energy, weight, percentage and score number before anything leaves.
 */
import { NUTRIENTS, ENERGY_SHARE, type NutrientKey } from '../nutrients';
import { REPORT_CONFIG, type ReportConfig } from '../reference/scoring';
import { addDays } from '../time';
import { CALORIE_FLOOR } from '../targets/goal';
import { genericTargetSet } from '../targets/engine';
import { applyOverrides, type Override } from '../targets/overrides';
import { calibrate, checkAgainstPlan, isRapidLoss, summariseWeight, weightTrend, type WeightEntry } from './weight';
import { ENGINE_VERSION, type Mode, type Target, type TargetSet } from '../targets/types';
import { topSources, totalsOf } from '../intake/totals';
import type { IntakeDay } from '../intake/types';
import { coverageOf } from '../quality/coverage';
import { assessedIndices, classifyDay, confidenceOf, isAssessed, type DayClass } from '../quality/days';
import type { Confidence } from '../quality/types';
import { weekQuality } from '../quality/week';
import { assessNutrient, dayMeets } from './assess';
import { buildInsights, leadingNutrients } from './insights';
import { computeScore, jackknife, shownScore, type ScoreInput } from './score';
import { compareWithPrevious, mean, noiseBandOf, trendAgainst, weekStarts } from './trend';
import type { DayReport, DayTargets, HistoryWeek, NutrientReport, ScoreReport, WeeklyReport, WeightReport, Withheld } from './types';

export interface WeeklyInput {
  /** The Monday of the week to report. */
  weekStart: string;
  /** Today in the person's time zone. */
  today: string;
  /** Weeks of history, the reported week last; at most 8. */
  weeks?: number;
  /** `generic` when there is no health profile. */
  mode: Mode;
  numbersHidden?: boolean;
  /** A medicine that interacts with food: vitamin K, potassium and sodium show amounts only. */
  medicine?: boolean;
  /** The personalised target sets, ascending by `effectiveFrom`. Empty in generic and reference-only modes. */
  targetSets?: readonly TargetSet[];
  /** Typed numbers (custom or from a care team). They change the bars and nothing else. */
  overrides?: readonly Override[];
  /** Logged days, in any order. A date that is missing is an empty day. */
  days: readonly IntakeDay[];
  config?: Partial<ReportConfig>;
  /** The goal that applied and the pattern, to choose the nutrients that lead (plan 5.3). */
  goal?: 'general_health' | 'maintain' | 'lose' | 'gain' | 'build_muscle' | null;
  pattern?: string | null;
  referenceSet?: string | null;
  /** BMI from the latest weight, for the underweight notice. */
  bmi?: number | null;
  /** The weigh-ins, in any order (Phase 5). Only a personalised profile has any. */
  weights?: readonly WeightEntry[];
}

export const MAX_HISTORY_WEEKS = 8;
export const DISCLAIMER_ID = 'estimates-v1';

const LEADING_MINIMUMS = ['protein', 'fiber', 'potassium', 'calcium', 'iron', 'magnesium', 'zinc'] as const;
const SCORE_STANDARD_KEYS: readonly NutrientKey[] = ['protein', 'fiber', 'potassium', 'calcium', 'iron', 'magnesium', 'zinc'];

// ---- what each day is judged against -------------------------------------------------------------------

/** The target set in force on `date`: the latest with `effectiveFrom <= date`, or the earliest for days before the first (plan 6.2). */
export function setInForce(sets: readonly TargetSet[], date: string): TargetSet | null {
  if (sets.length === 0) return null;
  let found: TargetSet | null = null;
  for (const s of sets) if (s.effectiveFrom <= date) found = s;
  return found ?? sets[0]!;
}

interface Resolver {
  (date: string): DayTargets;
  /** The set in force, for the report header. */
  setFor: (date: string) => TargetSet | null;
}

function makeResolver(input: WeeklyInput & { mode: Mode }, cfg: ReportConfig): Resolver {
  const overrides = input.overrides ?? [];
  const cache = new Map<string, DayTargets>();
  const generic = genericTargetSet(input.today);

  const resolveFor = (set: TargetSet | null): DayTargets => {
    const key = set ? `${set.id ?? ''}@${set.effectiveFrom}` : input.mode;
    const hit = cache.get(key);
    if (hit) return hit;
    const personalised = input.mode === 'personalised' && set !== null && set.mode === 'personalised';
    const recommended: Target[] = personalised ? set!.targets : input.mode === 'reference_only' ? [] : generic.targets;
    const targets = applyOverrides(recommended, overrides);
    const byNutrient: Partial<Record<NutrientKey, Target>> = Object.fromEntries(targets.map((t) => [t.nutrient, t]));
    const energy = byNutrient.calories ?? null;
    // A personal energy target: the person's own set, or a number they typed or got from a care team.
    const personal = personalised || (energy !== null && energy.origin !== 'recommended');
    const sex = personalised ? (set!.inputs?.sexForCalc ?? null) : null;
    const standards: Partial<Record<NutrientKey, number>> = {};
    if (personalised) for (const t of set!.targets) if ((SCORE_STANDARD_KEYS as readonly string[]).includes(t.nutrient)) standards[t.nutrient] = t.value;
    const resolved: DayTargets = {
      mode: input.mode,
      personal,
      energy: personal && energy ? energy.value : null,
      energyForScore: personalised ? (set!.energy?.target ?? null) : null,
      floor: sex ? CALORIE_FLOOR[sex] : 1200,
      veryHigh: sex ? cfg.veryHighKcal[sex] : cfg.veryHighKcal.average,
      sex,
      targets: byNutrient,
      standards,
      ...(personalised ? { referenceSet: set!.referenceSet } : {}),
    };
    cache.set(key, resolved);
    return resolved;
  };

  const setFor = (date: string) => (input.mode === 'personalised' ? setInForce(input.targetSets ?? [], date) : null);
  const fn = ((date: string) => resolveFor(setFor(date))) as Resolver;
  fn.setFor = setFor;
  return fn;
}

/**
 * What one day is judged against outside a weekly report (the Today screen's "does this day count?"): the same resolution the report
 * uses, so the two never disagree about a day.
 */
export function dayTargetsOn(
  args: { mode: Mode; targetSets?: readonly TargetSet[]; overrides?: readonly Override[]; today: string },
  date: string,
  cfg: ReportConfig = REPORT_CONFIG,
): DayTargets {
  // As in the report: a personalised profile with no target set yet is judged against the general reference.
  const mode: Mode = args.mode === 'personalised' && (args.targetSets?.length ?? 0) === 0 ? 'generic' : args.mode;
  return makeResolver({ ...args, mode, weekStart: date, days: [] }, cfg)(date);
}

// ---- a window of days, analysed ------------------------------------------------------------------------

interface Core {
  start: string;
  days: IntakeDay[];
  tg: DayTargets[];
  cls: DayClass[];
  /** Indices of the days that count. */
  idx: number[];
}

function analyse(start: string, count: number, byDate: ReadonlyMap<string, IntakeDay>, today: string, resolve: Resolver, cfg: ReportConfig): Core {
  const days: IntakeDay[] = [];
  const tg: DayTargets[] = [];
  const cls: DayClass[] = [];
  for (let i = 0; i < count; i++) {
    const date = addDays(start, i);
    const day = byDate.get(date) ?? { date, items: [], mark: null };
    const t = resolve(date);
    days.push(day);
    tg.push(t);
    cls.push(classifyDay(day, today, t, cfg));
  }
  return { start, days, tg, cls, idx: assessedIndices(cls.map((c) => c.state)) };
}

/** The week's effective target for a nutrient: the mean over the days that count, so a mid-week change judges each day by its own set. */
function weekTarget(core: Core, nutrient: NutrientKey): Target | null {
  const pool = core.idx.length > 0 ? core.idx : core.cls.map((_, i) => i).filter((i) => core.cls[i]!.state !== 'future');
  const picked = pool.map((i) => core.tg[i]!.targets[nutrient]).filter((t): t is Target => !!t);
  if (picked.length === 0) return null;
  const last = picked[picked.length - 1]!;
  const value = mean(picked.map((t) => t.value));
  const lows = picked.flatMap((t) => (t.low !== undefined ? [t.low] : []));
  const highs = picked.flatMap((t) => (t.high !== undefined ? [t.high] : []));
  return { ...last, value, ...(lows.length ? { low: mean(lows) } : {}), ...(highs.length ? { high: mean(highs) } : {}) };
}

/** The recommended standards and energy the score measures against, averaged over the days that count. */
function scoreInputOf(core: Core): ScoreInput | null {
  const withEnergy = core.idx.filter((i) => core.tg[i]!.energyForScore !== null);
  if (withEnergy.length === 0) return null;
  const standards: Partial<Record<NutrientKey, number>> = {};
  for (const k of SCORE_STANDARD_KEYS) {
    const vs = withEnergy.map((i) => core.tg[i]!.standards[k]).filter((v): v is number => v !== undefined);
    if (vs.length) standards[k] = mean(vs);
  }
  // The words follow the set in force on the last day that counts, so a week that crossed from one set to the other reads as it ends.
  const referenceSet = core.tg[withEnergy[withEnergy.length - 1]!]!.referenceSet;
  return { days: core.days, indices: core.idx, standards, energyTarget: mean(withEnergy.map((i) => core.tg[i]!.energyForScore!)), ...(referenceSet ? { referenceSet } : {}) };
}

// ---- one nutrient over a window ------------------------------------------------------------------------

function nutrientReport(
  core: Core,
  valueCore: Core,
  nutrient: NutrientKey,
  cfg: ReportConfig,
  opts: { suppress: boolean; mode: Mode; window: 'week' | 'four_weeks'; earlier?: readonly number[] },
): NutrientReport {
  const target = weekTarget(core, nutrient);
  const assessedDays = core.idx.length;
  const days = core.idx.map((i) => core.days[i]!);
  const t = totalsOf(days, nutrient);
  const isLimit = target?.kind === 'limit';
  const coverage = coverageOf(t, isLimit);
  const mean_ = assessedDays > 0 ? t.known / assessedDays : 0;
  const per = ENERGY_SHARE[nutrient];
  // Fat and carbohydrate are judged as a share of the energy actually logged, which is robust to under-logging.
  const energyAll = totalsOf(days, 'calories').known;
  const share = per && energyAll > 0 ? (per.kcalPerGram * t.known) / energyAll : undefined;
  // Verdicts need a target, a reason to judge (medicine flag), an energy target the person owns (the general
  // reference for calories is not an estimate of their needs), and, for a vitamin, the four-week window.
  const owned = target?.kind !== 'energy' || isPersonalEnergy(target, opts.mode);
  const judgedHere = !(opts.window === 'week' && target?.window === 'four_weeks');
  const verdicts = !!target && target.verdicts && owned && judgedHere;
  const a = assessNutrient({ target, mean: mean_, share, coverage, assessedDays, verdicts, nutrient }, cfg);

  // Days meeting: by the same rule as the week, day by day, against that day's own target.
  let daysMeeting = 0;
  for (const i of core.idx) {
    const dayTarget = core.tg[i]!.targets[nutrient];
    if (!dayTarget || !dayTarget.verdicts) continue;
    const dt = totalsOf([core.days[i]!], nutrient);
    const dayShare = per && dt.energyAll > 0 ? (per.kcalPerGram * dt.known) / dt.energyAll : undefined;
    const complete = coverageOf(dt, dayTarget.kind === 'limit') >= 1 - 1e-9;
    if (dayMeets({ target: dayTarget, value: dt.known, complete, share: dayShare, nutrient }, cfg)) daysMeeting++;
  }

  const dayValues = valueCore.days.map((day, i) => {
    if (!isAssessed(valueCore.cls[i]!.state)) return null;
    const dt = totalsOf([day], nutrient);
    return dt.itemsKnown === 0 ? null : dt.known;
  });

  return {
    nutrient,
    target,
    meanPerAssessedDay: a.mean,
    isLowerBound: a.isLowerBound,
    dataCoverage: coverage,
    daysMeeting,
    assessedDays,
    dayValues,
    // Too few days: the figures are "logged so far" and carry no verdict.
    assessment: opts.suppress && a.assessment !== 'amount_only' ? 'unknown' : a.assessment,
    ...(share !== undefined ? { shareOfEnergy: share } : {}),
    topSources: topSources(days, nutrient),
    // Against earlier weeks only on a week that can be summarised and whose data is complete enough to compare (plan 5.7).
    trend: !opts.suppress && opts.earlier && a.mean !== null && coverage >= cfg.coverageComplete ? trendAgainst(a.mean, opts.earlier) : null,
  };
}

const LIMIT_KEYS: ReadonlySet<NutrientKey> = new Set(NUTRIENTS.filter((n) => n.kind === 'limit').map((n) => n.key as NutrientKey));

// ---- the report ----------------------------------------------------------------------------------------

const round1 = (x: number) => Math.round(x * 10) / 10;

const LEAD_MINERALS: readonly NutrientKey[] = ['calcium', 'iron', 'magnesium', 'zinc'];

/**
 * The rows that lead the Report tab: the ones the goal and eating pattern name, then the two judged minerals
 * furthest below their reference, where there is enough data to say so (plan 5.3).
 */
export function withMineralGaps(lead: readonly NutrientKey[], nutrients: readonly NutrientReport[], cfg: ReportConfig = REPORT_CONFIG): NutrientKey[] {
  const gaps = LEAD_MINERALS.filter((k) => !lead.includes(k))
    .map((k) => nutrients.find((n) => n.nutrient === k))
    .filter(
      (n): n is NutrientReport =>
        !!n &&
        !!n.target &&
        n.target.verdicts &&
        n.target.kind === 'minimum' &&
        n.meanPerAssessedDay !== null &&
        n.dataCoverage >= cfg.coverageComplete &&
        (n.assessment === 'meets' || n.assessment === 'close' || n.assessment === 'below'),
    )
    .sort((a, b) => a.meanPerAssessedDay! / a.target!.value - b.meanPerAssessedDay! / b.target!.value)
    .slice(0, 2)
    .map((n) => n.nutrient);
  return [...lead, ...gaps];
}

/** An energy target the person owns: their own set, or a number they typed or got from a care team. The general reference is not. */
const isPersonalEnergy = (t: Target, mode: Mode) => mode === 'personalised' || t.origin !== 'recommended';

export function buildWeeklyReport(raw: WeeklyInput): WeeklyReport {
  // A personalised profile with no target set yet is judged against the general reference, and says so.
  const mode: Mode = raw.mode === 'personalised' && (raw.targetSets?.length ?? 0) === 0 ? 'generic' : raw.mode;
  const input = { ...raw, mode };
  const cfg: ReportConfig = { ...REPORT_CONFIG, ...input.config };
  const weeks = Math.max(1, Math.min(MAX_HISTORY_WEEKS, input.weeks ?? MAX_HISTORY_WEEKS));
  const byDate = new Map(input.days.map((d) => [d.date, d]));
  const resolve = makeResolver(input, cfg);
  const numbersHidden = !!input.numbersHidden;
  const medicine = !!input.medicine;
  const weekEnd = addDays(input.weekStart, 6);

  const core = analyse(input.weekStart, 7, byDate, input.today, resolve, cfg);
  const states = core.cls.map((c) => c.state);
  const assessedDays = core.idx.length;
  const pendingItems = core.cls.reduce((s, c) => s + c.pendingItems, 0);
  const totalItems = core.days.reduce((s, d) => s + d.items.length, 0);
  const weekendAssessed = [5, 6].filter((i) => isAssessed(states[i]!)).length;
  const confidence: Confidence = confidenceOf({ assessedDays, pendingItems, totalItems, weekendAssessedDays: weekendAssessed, cfg });
  const insufficient = confidence === 'insufficient';

  // ---- energy: the mean of the days that count, against the person's own target when there is one
  const energyTarget = weekTarget(core, 'calories');
  const kcals = core.idx.map((i) => core.cls[i]!.kcal);
  const energy =
    !numbersHidden && energyTarget && isPersonalEnergy(energyTarget, mode)
      ? {
          meanKcal: kcals.length ? Math.round(mean(kcals)) : null,
          target: Math.round(energyTarget.value),
          low: Math.round(energyTarget.low ?? energyTarget.value),
          high: Math.round(energyTarget.high ?? energyTarget.value),
          daysInBand: core.idx.filter((i) => {
            const dayTarget = core.tg[i]!.targets.calories;
            return !!dayTarget && Math.abs(core.cls[i]!.kcal / dayTarget.value - 1) <= cfg.energyBand + 1e-9;
          }).length,
          assessedDays,
        }
      : null;

  // ---- the four weeks before this one: a week counts for a trend when it had enough days and the nutrient's values (plan 5.7)
  const priorCores = [1, 2, 3, 4].map((k) => analyse(addDays(input.weekStart, -7 * k), 7, byDate, input.today, resolve, cfg));
  const earlierMeans = (key: NutrientKey): number[] => {
    const out: number[] = [];
    for (const c of priorCores) {
      if (c.idx.length < cfg.trendMinAssessedDays) continue;
      const t = totalsOf(c.idx.map((i) => c.days[i]!), key);
      if (coverageOf(t, LIMIT_KEYS.has(key)) >= cfg.coverageComplete) out.push(t.known / c.idx.length);
    }
    return out;
  };

  // ---- nutrients over the week, and the high-variation vitamins over four weeks
  const weekNutrients = NUTRIENTS.map((n) => n.key as NutrientKey);
  const nutrients = weekNutrients.map((k) =>
    nutrientReport(core, core, k, cfg, { suppress: insufficient, mode, window: 'week', ...(NUTRIENTS.find((n) => n.key === k)!.window === 'week' ? { earlier: earlierMeans(k) } : {}) }),
  );
  const windowStart = addDays(weekEnd, -(cfg.fourWeekDays - 1));
  const windowCore = analyse(windowStart, cfg.fourWeekDays, byDate, input.today, resolve, cfg);
  const fourWeek = NUTRIENTS.filter((n) => n.window === 'four_weeks').map((n) =>
    nutrientReport(windowCore, core, n.key as NutrientKey, cfg, { suppress: windowCore.idx.length < cfg.fourWeekMinAssessedDays, mode, window: 'four_weeks' }),
  );

  // ---- the score, or why not
  const scoreInput = scoreInputOf(core);
  let score: ScoreReport = { value: null, shown: null, isMinimum: false, points: 0, outOf: 0, range: null, components: [] };
  const withhold = (reason: Withheld, keepComponents = false, base?: ReturnType<typeof computeScore>) => {
    score = {
      value: null,
      shown: null,
      // Withheld for thin data: the components that could not be scored are why, and they are named.
      isMinimum: keepComponents && !!base ? base.components.some((c) => !c.scorable) : false,
      points: keepComponents && base ? base.points : 0,
      outOf: keepComponents && base ? base.outOf : 0,
      range: null,
      components: keepComponents && base ? base.components : [],
      withheld: reason,
    };
  };
  const lowIntakeDays = core.cls.filter((c) => c.lowIntake).length;
  // Switched off, the score is not computed at all: the averages, the insights and what is missing say what the week was.
  if (!cfg.score) withhold('off');
  else if (numbersHidden) withhold('numbers_hidden');
  else if (input.mode === 'generic') withhold('generic');
  else if (input.mode === 'reference_only') withhold('reference_only');
  else if (insufficient) {
    const pend = core.cls.filter((c) => c.state === 'partial' && c.reason === 'pending').length;
    const low = core.cls.filter((c) => c.state === 'partial' && (c.reason === 'low' || c.reason === 'marked')).length;
    withhold(pend >= 2 ? 'unknown_foods' : low >= 2 ? 'incomplete_days' : 'few_days');
  } else if (lowIntakeDays >= cfg.lowIntakeDaysToWithhold) withhold('low_intake');
  else if (!scoreInput) withhold('thin_data');
  else {
    const result = computeScore(scoreInput, cfg);
    if (result.value === null) withhold('thin_data', true, result);
    else {
      const isMinimum = result.components.some((c) => !c.scorable);
      score = {
        value: result.value,
        shown: shownScore(result.value, isMinimum),
        isMinimum,
        points: round1(result.points),
        outOf: result.outOf,
        // The leave-one-day-out range matters when a day or two drives the score: with 4 or 5 days.
        range: assessedDays === 4 || assessedDays === 5 ? jackknife(scoreInput, cfg) : null,
        components: result.components,
      };
    }
  }

  // ---- history: eight weeks, a week with too few days is a gap and not a zero
  const history: HistoryWeek[] = weekStarts(input.weekStart, weeks).map((ws) => {
    const c = ws === input.weekStart ? core : analyse(ws, 7, byDate, input.today, resolve, cfg);
    const n = c.idx.length;
    if (n < cfg.minDaysForSummary) return { weekStart: ws, assessedDays: n, energyPct: null, proteinPct: null, score: null };
    const e = weekTarget(c, 'calories');
    const energyPct = e && e.value > 0 && isPersonalEnergy(e, mode) ? Math.round((mean(c.idx.map((i) => c.cls[i]!.kcal)) / e.value) * 100) : null;
    const protein = weekTarget(c, 'protein');
    const pt = totalsOf(c.idx.map((i) => c.days[i]!), 'protein');
    const proteinPct = protein && protein.value > 0 && coverageOf(pt, false) >= cfg.coverageComplete ? Math.round((pt.known / n / protein.value) * 100) : null;
    let scoreValue: number | null = null;
    const si = cfg.score && input.mode === 'personalised' ? scoreInputOf(c) : null;
    if (si && c.cls.filter((x) => x.lowIntake).length < cfg.lowIntakeDaysToWithhold) scoreValue = computeScore(si, cfg).value;
    return {
      weekStart: ws,
      assessedDays: n,
      energyPct: numbersHidden ? null : energyPct,
      proteinPct: numbersHidden ? null : proteinPct,
      score: numbersHidden ? null : scoreValue,
    };
  });
  const previousScores = history.slice(0, -1).filter((h) => h.assessedDays >= cfg.trendMinAssessedDays && h.score !== null).slice(-4).map((h) => h.score!);
  const scoreTrend = score.value !== null ? compareWithPrevious(score.value, previousScores, { minBand: cfg.trendMinNoiseBand }) : null;

  // ---- weight (Phase 5): the trend of the weigh-ins up to the end of this week, and what it says about the plan
  const asOf = weekEnd <= input.today ? weekEnd : input.today;
  const weighIns = mode === 'personalised' ? weightTrend((input.weights ?? []).filter((w) => w.date <= asOf)) : [];
  const setNow = resolve.setFor(asOf);
  const planGoal = setNow?.inputs?.goalApplied;
  const planDelta = setNow?.energy?.delta ?? 0;
  const planCheck = (planGoal === 'lose' || planGoal === 'gain' || planGoal === 'build_muscle') && planDelta !== 0 ? checkAgainstPlan(weighIns, { deltaKcal: planDelta }) : null;
  const weightSummary = summariseWeight(weighIns);
  const weightReport: WeightReport | null = !numbersHidden && weightSummary ? { ...weightSummary, points: weighIns.filter((p) => p.date >= addDays(asOf, -84)), plan: planCheck } : null;
  const kcals28 = windowCore.idx.map((i) => windowCore.cls[i]!.kcal);
  const calibration =
    cfg.calibration && mode === 'personalised' && !numbersHidden && setNow?.energy
      ? calibrate({
          points: weighIns,
          meanIntakeKcal: kcals28.length ? mean(kcals28) : null,
          assessedDays: windowCore.idx.length,
          lowIntakeDays: windowCore.cls.filter((c) => c.lowIntake).length,
          currentKcal: setNow.energy.maintenance,
        })
      : null;

  // ---- insights
  const lead = leadingNutrients({ goal: input.goal ?? null, pattern: input.pattern ?? null, referenceSet: input.referenceSet ?? null });
  const previous: Partial<Record<NutrientKey, { mean: number; band: number }>> = {};
  if (input.mode === 'personalised') {
    for (const key of lead) {
      const band = noiseBandOf(earlierMeans(key));
      if (band) previous[key] = band;
    }
  }
  const wk = core.idx.filter((i) => i >= 5).map((i) => core.cls[i]!.kcal);
  const wd = core.idx.filter((i) => i < 5).map((i) => core.cls[i]!.kcal);
  const dayReports: DayReport[] = core.cls.map((c, i) => ({
    date: core.days[i]!.date,
    state: c.state,
    kcal: numbersHidden || c.state === 'future' || c.state === 'empty' || c.state === 'skipped' ? null : Math.round(c.kcal),
    lowIntake: c.lowIntake,
    veryHigh: c.veryHigh,
    pendingItems: c.pendingItems,
  }));
  const floor = core.tg[core.tg.length - 1]!.floor;
  // ---- what is missing or uncertain: the data-quality checker's summary of the week
  const quality = weekQuality({
    counted: core.idx.map((i) => core.days[i]!),
    open: core.days.filter((_, i) => core.cls[i]!.state !== 'future' && core.cls[i]!.state !== 'skipped'),
  });
  const insights = buildInsights({
    mode: input.mode,
    numbersHidden,
    medicine,
    assessedDays,
    days: dayReports,
    lowIntakeDays,
    floor,
    pendingItems,
    nutrients: insufficient ? nutrients.map((n) => ({ ...n, assessment: n.assessment === 'amount_only' ? n.assessment : ('unknown' as const) })) : nutrients,
    fourWeek,
    leading: lead,
    energy: energy ? { meanKcal: energy.meanKcal, target: energy.target, daysInBand: energy.daysInBand, assessedDays } : null,
    underweight: input.mode === 'personalised' && input.bmi !== null && input.bmi !== undefined && input.bmi < 18.5,
    weight: weighIns.length > 0 ? { rapidLoss: isRapidLoss(weighIns), plan: planCheck } : null,
    weekend: wk.length >= 1 && wd.length >= 1 ? { weekendMean: mean(wk), weekdayMean: mean(wd), weekendDays: wk.length, weekdayDays: wd.length } : null,
    previous,
    amounts: quality.amountsToCheck,
    cfg,
  });

  const set = resolve.setFor(weekEnd <= input.today ? weekEnd : input.today);
  const report: WeeklyReport = {
    engineVersion: ENGINE_VERSION,
    week: { start: input.weekStart, end: weekEnd, today: input.today, isCurrent: input.today >= input.weekStart && input.today <= weekEnd },
    mode: input.mode,
    targetSet: { id: set?.id ?? null, effectiveFrom: set?.effectiveFrom ?? null },
    display: { numbersHidden },
    coverage: { days: dayReports, assessedDays, weekendAssessedDays: weekendAssessed, pendingItems, confidence },
    energy,
    lead: withMineralGaps(lead, nutrients, cfg),
    nutrients,
    fourWeek,
    quality,
    score,
    scoreTrend,
    insights,
    weight: weightReport,
    calibration,
    history,
    disclaimerId: DISCLAIMER_ID,
  };
  return numbersHidden ? stripNumbers(report) : report;
}

/**
 * Low-pressure mode never receives a number the person asked to hide (plan 8.2, 11.4): no energy, no
 * calories or macros, no percentages and no score. What remains is which days were logged and the
 * numberless insights.
 */
function stripNumbers(r: WeeklyReport): WeeklyReport {
  return {
    ...r,
    energy: null,
    nutrients: [],
    fourWeek: [],
    quality: null,
    scoreTrend: null,
    weight: null,
    calibration: null,
    history: r.history.map((h) => ({ ...h, energyPct: null, proteinPct: null, score: null })),
  };
}
