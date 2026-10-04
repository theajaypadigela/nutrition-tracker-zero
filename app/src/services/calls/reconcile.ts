/**
 * The single recovery path (ported from the old reconciliation pass, trimmed to one daily call).
 * Runs at cold start, on every resume and after each schedule save. It recomputes the desired
 * daily trigger from the cached schedule in the user's timezone, re-arms it (which also corrects
 * DST drift and recovers alarms lost to a force-stop), prunes stray triggers we own, and drains
 * the native declined/missed markers.
 */
import notifee from '@notifee/react-native';
import { canScheduleExact, readPermissionSnapshot } from './permissions';
import { ensureChannels } from './channels';
import { reminderLog } from './logger';
import { drainRingResults } from './native';
import { loadCachedSchedule, recordRing, type CallSchedule } from './scheduleStore';
import { nextDailyOccurrence, parseCallTime } from './time';
import { armRing, cancelRing, DAILY_TRIGGER_ID, isAppOwnedTriggerId, TEST_TRIGGER_ID } from './triggers';

export interface ReconcileReport {
  armedAt: number | null;
  pruned: string[];
  exact: boolean;
}

/** Desired fire time for the daily ring, or null when calls are off / no time set. */
export function desiredDailyFire(schedule: CallSchedule | null, now: number): number | null {
  if (!schedule?.callEnabled) return null;
  const time = parseCallTime(schedule.callTime);
  return time ? nextDailyOccurrence(time, now, schedule.timezone) : null;
}

let chain: Promise<unknown> = Promise.resolve();

/** Serialized: passes never overlap, and none are dropped. */
export function reconcile(reason: string, opts: { signedIn: boolean; now?: number } = { signedIn: true }) {
  const next = chain.then(
    () => doReconcile(reason, opts),
    () => doReconcile(reason, opts),
  );
  chain = next.catch(() => undefined);
  return next;
}

async function doReconcile(reason: string, opts: { signedIn: boolean; now?: number }): Promise<ReconcileReport> {
  const now = opts.now ?? Date.now();
  await ensureChannels();

  for (const r of await drainRingResults()) {
    await recordRing({ result: r.result, callKind: r.payload.callKind, at: r.payload.intendedFireAt ?? now });
  }

  const pending = await notifee.getTriggerNotificationIds().catch(() => [] as string[]);
  const fireAt = opts.signedIn ? desiredDailyFire(await loadCachedSchedule(), now) : null;
  const exact = canScheduleExact(await readPermissionSnapshot());

  if (fireAt !== null) {
    await armRing({ id: DAILY_TRIGGER_ID, callKind: 'scheduled', fireAt, repeatDaily: true, exact });
  }
  const pruned: string[] = [];
  for (const id of pending) {
    const keep = (id === DAILY_TRIGGER_ID && fireAt !== null) || (id === TEST_TRIGGER_ID && opts.signedIn);
    if (isAppOwnedTriggerId(id) && !keep) {
      await cancelRing(id);
      pruned.push(id);
    }
  }
  reminderLog.info('reconcile.done', `Reconciliation (${reason})`, { armedAt: fireAt, pruned: pruned.length, exact });
  return { armedAt: fireAt, pruned, exact };
}

/** Rings the phone through the real alarm → native ring → answer path in ~5 seconds. */
export async function armTestCall(delayMs = 5_000): Promise<number> {
  const exact = canScheduleExact(await readPermissionSnapshot());
  const fireAt = Date.now() + delayMs;
  await armRing({ id: TEST_TRIGGER_ID, callKind: 'test', fireAt, repeatDaily: false, exact });
  return fireAt;
}
