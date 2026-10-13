import type { GoalBounds } from '@/api/types';

/** A typed goal field as a number: null when it is empty, NaN when it is not a number. */
export function parseGoal(raw: string): number | null {
  const text = raw.trim().replace(',', '.');
  return text ? Number(text) : null;
}

/**
 * What to say about a typed goal away from the usual values, or null (WEEKLY_BREAKDOWN_PLAN.md 6.4). It is a warning
 * only: the number is the person's choice and is saved as typed. The bounds and their sentences come from the Worker.
 */
export function goalWarning(bounds: GoalBounds | undefined, value: number): string | null {
  if (!bounds || !Number.isFinite(value) || value <= 0) return null;
  if (bounds.low !== undefined && value < bounds.low) return bounds.below ?? 'That is under the usual range.';
  if (bounds.high !== undefined && value > bounds.high) return bounds.above ?? 'That is over the usual range.';
  return null;
}
