import { addDays, addMonths, monthBounds, monthOf, weekStart } from './dates';

export type ReportPeriod = 'day' | 'week' | 'month' | 'year' | 'custom';

export function reportBounds(
  period: ReportPeriod,
  anchor: string,
  custom: { from: string; to: string },
) {
  switch (period) {
    case 'day':
      return { from: anchor, to: anchor };
    case 'week': {
      const from = weekStart(anchor);
      return { from, to: addDays(from, 6) };
    }
    case 'month':
      return monthBounds(monthOf(anchor));
    case 'year':
      return {
        from: `${anchor.slice(0, 4)}-01-01`,
        to: `${anchor.slice(0, 4)}-12-31`,
      };
    case 'custom':
      return custom;
  }
}

export function shiftReport(
  period: ReportPeriod,
  anchor: string,
  step: number,
): string {
  switch (period) {
    case 'day':
      return addDays(anchor, step);
    case 'week':
      return addDays(anchor, step * 7);
    case 'month':
      return `${addMonths(monthOf(anchor), step)}-01`;
    case 'year':
      return `${Number(anchor.slice(0, 4)) + step}-01-01`;
    case 'custom':
      return anchor;
  }
}

export function rangeLabel(from: string, to: string): string {
  const fmt = (date: string) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  return from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
}
