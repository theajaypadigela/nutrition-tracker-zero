/**
 * What state a day is in, and how sure the week is (WEEKLY_BREAKDOWN_PLAN.md 7.2, 7.6): the data-quality checker's part of the
 * weekly pipeline. A day nobody logged is not a day of zero intake; today is not judged until it is over; a half-logged day is not
 * averaged in as if it were whole. Thresholds are design choices [A] and live in `REPORT_CONFIG`.
 */
import { dayKcal } from '../intake/totals';
import type { IntakeDay } from '../intake/types';
import { REPORT_CONFIG, type ReportConfig } from '../reference/scoring';
import type { Confidence, DayState, PartialReason } from './types';

/**
 * The little a day's classification needs to know about the person: whether they have an energy target of their own (and what it
 * is), the sex-specific floor under which an intake is "very low", and the total above which a day is probably a typo.
 */
export interface DayLimits {
  personal: boolean;
  energy: number | null;
  floor: number;
  veryHigh: number;
}

export interface DayClass {
  state: DayState;
  /** Set when `state` is `partial`. */
  reason?: PartialReason;
  kcal: number;
  pendingItems: number;
  /** A non-empty day under the safety floor, whatever its state (plan 7.2, 8.6). */
  lowIntake: boolean;
  /** Probably a typo: a prompt, not a rejection. */
  veryHigh: boolean;
}

/**
 * Classifies one day (plan 7.2). Order matters: the future is not judged; "leave it out" wins over
 * everything else; today is in progress unless the person marked it complete; a complete mark counts
 * the day even with few or no items (a fasting day); then a partial mark, then nothing logged, then too
 * many pending items, then too little energy against the person's own target, then valid.
 */
export function classifyDay(day: IntakeDay, today: string, t: DayLimits, cfg: ReportConfig = REPORT_CONFIG): DayClass {
  const kcal = dayKcal(day);
  const pendingItems = day.items.filter((i) => i.pending).length;
  const base = { kcal, pendingItems, lowIntake: false, veryHigh: false };
  const counted = (state: DayState, reason?: PartialReason): DayClass => {
    const nonEmpty = state === 'valid' || state === 'confirmed' || state === 'partial';
    return {
      ...base,
      state,
      ...(reason ? { reason } : {}),
      lowIntake: nonEmpty && kcal < t.floor,
      veryHigh: (nonEmpty || state === 'in_progress') && kcal > t.veryHigh,
    };
  };

  if (day.date > today) return { ...base, state: 'future' };
  if (day.mark === 'skip') return { ...base, state: 'skipped' };
  if (day.date === today && day.mark !== 'complete') return counted('in_progress');
  if (day.mark === 'complete') return counted('confirmed');
  if (day.mark === 'partial') return counted('partial', 'marked');
  if (day.items.length === 0) return { ...base, state: 'empty' };
  const pendingShare = pendingItems / day.items.length;
  const floor = t.personal ? Math.max(cfg.minValidKcalFloor, cfg.minValidShareOfTarget * (t.energy ?? 0)) : cfg.minValidKcalFloor;
  if (pendingShare > cfg.maxPendingItemShare) return counted('partial', 'pending');
  if (kcal < floor) return counted('partial', 'low');
  return counted('valid');
}

export const isAssessed = (state: DayState): boolean => state === 'valid' || state === 'confirmed';

/** Indices of the days that count in the week's averages. */
export function assessedIndices(states: readonly DayState[]): number[] {
  const out: number[] = [];
  states.forEach((s, i) => {
    if (isAssessed(s)) out.push(i);
  });
  return out;
}

/**
 * How sure the week is (plan 7.6): not enough under three assessed days; good with six or seven, at most
 * 10% of items pending and a weekend day; fair with four or five (or six or seven short of that); rough
 * with three.
 */
export function confidenceOf(args: {
  assessedDays: number;
  pendingItems: number;
  totalItems: number;
  weekendAssessedDays: number;
  cfg?: ReportConfig;
}): Confidence {
  const cfg = args.cfg ?? REPORT_CONFIG;
  const { assessedDays, pendingItems, totalItems, weekendAssessedDays } = args;
  if (assessedDays < cfg.minDaysForSummary) return 'insufficient';
  const pendingShare = totalItems > 0 ? pendingItems / totalItems : 0;
  if (assessedDays >= 6 && pendingShare <= 0.1 && weekendAssessedDays >= 1) return 'good';
  return assessedDays >= 4 ? 'fair' : 'rough';
}
