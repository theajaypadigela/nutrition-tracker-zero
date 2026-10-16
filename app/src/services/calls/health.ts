/** Reminder health (ported diagnostics): what could stop the daily call from ringing. */
import { Platform } from 'react-native';
import { describeCallback } from './callback';
import { loadPendingCallback } from './callbackStore';
import { inspectCallChannel } from './channels';
import { canUseFullScreenIntent, openFullScreenIntentSettings, openReminderAppSettings } from './native';
import { loadCachedSchedule } from './scheduleStore';
import {
  openAlarmPermissionSettings,
  openBatteryOptimizationSettings,
  openNotificationSettings,
  openPowerManagerSettings,
  readPermissionSnapshot,
} from './permissions';

export type HealthStatus = 'ok' | 'warn' | 'error';

export interface HealthItem {
  id: string;
  title: string;
  status: HealthStatus;
  detail: string;
  fix?: { label: string; run: () => void | Promise<void> };
}

export async function buildHealthReport(): Promise<HealthItem[]> {
  const snap = await readPermissionSnapshot();
  const items: HealthItem[] = [
    {
      id: 'notifications',
      title: 'Notifications',
      status: snap.notificationsAuthorized ? (snap.provisional ? 'warn' : 'ok') : 'error',
      detail: snap.notificationsAuthorized
        ? snap.provisional
          ? 'Quiet (provisional) delivery: calls may not ring loudly.'
          : 'Allowed.'
        : 'Off. The daily call cannot ring until you allow notifications.',
      fix: snap.notificationsAuthorized ? undefined : { label: 'Open settings', run: openNotificationSettings },
    },
  ];
  // The call the person asked for during a call: when it is due, and (Android, which can say) whether the OS still holds it.
  const pending = await loadPendingCallback();
  const zone = (await loadCachedSchedule())?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const callback = describeCallback(pending, zone);
  if (pending && callback) {
    const held = snap.native?.schedules.some(sch => sch.id === 'call-later' && sch.fireAt === pending.fireAt);
    const lost = Platform.OS === 'android' && !!snap.native && !held;
    items.push({
      id: 'callback',
      title: 'Call back you asked for',
      status: lost ? 'warn' : 'ok',
      detail: `${callback.clock.toUpperCase()} (in ${callback.inWords}).${lost ? ' The phone does not hold it right now; opening the app puts it back.' : ''}`,
    });
  }
  if (Platform.OS !== 'android') {
    items.push({
      id: 'delivery', title: 'Daily reminder', status: 'ok',
      detail: 'iOS delivers a sound notification at your selected time even when the app is closed. Tap it to start the call. Allow sounds and immediate delivery in Settings; Focus and silent mode can silence it.',
    });
    return items;
  }

  items.push(
    snap.exactAlarm === 'denied'
      ? { id: 'exact', title: 'Exact alarms', status: 'error', detail: 'Not allowed: Android cannot deliver the call at an exact time. Enable Alarms & reminders.', fix: { label: 'Allow', run: openAlarmPermissionSettings } }
      : { id: 'exact', title: 'Exact alarms', status: 'ok', detail: 'Native exact alarms are allowed, including when the app is closed.' },
  );
  const native = snap.native;
  if (!native) {
    items.push({ id: 'native', title: 'Installed reminder build', status: 'error',
      detail: 'This installed APK does not include the current native scheduler diagnostics. Install the rebuilt app, then open it once.' });
  } else {
    items.push({ id: 'native', title: 'Installed reminder build', status: 'ok',
      detail: `App ${native.appVersion}. Native scheduler version ${native.schedulerVersion}.` });
    const cached = await loadCachedSchedule();
    const daily = native.schedules.find(s => s.id === 'call-daily');
    const missing = cached?.callEnabled && !daily;
    items.push({ id: 'schedule', title: 'Saved daily alarm', status: missing ? 'error' : 'ok',
      detail: daily ? `${daily.callTime} (${daily.timezone}). Next occurrence: ${new Date(daily.fireAt).toLocaleString()}.`
        : missing ? 'Calls are enabled, but no native daily alarm was saved. Save your call time again and check for an error.'
          : 'Daily calls are paused or no time has been set.' });
    if (native.backgroundRestricted) {
      items.push({ id: 'background', title: 'Background activity', status: 'error',
        detail: 'Android restricts this app in the background. Allow background activity and choose unrestricted battery use.',
        fix: { label: 'App settings', run: openReminderAppSettings } });
    }
    const deliveries = native.events.filter(e => /alarm_received|service|foreground|ringer|fallback|stale_delivery|receiver_failed/.test(e.stage));
    const last = deliveries[deliveries.length - 1] ?? native.events[native.events.length - 1];
    if (last) items.push({ id: 'last-delivery', title: 'Last delivery event',
      status: /failed|blocked|rejected|inexact|fallback/.test(last.stage) ? 'warn' : 'ok',
      detail: `${last.stage.replace(/_/g, ' ')} at ${new Date(last.at).toLocaleString()}${last.error ? ` (${last.error})` : ''}.` });
  }
  const fsi = await canUseFullScreenIntent();
  items.push({
    id: 'fullscreen',
    title: 'Full-screen calls',
    status: fsi ? 'ok' : 'warn',
    detail: fsi ? 'The call can take over the lock screen.' : 'Not allowed: the call shows as a banner instead of full screen.',
    fix: fsi ? undefined : { label: 'Allow', run: openFullScreenIntentSettings },
  });
  items.push({
    id: 'battery',
    title: 'Battery optimization',
    status: snap.batteryOptimizationEnabled ? 'warn' : 'ok',
    detail: snap.batteryOptimizationEnabled ? 'On: Android may delay or drop the call. Exempt this app.' : 'Off for this app.',
    fix: snap.batteryOptimizationEnabled ? { label: 'Fix', run: openBatteryOptimizationSettings } : undefined,
  });
  const hyperOS = native && /xiaomi|poco|redmi/i.test(`${native.manufacturer} ${native.brand}`);
  if (hyperOS || snap.oemPowerManagerAvailable) {
    items.push({
      id: 'oem',
      title: hyperOS ? 'POCO / HyperOS background settings' : 'Manufacturer battery saver',
      status: 'warn',
      detail: hyperOS
        ? 'Allow Background autostart and choose No restrictions for this app. Also allow notifications on the lock screen and pop-up windows while running in the background. Android cannot verify HyperOS autostart; check these settings on the phone.'
        : 'Check autostart / no sleeping for this app in the manufacturer settings.',
      fix: { label: 'Open', run: hyperOS ? openReminderAppSettings : openPowerManagerSettings },
    });
  }
  const channel = await inspectCallChannel();
  if (channel) {
    const bad = !channel.exists || channel.blocked;
    items.push({
      id: 'channel',
      title: 'Call notification category',
      status: bad ? 'error' : channel.loweredImportance ? 'warn' : 'ok',
      detail: bad ? 'Blocked: calls will not appear.' : channel.loweredImportance ? 'Lowered: calls may not pop up.' : 'Healthy.',
      fix: bad || channel.loweredImportance ? { label: 'Open settings', run: openNotificationSettings } : undefined,
    });
  }
  items.push({ id: 'force-stop', title: 'Closed app', status: 'ok',
    detail: 'Swiping away the app does not cancel its alarms. Android Force stop cancels alarms: open the app again to restore them. Manufacturer battery restrictions can also block delivery.' });
  return items;
}
