/**
 * Weekly-summary status logic: which nutrients want a higher/lower/in-range value, how a value
 * scores against its goal, and the number and label formatting the report screens share.
 * Pure functions; colours belong to the components (see `statusTone`).
 */
import type { Direction, Status, WeeklyNutrient } from '@/types/nutrition';
import { addDays } from './dates';

/** How a status is drawn: the name of a Badge / ProgressBar tone. */
export const statusTone: Record<Status, 'success' | 'warning' | 'danger'> = {
  good: 'success',
  warn: 'warning',
  bad: 'danger',
};

export function statusOf(n: Pick<WeeklyNutrient, 'amount' | 'goal' | 'dir'>): Status {
  if (!n.goal || n.goal <= 0) return 'warn';
  const pct = n.amount / n.goal;
  if (n.dir === 'higher') {
    if (pct >= 1.0) return 'good';
    if (pct >= 0.8) return 'warn';
    return 'bad';
  }
  if (n.dir === 'lower') {
    if (pct <= 1.0) return 'good';
    if (pct <= 1.15) return 'warn';
    return 'bad';
  }
  if (pct >= 0.9 && pct <= 1.1) return 'good';
  if (pct >= 0.75 && pct <= 1.25) return 'warn';
  return 'bad';
}

export function statusLabel(n: Pick<WeeklyNutrient, 'amount' | 'goal' | 'dir'>): string {
  const s = statusOf(n);
  if (n.dir === 'higher') {
    if (s === 'good') return 'Goal met';
    if (s === 'warn') return 'Almost there';
    return 'Below goal';
  }
  if (n.dir === 'lower') {
    if (s === 'good') return 'Within limit';
    if (s === 'warn') return 'Watch out';
    return 'Over limit';
  }
  if (s === 'good') return 'In range';
  if (s === 'warn') return 'Close';
  return 'Out of range';
}

export function helperText(dir: Direction): string {
  if (dir === 'higher') return 'Aim higher · weekly';
  if (dir === 'lower') return 'Keep low · weekly';
  return 'Stay in range · weekly';
}

export function scoreOf(nutrients: WeeklyNutrient[]): number {
  if (!nutrients.length) return 0;
  const total = nutrients.reduce((acc, n) => {
    const s = statusOf(n);
    return acc + (s === 'good' ? 100 : s === 'warn' ? 70 : 30);
  }, 0);
  return Math.round(total / nutrients.length);
}

export function verdictOf(score: number): string {
  if (score >= 90) return 'Excellent week';
  if (score >= 80) return 'Strong week';
  if (score >= 70) return 'Good, room to grow';
  if (score >= 60) return 'Mixed week';
  return 'Needs attention';
}

export function gradeOf(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'A-';
  if (score >= 75) return 'B+';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  return 'D';
}

export function fmtNum(n: number, unit?: string): string {
  let formatted: string;
  if (n >= 100) formatted = Math.round(n).toString();
  else if (n >= 10) formatted = n.toFixed(1);
  else formatted = n.toFixed(2);
  if (formatted.includes('.')) formatted = formatted.replace(/\.?0+$/, '');
  return unit ? `${formatted} ${unit}` : formatted;
}

const LOWER_DIR_NAMES = new Set(
  ['sodium', 'sugar', 'added sugar', 'added sugars', 'saturated fat', 'trans fat', 'cholesterol', 'caffeine', 'alcohol'].map(s =>
    s.toLowerCase(),
  ),
);

const WINDOW_DIR_NAMES = new Set(['calories', 'energy', 'total fat', 'fat'].map(s => s.toLowerCase()));

export function inferDirection(name: string, category?: string): Direction {
  const lc = name.toLowerCase();
  if (LOWER_DIR_NAMES.has(lc)) return 'lower';
  if (WINDOW_DIR_NAMES.has(lc)) return 'window';
  if (category && category.toLowerCase() === 'macro') {
    if (lc.includes('fat') && !lc.includes('saturated') && !lc.includes('trans')) {
      return 'window';
    }
    return 'higher';
  }
  return 'higher';
}

/** "Jun 29 – Jul 5" label for the Monday→Sunday week starting at `start` (YYYY-MM-DD). */
export function weekRangeLabel(start: string): string {
  const fmt = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  return `${fmt(start)} – ${fmt(addDays(start, 6))}`;
}

export function weekDayLabels(): string[] {
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
}
