/**
 * Pure staleness classification. No RN/Notifee imports.
 *
 * When a device reboots or powers on past a one-shot trigger's time, Notifee re-arms
 * the elapsed alarm with a past timestamp, so it fires immediately at boot. A 3 a.m.
 * ringing "incoming call" for yesterday's 8 p.m. meal is wrong. Every call payload
 * embeds its intended fire time; at handling time we classify how late we are and
 * either ring (fresh) or show a quiet missed-reminder notification (stale).
 */

export type FireClassification = 'fresh' | 'stale';

/** Default: a call is "fresh" only within 5 minutes of its intended minute. */
export const DEFAULT_STALENESS_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Classifies a fire relative to its intended time.
 * - `intendedFireEpoch` in the future or within `thresholdMs` of `nowEpoch` => fresh.
 * - more than `thresholdMs` late => stale.
 */
export function classifyFire(
  intendedFireEpoch: number,
  nowEpoch: number,
  thresholdMs: number = DEFAULT_STALENESS_THRESHOLD_MS,
): FireClassification {
  const latenessMs = nowEpoch - intendedFireEpoch;
  return latenessMs > thresholdMs ? 'stale' : 'fresh';
}

export function isStale(
  intendedFireEpoch: number,
  nowEpoch: number,
  thresholdMs: number = DEFAULT_STALENESS_THRESHOLD_MS,
): boolean {
  return classifyFire(intendedFireEpoch, nowEpoch, thresholdMs) === 'stale';
}
