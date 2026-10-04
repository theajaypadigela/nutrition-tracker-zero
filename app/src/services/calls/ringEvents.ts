/**
 * What happens when a ring trigger fires (DELIVERED) or a ring notification is pressed.
 * Used by the headless background handler (index.js) and the foreground listener.
 */
import notifee, { EventType, type Event } from '@notifee/react-native';
import { Platform } from 'react-native';
import { reminderLog } from './logger';
import { presentIncomingCall } from './native';
import { readRingPayload, type RingPayload } from './payload';
import { recordRing } from './scheduleStore';
import { classifyFire, DEFAULT_STALENESS_THRESHOLD_MS } from './staleness';
import { showMissedFollowUp } from './triggers';

export type RingNavigation = (payload: RingPayload, autoStart: boolean) => void;

/** Handles a ring trigger's DELIVERED event: ring natively, or a quiet follow-up if the fire is stale. */
export async function onRingDelivered(payload: RingPayload, now = Date.now()): Promise<void> {
  if (payload.notificationId) {
    // The heartbeat only carries the alarm; the native surface owns the visible call (Android).
    if (Platform.OS === 'android') await notifee.cancelDisplayedNotification(payload.notificationId).catch(() => {});
  }
  // A reboot can replay yesterday's 8 pm alarm at 3 am: never ring for that.
  if (payload.intendedFireAt && classifyFire(payload.intendedFireAt, now, DEFAULT_STALENESS_THRESHOLD_MS) === 'stale') {
    reminderLog.warn('call.stale_suppressed', 'Suppressed a stale ring', { lateMs: now - payload.intendedFireAt });
    await recordRing({ result: 'stale', callKind: payload.callKind, at: payload.intendedFireAt });
    await showMissedFollowUp();
    return;
  }
  const presented = presentIncomingCall(payload);
  if (presented && Platform.OS === 'ios' && payload.notificationId) {
    await notifee.cancelDisplayedNotification(payload.notificationId).catch(() => {});
  }
}

/**
 * Shared Notifee event handling. Returns the payload when the user pressed a ring or missed
 * notification (iOS ring tap or the JS missed follow-up), so the caller can open the call screen.
 */
export async function handleNotifeeEvent({ type, detail }: Event): Promise<RingPayload | null> {
  const data = detail.notification?.data as Record<string, unknown> | undefined;
  if (type === EventType.DELIVERED) {
    const payload = readRingPayload(data);
    if (payload) await onRingDelivered(payload);
    return null;
  }
  if (type === EventType.PRESS) {
    const payload = readRingPayload(data);
    if (payload) return payload;
    if (data?.missed === 'true') return { callKind: 'manual' };
  }
  return null;
}
