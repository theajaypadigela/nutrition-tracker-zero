/**
 * Insights: a small, fixed, deterministic rule set that turns a week into up to three plain sentences
 * (WEEKLY_BREAKDOWN_PLAN.md 5.6). No AI. Every rule has a trigger, a priority and an evidence-backed
 * meaning; the Worker returns an `id` and parameters, and the app renders the words from one strings table
 * (so copy can change without a deploy and can be linted and translated). Higher priority wins, ties go
 * to the larger gap, and there is at most one insight per nutrient. Generic and reference-only modes run
 * only the safety rules (priority 1) and the data rules (priority 2).
 */
import type { NutrientKey } from '../nutrients';
import type { AmountToCheck } from '../quality/week';
import { REPORT_CONFIG, type ReportConfig } from '../reference/scoring';
import type { Goal, Mode } from '../targets/types';
import type { DayReport, Insight, NutrientReport } from './types';

/** The nutrients that lead the Report tab, by goal (plan 5.3). The order is a design choice [A]. */
export function leadingNutrients(args: { goal: Goal | null; pattern: string | null; referenceSet: string | null }): NutrientKey[] {
  const { goal, pattern, referenceSet } = args;
  const lead: NutrientKey[] = [];
  const push = (...keys: NutrientKey[]) => {
    for (const k of keys) if (!lead.includes(k)) lead.push(k);
  };
  if (goal === 'lose') push('calories', 'protein', 'fiber', 'sodium');
  else if (goal === 'gain' || goal === 'build_muscle') push('calories', 'protein', 'fiber');
  else push('protein', 'fiber', 'potassium', 'sodium');
  if (pattern === 'eggetarian' || pattern === 'vegetarian' || pattern === 'vegan') push('iron', 'zinc', 'calcium');
  if (referenceSet === 'icmr_nin') push('iron', 'calcium', 'sodium');
  return lead;
}

export interface InsightContext {
  mode: Mode;
  numbersHidden: boolean;
  /** With a medicine that interacts with food, no insight mentions vitamin K, potassium or sodium (G12). */
  medicine: boolean;
  assessedDays: number;
  days: readonly DayReport[];
  lowIntakeDays: number;
  floor: number;
  pendingItems: number;
  /** Week-judged nutrients with their targets and assessments. */
  nutrients: readonly NutrientReport[];
  /** The high-variation vitamins over the rolling four weeks. */
  fourWeek: readonly NutrientReport[];
  leading: readonly NutrientKey[];
  /** A personal energy target exists (personalised mode or a care-team number). */
  energy: { meanKcal: number | null; target: number; daysInBand: number; assessedDays: number } | null;
  underweight: boolean;
  /** Weigh-ins, when there are any (Phase 5): the trend fell faster than is usual, and the trend against the plan. */
  weight?: { rapidLoss: boolean; plan: { weeks: number; observedKg: number; expectedKg: { low: number; high: number } } | null } | null;
  weekend: { weekendMean: number; weekdayMean: number; weekendDays: number; weekdayDays: number } | null;
  /** For `improving`: the previous four weeks' mean per nutrient and the noise band, when there is enough history. */
  previous: Partial<Record<NutrientKey, { mean: number; band: number }>>;
  /** Amounts worth a second look, the most unusual first (the data-quality checker's, plan 7.7). */
  amounts?: readonly AmountToCheck[];
  cfg?: ReportConfig;
}

interface Candidate extends Insight {
  /** Larger means more to say: breaks ties inside a priority. */
  gap: number;
}

const MINERALS: NutrientKey[] = ['calcium', 'iron', 'magnesium', 'zinc'];
const round = (x: number) => Math.round(x);
const fmt = (x: number) => (x >= 100 ? String(round(x)) : String(Math.round(x * 10) / 10));

/** Ids allowed in low-pressure mode: variety, fibre, sodium and what is missing from the log (plan 8.2). */
const LOW_PRESSURE_IDS: ReadonlySet<string> = new Set([
  'low_intake',
  'underweight',
  'rapid_loss',
  'few_days',
  'incomplete_days',
  'pending_items',
  'partial_data',
  'check_amounts',
  'fibre_low',
  'sodium_over',
]);

