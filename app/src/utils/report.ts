/**
 * What the weekly report's numbers are called, in neutral words, and how a nutrient's row reads (WEEKLY_BREAKDOWN_PLAN.md
 * 5.4, 5.8, 7.8). The Worker decides every verdict; this file only chooses the words and the colours for them. Pure
 * functions: colours belong to the components.
 *
 * Wording rules (plan 5.8): "target", "reference", "limit", "average", "logged". There is no grade and no "bad", and red
 * is not used for any of these.
 */
import type { BadgeTone, ProgressTone } from '@/components/kit';
import { fill } from '@/i18n/fill';
import { strings } from '@/i18n/strings';
import type { Assessment, Confidence, DayState, Mode, NutrientInfo, NutrientReport, TargetInfo } from '@/api/types';
import { fullDayLabel } from './dates';
import { fmtNum, weekDayLabels, weekRangeLabel } from './nutrition';
import type { DayCellState } from '@/components/report/DayStrip';

const t = strings.report;

/** Fewer assessed days than this and a week gets amounts but no verdict (plan 7.6). Mirrors the Worker's report config. */
export const MIN_DAYS_FOR_SUMMARY = 3;
/** Below this share of data an "unknown" reads "Not enough data"; above it, "Some foods have no value" (plan 7.3). */
export const COVERAGE_PARTIAL = 0.5;

// ---- words for an assessment -------------------------------------------------------------------------------------

export interface AssessmentFacts {
  assessment: Assessment;
  target: Pick<TargetInfo, 'kind' | 'high'> | null;
  dataCoverage: number;
  mean: number | null;
}

/** Neutral words for how a nutrient reads. Never "good", "bad" or "off track" (plan 5.8). */
export function assessmentLabel(n: AssessmentFacts): string {
  const kind = n.target?.kind;
  const a = t.assessment;
  switch (n.assessment) {
    case 'meets':
      return kind === 'limit' ? a.withinLimit : kind === 'energy' ? a.nearTarget : a.onTarget;
    case 'close':
      return a.aLittleLow;
    case 'below':
      return kind === 'energy' ? a.belowYourTarget : a.belowTarget;
    case 'over':
      return kind === 'energy' ? a.aboveYourTarget : a.aboveLimit;
    case 'well_over':
      return a.wellAbove;
    case 'in_range':
      return a.inRange;
    case 'outside':
      return n.mean !== null && n.target?.high !== undefined && n.mean > n.target.high ? a.aboveRange : a.belowRange;
    case 'unknown':
      return n.dataCoverage < COVERAGE_PARTIAL ? a.notEnough : a.someMissing;
    default:
      return a.amountOnly;
  }
}

/** Success only for "on target"; amber for something worth a look; everything else is quiet. Never red (plan 5.8). */
export const assessmentTone: Record<Assessment, BadgeTone> = {
  meets: 'success',
  close: 'neutral',
  below: 'warning',
  over: 'warning',
  well_over: 'warning',
  in_range: 'success',
  outside: 'neutral',
  unknown: 'neutral',
  amount_only: 'neutral',
};

export function assessmentBarTone(a: Assessment): ProgressTone {
  switch (a) {
    case 'below':
    case 'over':
    case 'well_over':
      return 'warning';
    case 'unknown':
    case 'amount_only':
      return 'muted';
    default:
      return 'primary';
  }
}

/** Whether the week has enough days to say anything about (plan 7.6). */
export const isJudged = (confidence: Confidence) => confidence !== 'insufficient';

/** Nutrients that got a verdict, and how many of them reached their reference. */
export function tally(nutrients: Pick<NutrientReport, 'assessment'>[]): { judged: number; onTarget: number } {
  const judged = nutrients.filter(n => n.assessment !== 'unknown' && n.assessment !== 'amount_only');
  return {
    judged: judged.length,
    onTarget: judged.filter(n => n.assessment === 'meets' || n.assessment === 'in_range').length,
  };
}

// ---- the week ----------------------------------------------------------------------------------------------------

const CELL: Record<DayState, DayCellState> = {
  valid: 'logged',
  confirmed: 'logged',
  partial: 'partial',
  empty: 'empty',
  skipped: 'skipped',
  in_progress: 'progress',
  future: 'future',
};

export const dayCellState = (state: DayState): DayCellState => CELL[state];

/** "Wednesday, October 7, logged": what a mark under a day says to the screen reader. */
export const dayDescription = (date: string, state: DayState) => `${fullDayLabel(date)}, ${t.dayState[state]}`;

export { fmtNum, weekDayLabels, weekRangeLabel };

export const confidenceLabel = (c: Confidence) => t.confidence[c];

/** "This week", "Last week", "3 weeks ago". */
export function weekEyebrow(weekIdx: number): string {
  if (weekIdx === 0) return t.week.this;
  if (weekIdx === -1) return t.week.last;
  return fill(t.week.ago, { n: -weekIdx });
}

// ---- the words around one nutrient --------------------------------------------------------------------------------

/** What a nutrient's reference means, in a few words. */
export function kindHint(kind: TargetInfo['kind'] | 'amount' | null): string {
  return t.kindHint[kind ?? 'amount'];
}

