/** Reminder health (ported diagnostics): what could stop the daily call from ringing. */
import { Platform } from 'react-native';
import { inspectCallChannel } from './channels';
import { canUseFullScreenIntent, openFullScreenIntentSettings } from './native';
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
  if (Platform.OS !== 'android') return items;

  items.push(
    snap.exactAlarm === 'denied'
      ? { id: 'exact', title: 'Exact alarms', status: 'warn', detail: 'Not allowed: the call may ring a few minutes late.', fix: { label: 'Allow', run: openAlarmPermissionSettings } }
      : { id: 'exact', title: 'Exact alarms', status: 'ok', detail: 'The call rings on time.' },
  );
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
  if (snap.oemPowerManagerAvailable) {
    items.push({
      id: 'oem',
      title: 'Manufacturer battery saver',
      status: 'warn',
      detail: 'This phone kills background apps aggressively. Allow autostart / no sleeping for this app.',
      fix: { label: 'Open', run: openPowerManagerSettings },
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
  return items;
}