/** Ranks an unusual amount with the implausible day it usually causes (whose gap is the day's kcal), and above counts of days. */
const AMOUNT_GAP_FLOOR = 1000;

export function buildInsights(ctx: InsightContext): Insight[] {
  const cfg = ctx.cfg ?? REPORT_CONFIG;
  const out: Candidate[] = [];
  const get = (k: NutrientKey) => ctx.nutrients.find((n) => n.nutrient === k);
  const verdictsOn = (n: NutrientReport | undefined) => !!n && !!n.target && n.target.verdicts;
  const add = (c: Candidate) => out.push(c);

  // ---- 1 safety: needs no profile, runs in every mode
  if (ctx.lowIntakeDays >= cfg.lowIntakeDaysToWithhold) {
    add({ id: 'low_intake', priority: 1, params: { n: ctx.lowIntakeDays, floor: ctx.floor }, gap: ctx.lowIntakeDays });
  }
  if (ctx.underweight) add({ id: 'underweight', priority: 1, params: {}, gap: 1 });
  // The weight trend falling faster than 1% of body weight a week for two weeks (plan 5.6): a safety signal, shown without numbers
  // in low-pressure mode like the other safety messages.
  if (ctx.weight?.rapidLoss) add({ id: 'rapid_loss', priority: 1, params: {}, gap: 1 });

  // ---- 2 data: what is missing from the log
  if (ctx.assessedDays < cfg.minDaysForSummary) {
    add({ id: 'few_days', priority: 2, params: { n: ctx.assessedDays }, gap: cfg.minDaysForSummary - ctx.assessedDays });
  }
  const partial = ctx.days.filter((d) => d.state === 'partial');
  if (partial.length > 0) {
    const worst = partial.reduce((a, b) => ((a.kcal ?? 0) <= (b.kcal ?? 0) ? a : b));
    add({ id: 'incomplete_days', priority: 2, params: { date: worst.date, kcal: round(worst.kcal ?? 0), n: partial.length }, gap: partial.length });
  }
  if (ctx.pendingItems > 0) add({ id: 'pending_items', priority: 2, params: { n: ctx.pendingItems }, gap: ctx.pendingItems });
  const gapped = ctx.leading.map((k) => get(k)).find((n) => n && n.target && n.target.kind !== 'energy' && n.dataCoverage < cfg.coverageComplete && n.assessedDays > 0 && n.assessment !== 'amount_only');
  if (gapped) add({ id: 'partial_data', priority: 2, nutrient: gapped.nutrient, params: { nutrient: gapped.nutrient }, gap: 1 - gapped.dataCoverage });
  // An amount that looks wrong (often a mishearing on a call) is named; a day it made implausible is then the same message, said less precisely.
  const amounts = ctx.amounts ?? [];
  const odd = amounts[0];
  if (odd) {
    add({
      id: 'check_amounts',
      priority: 2,
      params: { n: amounts.length, name: odd.name, quantity: odd.quantity, unit: odd.unit, date: odd.date },
      gap: Math.max(odd.kcal ?? 0, AMOUNT_GAP_FLOOR),
    });
  }
  const typo = ctx.days.filter((d) => d.veryHigh && !amounts.some((a) => a.date === d.date)).sort((a, b) => (b.kcal ?? 0) - (a.kcal ?? 0))[0];
  if (typo) add({ id: 'implausible_day', priority: 2, params: { date: typo.date, kcal: round(typo.kcal ?? 0) }, gap: typo.kcal ?? 0 });

  // generic and reference-only modes stop here: they have no personal target to say anything about
  if (ctx.mode !== 'personalised') return finish(out, ctx, cfg, true);

  // ---- 3 goal: energy and protein
  const e = ctx.energy;
  if (e && e.meanKcal !== null && ctx.assessedDays >= cfg.minDaysForSummary) {
    const ratio = e.meanKcal / e.target;
    if (Math.abs(ratio - 1) > cfg.energyBand + 1e-9) {
      add({
        id: ratio > 1 ? 'energy_above' : 'energy_below',
        priority: 3,
        nutrient: 'calories',
        params: { mean: round(e.meanKcal), target: e.target, pct: round(Math.abs(ratio - 1) * 100) },
        gap: Math.abs(ratio - 1),
      });
    } else {
      add({ id: 'energy_near', priority: 3, nutrient: 'calories', params: { k: e.daysInBand, n: e.assessedDays }, gap: 0 });
    }
  }
  const plan = ctx.weight?.plan;
  if (plan && !ctx.numbersHidden) {
    const mid = (plan.expectedKg.low + plan.expectedKg.high) / 2;
    add({
      id: 'weight_vs_plan',
      priority: 3,
      params: { d: plan.observedKg, w: plan.weeks, e: Math.round(mid * 10) / 10 },
      gap: Math.abs(plan.observedKg - mid),
    });
  }
  const protein = get('protein');
  if (protein && verdictsOn(protein) && protein.meanPerAssessedDay !== null && protein.dataCoverage >= cfg.coverageComplete && ctx.assessedDays >= cfg.minDaysForSummary) {
    const ratio = protein.meanPerAssessedDay / protein.target!.value;
    if (ratio < cfg.meetsRatio) {
      add({ id: 'protein_gap', priority: 3, nutrient: 'protein', params: { mean: round(protein.meanPerAssessedDay), target: protein.target!.value }, gap: cfg.meetsRatio - ratio });
    }
  }

  // ---- 4 nutrients
  const sodium = get('sodium');
  if (sodium && verdictsOn(sodium) && sodium.target && (sodium.assessment === 'over' || sodium.assessment === 'well_over') && sodium.meanPerAssessedDay !== null) {
    add({
      id: 'sodium_over',
      priority: 4,
      nutrient: 'sodium',
      params: {
        mean: round(sodium.meanPerAssessedDay),
        limit: sodium.target.value,
        atLeast: sodium.isLowerBound ? 1 : 0,
        sources: sodium.topSources.map((s) => s.name).join(', '),
      },
      gap: sodium.meanPerAssessedDay / sodium.target.value - 1,
    });
  }
  const fibre = get('fiber');
  if (fibre && verdictsOn(fibre) && fibre.meanPerAssessedDay !== null && fibre.assessment !== 'meets' && fibre.assessment !== 'unknown' && fibre.assessment !== 'amount_only') {
    add({ id: 'fibre_low', priority: 4, nutrient: 'fiber', params: { mean: round(fibre.meanPerAssessedDay), target: fibre.target!.value }, gap: 1 - fibre.meanPerAssessedDay / fibre.target!.value });
  }
  const potassium = get('potassium');
  if (!ctx.medicine && potassium && verdictsOn(potassium) && (potassium.assessment === 'close' || potassium.assessment === 'below') && sodium && (sodium.assessment === 'over' || sodium.assessment === 'well_over') && potassium.meanPerAssessedDay !== null) {
    add({
      id: 'potassium_low_sodium_high',
      priority: 4,
      nutrient: 'potassium',
      params: { mean: round(potassium.meanPerAssessedDay), target: potassium.target!.value },
      gap: 1 - potassium.meanPerAssessedDay / potassium.target!.value,
    });
  }
  const gaps = MINERALS.map((k) => get(k))
    .filter((n): n is NutrientReport => !!n && verdictsOn(n) && n.assessment === 'below' && n.dataCoverage >= cfg.coverageComplete && n.meanPerAssessedDay !== null)
    .sort((a, b) => a.meanPerAssessedDay! / a.target!.value - b.meanPerAssessedDay! / b.target!.value)
    .slice(0, 2);
  for (const m of gaps) {
    add({
      id: 'mineral_gap',
      priority: 4,
      nutrient: m.nutrient,
      params: { nutrient: m.nutrient, mean: fmt(m.meanPerAssessedDay!), reference: m.target!.value },
      gap: 1 - m.meanPerAssessedDay! / m.target!.value,
    });
  }
  for (const v of ctx.fourWeek) {
    if (!v.target || !v.target.verdicts || v.meanPerAssessedDay === null) continue;
    if (v.dataCoverage < cfg.coverageComplete || v.assessedDays < cfg.fourWeekMinAssessedDays) continue;
    if (v.meanPerAssessedDay / v.target.value >= cfg.closeRatio) continue;
    add({
      id: 'vitamin_window',
      priority: 4,
      nutrient: v.nutrient,
      params: { nutrient: v.nutrient, mean: fmt(v.meanPerAssessedDay), reference: v.target.value },
      gap: 1 - v.meanPerAssessedDay / v.target.value,
    });
  }
  const w = ctx.weekend;
  if (w && w.weekendDays >= cfg.weekendMinWeekendDays && w.weekdayDays >= cfg.weekendMinWeekdayDays && w.weekdayMean > 0) {
    const diff = w.weekendMean / w.weekdayMean - 1;
    if (Math.abs(diff) > cfg.weekendDifference) {
      add({ id: 'weekend_pattern', priority: 4, params: { pct: round(Math.abs(diff) * 100), direction: diff > 0 ? 'more' : 'less' }, gap: Math.abs(diff) });
    }
  }

  // ---- 5 positive
  for (const k of ctx.leading) {
    const n = get(k);
    if (!n || !verdictsOn(n) || n.target!.kind !== 'minimum' || n.assessedDays < cfg.minDaysForSummary) continue;
    if (n.assessment === 'meets' && n.daysMeeting === n.assessedDays) add({ id: 'target_met', priority: 5, nutrient: k, params: { nutrient: k }, gap: 0 });
  }
  for (const k of ctx.leading) {
    const n = get(k);
    const prev = ctx.previous[k];
    if (!n || !prev || !verdictsOn(n) || n.target!.kind !== 'minimum' || n.meanPerAssessedDay === null || n.dataCoverage < cfg.coverageComplete) continue;
    if (n.meanPerAssessedDay - prev.mean > prev.band) {
      add({ id: 'improving', priority: 5, nutrient: k, params: { nutrient: k, from: fmt(prev.mean), to: fmt(n.meanPerAssessedDay) }, gap: (n.meanPerAssessedDay - prev.mean) / prev.mean });
    }
  }
  return finish(out, ctx, cfg, false);
}

