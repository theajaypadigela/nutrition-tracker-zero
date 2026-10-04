/**
 * Permission and degraded-mode detection (§C). Wraps Notifee's settings APIs into a
 * single structured snapshot the reminder-health surface and the reconciliation pass
 * both consume. Every gap is logged through the structured logger.
 *
 * Platform notes:
 *  - POST_NOTIFICATIONS: Android 13+ runtime permission; on iOS this is the notification
 *    authorization. Checked at every launch/resume, not just mid-flow.
 *  - Exact alarms: we rely on SCHEDULE_EXACT_ALARM (the Play-policy-compliant path) and
 *    detect grant via notifee.getNotificationSettings().android.alarm at launch.
 *    Revoking the grant force-stops the app, so a broadcast receiver can't catch it —
 *    launch-time detection is the only reliable hook.
 *  - Full-screen intent: Notifee 9.x exposes no canUseFullScreenIntent query. When FSI is
 *    not permitted the OS automatically downgrades fullScreenAction to a heads-up
 *    notification on our HIGH-importance channel, so the fallback is built in.
 */

import notifee, {
  AuthorizationStatus,
  AndroidNotificationSetting,
} from '@notifee/react-native';
import { Platform } from 'react-native';
import { reminderLog } from './logger';

export type ExactAlarmState = 'granted' | 'denied' | 'not-applicable';

export type PermissionSnapshot = {
  /** POST_NOTIFICATIONS (Android) / notification authorization (iOS). */
  notificationsAuthorized: boolean;
  /** iOS provisional authorization (quiet delivery). false on Android. */
  provisional: boolean;
  /** Raw Notifee authorization status, for finer UI messaging. */
  authorizationStatus: AuthorizationStatus;
  /** Exact-alarm grant on Android 12+; 'not-applicable' below API 31 / on iOS. */
  exactAlarm: ExactAlarmState;
  /** Android battery optimization is ON (bad for reliability) — detect & offer fix. */
  batteryOptimizationEnabled: boolean;
  /** True if the device has a known OEM power-manager (autostart) screen we can deep-link. */
  oemPowerManagerAvailable: boolean;
};

export async function requestCorePermissions(): Promise<PermissionSnapshot> {
  await notifee.requestPermission();
  return readPermissionSnapshot();
}

export async function readPermissionSnapshot(): Promise<PermissionSnapshot> {
  const settings = await notifee.getNotificationSettings();

  const authorizationStatus = settings.authorizationStatus;
  const notificationsAuthorized =
    authorizationStatus === AuthorizationStatus.AUTHORIZED ||
    authorizationStatus === AuthorizationStatus.PROVISIONAL;
  const provisional = authorizationStatus === AuthorizationStatus.PROVISIONAL;

  let exactAlarm: ExactAlarmState = 'not-applicable';
  let batteryOptimizationEnabled = false;
  let oemPowerManagerAvailable = false;

  if (Platform.OS === 'android') {
    switch (settings.android.alarm) {
      case AndroidNotificationSetting.ENABLED:
        exactAlarm = 'granted';
        break;
      case AndroidNotificationSetting.DISABLED:
        exactAlarm = 'denied';
        break;
      default:
        // NOT_SUPPORTED => API < 31, no restriction => effectively granted.
        exactAlarm = 'not-applicable';
    }

    try {
      batteryOptimizationEnabled = await notifee.isBatteryOptimizationEnabled();
    } catch (e) {
      reminderLog.warn('perm.battery_check_failed', 'Battery optimization check failed', {
        error: String(e),
      });
    }

    try {
      const info = await notifee.getPowerManagerInfo();
      oemPowerManagerAvailable = Boolean(info?.activity);
    } catch (e) {
      reminderLog.warn('perm.power_manager_check_failed', 'Power manager check failed', {
        error: String(e),
      });
    }
  }

  const snapshot: PermissionSnapshot = {
    notificationsAuthorized,
    provisional,
    authorizationStatus,
    exactAlarm,
    batteryOptimizationEnabled,
    oemPowerManagerAvailable,
  };

  if (!notificationsAuthorized) {
    reminderLog.warn('perm.notifications_denied', 'Notifications are not authorized', {
      authorizationStatus,
    });
  }
  if (exactAlarm === 'denied') {
    reminderLog.warn(
      'perm.exact_alarm_denied',
      'Exact alarm permission not granted — reminders may be inexact',
    );
  }
  if (batteryOptimizationEnabled) {
    reminderLog.warn(
      'perm.battery_optimized',
      'Battery optimization is enabled — reminders may be delayed or dropped',
    );
  }

  return snapshot;
}

/**
 * Whether the system will deliver an exact, on-time alarm. When false, the scheduler
 * uses inexact triggers and the UI shows "reminders may be a few minutes late".
 */
export function canScheduleExact(snapshot: PermissionSnapshot): boolean {
  return snapshot.exactAlarm !== 'denied';
}

// ─── One-tap fix deep links ──────────────────────────────────────────────────

export async function openNotificationSettings(): Promise<void> {
  await notifee.openNotificationSettings().catch(e =>
    reminderLog.warn('perm.open_notification_settings_failed', String(e)),
  );
}

export async function openAlarmPermissionSettings(): Promise<void> {
  await notifee.openAlarmPermissionSettings().catch(e =>
    reminderLog.warn('perm.open_alarm_settings_failed', String(e)),
  );
}

export async function openBatteryOptimizationSettings(): Promise<void> {
  await notifee.openBatteryOptimizationSettings().catch(e =>
    reminderLog.warn('perm.open_battery_settings_failed', String(e)),
  );
}

export async function openPowerManagerSettings(): Promise<void> {
  await notifee.openPowerManagerSettings().catch(e =>
    reminderLog.warn('perm.open_power_manager_failed', String(e)),
  );
}
