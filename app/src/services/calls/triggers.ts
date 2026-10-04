/**
 * Notifee triggers for the daily call and the test call.
 *
 * Android: the trigger fires a SILENT heartbeat notification whose DELIVERED event (run headless
 * even when the app is killed) asks the native surface to ring. With exact alarms granted the
 * daily trigger uses SET_ALARM_CLOCK (exact in Doze, alarm icon on the lockscreen); otherwise
 * SET_AND_ALLOW_WHILE_IDLE ("may be a few minutes late", shown in Reminder health).
 * iOS: a time-sensitive notification; tapping it opens the call screen.
 */
import notifee, {
  AlarmType,
  AndroidImportance,
  AndroidVisibility,
  RepeatFrequency,
  TriggerType,
  type Notification,
  type TimestampTrigger,
} from '@notifee/react-native';
import { Platform } from 'react-native';
import type { CallKind } from '@/api/types';
import { CALL_HEARTBEAT_CHANNEL_ID, MISSED_CHANNEL_ID } from './channels';
import { reminderLog } from './logger';
import { ASSISTANT_NAME } from './payload';

export const DAILY_TRIGGER_ID = 'call-daily';
export const TEST_TRIGGER_ID = 'call-test';

/** Every trigger id this app creates; reconciliation may prune only these. */
export function isAppOwnedTriggerId(id: string): boolean {
  return id.startsWith('call-');
}

export function buildRingNotification(id: string, callKind: CallKind, intendedFireAt: number): Notification {
  return {
    id,
    title: ASSISTANT_NAME,
    body: 'Incoming call · what did you eat today?',
    data: { callKind, intendedFireAt: String(intendedFireAt), notificationId: id },
    android: {
      channelId: CALL_HEARTBEAT_CHANNEL_ID,
      importance: AndroidImportance.LOW,
      visibility: AndroidVisibility.SECRET,
      autoCancel: true,
    },
    ios: {
      sound: 'default',
      interruptionLevel: 'timeSensitive',
      foregroundPresentationOptions: { banner: true, list: true, sound: true, badge: false },
    },
  };
}

export function buildTrigger(fireAt: number, repeatDaily: boolean, exact: boolean): TimestampTrigger {
  const trigger: TimestampTrigger = { type: TriggerType.TIMESTAMP, timestamp: fireAt };
  if (repeatDaily) trigger.repeatFrequency = RepeatFrequency.DAILY;
  if (Platform.OS === 'android') {
    trigger.alarmManager = { type: exact ? AlarmType.SET_ALARM_CLOCK : AlarmType.SET_AND_ALLOW_WHILE_IDLE };
  }
  return trigger;
}

export async function armRing(opts: {
  id: string;
  callKind: CallKind;
  fireAt: number;
  repeatDaily: boolean;
  exact: boolean;
}): Promise<void> {
  // Cancel first: a same-id overwrite does not reliably replace an armed SET_ALARM_CLOCK on every OEM.
  await notifee.cancelTriggerNotification(opts.id).catch(() => {});
  await notifee.createTriggerNotification(
    buildRingNotification(opts.id, opts.callKind, opts.fireAt),
    buildTrigger(opts.fireAt, opts.repeatDaily, opts.exact),
  );
  reminderLog.info('schedule.armed', `Armed ${opts.id}`, { fireAt: opts.fireAt, exact: opts.exact });
}

export async function cancelRing(id: string): Promise<void> {
  await notifee.cancelTriggerNotification(id).catch(() => {});
}

/** Quiet follow-up for a ring that fired too late to be a live call (e.g. replayed after a reboot). */
export async function showMissedFollowUp(): Promise<void> {
  await notifee
    .displayNotification({
      id: 'call-missed-followup',
      title: 'You missed your food check-in call',
      body: 'Tap to log now.',
      data: { missed: 'true' },
      android: {
        channelId: MISSED_CHANNEL_ID,
        importance: AndroidImportance.HIGH,
        pressAction: { id: 'default', launchActivity: 'default' },
      },
      ios: { interruptionLevel: 'active' },
    })
    .catch((e) => reminderLog.warn('missed.followup_failed', String(e)));
}
