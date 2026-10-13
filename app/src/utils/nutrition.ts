/**
 * Number and week-label formatting the report screens share (WEEKLY_BREAKDOWN_PLAN.md 9.4). The scoring that used to live
 * here moved to the Worker: every verdict now comes from `GET /reports/weekly`, and the words for them are in `utils/report.ts`.
 */
import { addDays } from './dates';

/** 4 · 0.4 · 16 · 180 · 2,520: one decimal at most below 100, none from 100 up, thousands separated. */
export function fmtNum(n: number, unit?: string): string {
  let formatted: string;
  if (n >= 100) formatted = Math.round(n).toLocaleString('en-US');
  else if (n >= 10) formatted = n.toFixed(1);
  else formatted = n.toFixed(2);
  if (formatted.includes('.')) formatted = formatted.replace(/\.?0+$/, '');
  return unit ? `${formatted} ${unit}` : formatted;
}

/** "Jun 29 – Jul 5" for the Monday-to-Sunday week starting at `start` (YYYY-MM-DD). */
export function weekRangeLabel(start: string): string {
  const fmt = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${fmt(start)} – ${fmt(addDays(start, 6))}`;
}

export const weekDayLabels = (): string[] => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
