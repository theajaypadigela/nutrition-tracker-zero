/** Android AlarmManager → native receiver/service; iOS repeating calendar notifications.
 * Neither delivery path needs React Native or a backend at the scheduled time. */
import notifee, { AndroidImportance } from '@notifee/react-native';
import type { CallKind } from '@/api/types';
import { MISSED_CHANNEL_ID } from './channels';
import { reminderLog } from './logger';
import { cancelNativeScheduledCall, scheduleNativeCall } from './native';

export const DAILY_TRIGGER_ID = 'call-daily';
export const TEST_TRIGGER_ID = 'call-test';
/** The one call the person asked for during a call ("call me again in 20 minutes"): a one-shot the OS keeps, replaced by the next ask. */
export const CALLBACK_TRIGGER_ID = 'call-later';

export function isAppOwnedTriggerId(id: string): boolean {
  return id.startsWith('call-');
}

export async function armRing(opts: {
  id: string;
  callKind: CallKind;
  fireAt: number;
  repeatDaily: boolean;
  exact: boolean;
  callTime?: string;
  timezone?: string;
  reason?: 'callback';
  notification?: { title: string; body: string };
}): Promise<number> {
  // Remove the old heartbeat so upgrading cannot ring twice. Do not cancel the native
  // alarm before replacing it: an unsuccessful save should leave tomorrow's ring armed.
  await notifee.cancelTriggerNotification(opts.id);
  const armedAt = await scheduleNativeCall({
    id: opts.id,
    payload: { callKind: opts.callKind, notificationId: opts.id, intendedFireAt: opts.fireAt, ...(opts.reason ? { reason: opts.reason } : {}) },
    fireAt: opts.fireAt,
    repeatDaily: opts.repeatDaily,
    callTime: opts.callTime,
    timezone: opts.timezone,
    notification: opts.notification,
  });
  reminderLog.info('schedule.armed', `Armed ${opts.id}`, { fireAt: armedAt, exact: opts.exact });
  return armedAt;
}

export async function cancelRing(id: string): Promise<void> {
  await cancelNativeScheduledCall(id);
  await notifee.cancelTriggerNotification(id);
  await notifee.cancelDisplayedNotification(id);
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
