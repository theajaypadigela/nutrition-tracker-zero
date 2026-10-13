/**
 * The words of an insight, from its id and numbers (WEEKLY_BREAKDOWN_PLAN.md 5.6, 9.3). The Worker sends no text: it
 * sends `{ id, params }`, and this is the one place they become a sentence, from the strings table, so the copy can
 * change without a deploy and is covered by the string lint. In low-pressure mode the Worker sends no numbers at all and
 * the sentence comes from the numberless table.
 */
import type { Insight, NutrientInfo } from '@/api/types';
import { fill, signedNumber } from '@/i18n/fill';
import { strings } from '@/i18n/strings';
import { MIN_DAYS_FOR_SUMMARY, nutrientInfo } from './report';

const t = strings.report.insights;

/** "Thursday" for 2026-10-08. */
export function weekdayName(date: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}

export interface InsightEnv {
  nutrients: NutrientInfo[];
  numbersHidden: boolean;
}

const num = (v: number | string | undefined): number => (typeof v === 'number' ? v : Number(v ?? 0));
/** An "about" energy figure, no more precise than a log can be: the nearest 10 kcal (plan 7.6). */
export const aboutKcal = (v: number | string | undefined): number => Math.round(num(v) / 10) * 10;

/** The sentence for one insight, or null when this app does not know the id (a newer Worker): the card is left out. */
export function insightText(insight: Insight, env: InsightEnv): string | null {
  if (env.numbersHidden) return (strings.lowPressure.insights as Record<string, string>)[insight.id] ?? null;
  const p = insight.params;
  const who = insight.nutrient ?? String(p.nutrient ?? '');
  const info = who ? nutrientInfo(env.nutrients, who) : { label: '', unit: '' };
  const base = { ...p, min: MIN_DAYS_FOR_SUMMARY, nutrient: info.label, unit: info.unit } as Record<
    string,
    string | number
  >;
  const table = t as Record<string, string>;

  switch (insight.id) {
    case 'incomplete_days': {
      const day = weekdayName(String(p.date));
      const more = num(p.n) - 1;
      return more > 0
        ? fill(t.incomplete_days_more, { ...base, day, more })
        : fill(t.incomplete_days, { ...base, day, kcal: aboutKcal(p.kcal) });
    }
    case 'energy_above':
    case 'energy_below':
      return fill(table[insight.id]!, { ...base, mean: aboutKcal(p.mean) });
    case 'weight_vs_plan':
      // Signed, with a true minus: "changed −1.2 kg; your plan expects about −0.9 kg".
      return fill(t.weight_vs_plan, { ...base, d: signedNumber(num(p.d)), e: signedNumber(num(p.e)) });
    case 'implausible_day':
      return fill(t.implausible_day, { ...base, day: weekdayName(String(p.date)), kcal: aboutKcal(p.kcal) });
    case 'check_amounts': {
      const more = num(p.n) - 1;
      // The amount's own unit ("katori"), not a nutrient's: this insight is about a logged item.
      const args = { ...base, unit: String(p.unit ?? ''), day: weekdayName(String(p.date)), more };
      return fill(more > 0 ? t.check_amounts_more : t.check_amounts, args);
    }
    case 'pending_items':
      return num(p.n) === 1 ? t.pending_items_one : fill(t.pending_items, base);
    case 'partial_data':
      return fill(t.partial_data, { ...base, nutrient: info.label.toLowerCase() });
    case 'sodium_over': {
      const head = fill(num(p.atLeast) === 1 ? t.sodium_over_least : t.sodium_over, base);
      const sources = String(p.sources ?? '');
      return sources ? `${head} ${fill(t.sodium_sources, { sources })}` : head;
    }
    case 'mineral_gap': {
      const note = table[`mineral_note_${who}`];
      return `${fill(t.mineral_gap, base)}${note ? ` ${note}` : ''}`;
    }
    case 'vitamin_window': {
      const note = table[`vitamin_note_${who}`];
      return `${fill(t.vitamin_window, base)}${note ? ` ${note}` : ''}`;
    }
    default: {
      const template = table[insight.id];
      return template ? fill(template, base) : null;
    }
  }
}

export type InsightAction =
  | { label: string; target: 'pending' }
  | { label: string; target: 'day'; date: string }
  | { label: string; target: 'nutrient'; key: string; window: 'week' | 'four_weeks' };

/** The one thing a person can do about an insight, if there is one: its label, and what it opens. */
export function insightAction(insight: Insight): InsightAction | null {
  const label = (strings.report.insightActions as Record<string, string>)[insight.id];
  if (!label) return null;
  if (insight.id === 'pending_items') return { label, target: 'pending' };
  if ((insight.id === 'incomplete_days' || insight.id === 'implausible_day' || insight.id === 'check_amounts') && typeof insight.params.date === 'string') {
    return { label, target: 'day', date: insight.params.date };
  }
  if (!insight.nutrient) return null;
  return {
    label,
    target: 'nutrient',
    key: insight.nutrient,
    window: insight.id === 'vitamin_window' ? 'four_weeks' : 'week',
  };
}