/** The name and unit of a nutrient, from the catalogue the Worker serves. Falls back to a readable key. */
export function nutrientInfo(nutrients: NutrientInfo[], key: string): { label: string; unit: string } {
  const hit = nutrients.find(n => n.key === key);
  if (hit) return { label: hit.label, unit: hit.unit };
  return { label: key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()), unit: '' };
}

/** What to call the thing a bar is drawn against: "target", "limit", "reference", "average requirement" (plan 6.1, 4.10). */
export function targetWords(
  target: Pick<TargetInfo, 'kind' | 'origin' | 'refType'>,
  mode: Mode,
): 'target' | 'yourTarget' | 'careTeamTarget' | 'limit' | 'reference' | 'average' {
  if (target.origin === 'care_team') return 'careTeamTarget';
  if (target.origin === 'custom') return target.kind === 'limit' ? 'limit' : 'yourTarget';
  if (target.kind === 'limit') return 'limit';
  // On the India set, iron, zinc and vitamin B12 are read against the average requirement, which is lower than the allowance.
  if (target.refType === 'EAR') return 'average';
  return mode === 'personalised' ? 'target' : 'reference';
}

/** The target as a short phrase with its number: "target 60 g", "limit 2,300 mg", "care-team target 70 g". */
export function targetPhrase(target: TargetInfo, mode: Mode): string {
  const words = targetWords(target, mode);
  if (target.kind === 'range' && target.low !== undefined && target.high !== undefined) {
    return fill(t.line.range, { low: fmtNum(target.low, target.unit), high: fmtNum(target.high, target.unit) });
  }
  return fill(t.line[words], { value: fmtNum(target.value, target.unit) });
}

/** What a bar is drawn against, as it reads inside a sentence: "your target of 60 g", "the limit of 2,300 mg", "the average requirement of 15 mg". */
export function referencePhrase(target: TargetInfo, mode: Mode): string {
  const s = t.sentence;
  const value = fmtNum(target.value, target.unit);
  if (target.origin === 'care_team') return fill(s.refCareTeam, { value });
  if (target.origin === 'custom') return fill(target.kind === 'limit' ? s.refYourLimit : s.refTarget, { value });
  if (target.kind === 'limit') return fill(s.refLimit, { value });
  if (target.refType === 'EAR') return fill(s.refAverage, { value });
  return fill(mode === 'personalised' ? s.refTarget : s.refGeneric, { value });
}

/** One sentence about a nutrient over its window: what was logged against what, and how sure that is. */
export function nutrientSentence(args: {
  name: string;
  report: NutrientReport;
  mode: Mode;
  window: 'week' | 'four_weeks';
}): string {
  const { name, report: n, mode, window } = args;
  const s = t.sentence;
  const target = n.target;
  const lower = name.toLowerCase();
  const unit = target?.unit;
  const mean = n.meanPerAssessedDay !== null ? fmtNum(n.meanPerAssessedDay, unit) : '';
  const least = n.isLowerBound ? 'at least ' : '';
  const ref = target ? referencePhrase(target, mode) : '';
  const low = fmtNum(target?.low ?? 0, unit);
  const high = fmtNum(target?.high ?? 0, unit);

  if (n.assessedDays < MIN_DAYS_FOR_SUMMARY && n.assessment !== 'amount_only') {
    return fill(n.assessedDays === 1 ? s.fewDaysOne : s.fewDays, { n: n.assessedDays, min: MIN_DAYS_FOR_SUMMARY });
  }
  switch (n.assessment) {
    case 'meets':
      return fill(target?.kind === 'limit' ? s.meetsLimit : s.meetsMinimum, { name, least, mean, ref });
    case 'close':
      return fill(s.close, { name, mean, ref });
    case 'below':
      return fill(s.below, { name, mean, ref });
    case 'over':
      return fill(s.over, { name, least, mean, ref });
    case 'well_over':
      return fill(s.wellOver, { name, least, mean, ref });
    case 'in_range':
      return fill(s.inRange, { name, mean, low, high });
    case 'outside': {
      const above = n.meanPerAssessedDay !== null && target?.high !== undefined && n.meanPerAssessedDay > target.high;
      return fill(above ? s.aboveRange : s.belowRange, { name, least, mean, low, high });
    }
    case 'unknown':
      if (n.meanPerAssessedDay === null) return fill(s.noFigure, { lower });
      return n.dataCoverage < COVERAGE_PARTIAL ? fill(s.unknownLow, { lower }) : fill(s.unknownSome, { lower, mean });
    default:
      // A vitamin read in a single week: no verdict, because four weeks judge it (plan 4.6).
      if (window === 'four_weeks' || target?.window === 'four_weeks') return fill(s.fourWeeks, { name });
      if (!target) return n.meanPerAssessedDay === null ? fill(s.noFigure, { lower }) : fill(s.amount, { name });
      return target.kind === 'energy' ? s.energyReference : fill(s.amount, { name });
  }
}

/** A short count: "4 of 5 days". */
export const daysOf = (k: number, n: number) => fill(t.line.daysMet, { k, n });