/** Selects, orders and trims the candidates: priority first, then the larger gap, one per nutrient, at most `maxInsights`. */
function finish(candidates: Candidate[], ctx: InsightContext, cfg: ReportConfig, safetyAndDataOnly: boolean): Insight[] {
  let list = candidates;
  if (safetyAndDataOnly) list = list.filter((c) => c.priority <= 2);
  // Low-pressure mode: only what talks about variety, fibre, sodium and the log, chosen BEFORE the cut to three.
  if (ctx.numbersHidden) list = list.filter((c) => LOW_PRESSURE_IDS.has(c.id));
  // With a medicine that interacts with food, vitamin K, potassium and sodium are amounts only (G12).
  if (ctx.medicine) list = list.filter((c) => c.nutrient !== 'vitaminK' && c.nutrient !== 'potassium' && c.nutrient !== 'sodium');
  list = [...list].sort((a, b) => a.priority - b.priority || b.gap - a.gap || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  const picked: Candidate[] = [];
  for (const c of list) {
    if (c.nutrient) {
      if (seen.has(c.nutrient)) continue;
      seen.add(c.nutrient);
    }
    picked.push(c);
    if (picked.length >= cfg.maxInsights) break;
  }
  // Worded without numbers: no parameters at all.
  if (ctx.numbersHidden) return picked.map(({ id, priority, nutrient }) => ({ id, priority, ...(nutrient ? { nutrient } : {}), params: {} }));
  return picked.map(({ id, priority, nutrient, params }) => ({ id, priority, ...(nutrient ? { nutrient } : {}), params }));
}
