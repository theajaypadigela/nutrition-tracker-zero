import notifee from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { desiredDailyFire, reconcile } from '@/services/calls/reconcile';
import { saveCachedSchedule } from '@/services/calls/scheduleStore';

const n = notifee as jest.Mocked<typeof notifee>;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe('desiredDailyFire', () => {
  const now = Date.parse('2026-10-04T06:00:00Z');
  it('is null when calls are off or unset', () => {
    expect(desiredDailyFire(null, now)).toBeNull();
    expect(desiredDailyFire({ callTime: '20:00', callEnabled: false, timezone: 'Asia/Kolkata' }, now)).toBeNull();
    expect(desiredDailyFire({ callTime: null, callEnabled: true, timezone: 'Asia/Kolkata' }, now)).toBeNull();
  });
  it('uses the profile time zone, not the phone’s', () => {
    expect(desiredDailyFire({ callTime: '20:00', callEnabled: true, timezone: 'Asia/Kolkata' }, now)).toBe(Date.parse('2026-10-04T14:30:00Z'));
  });
});

describe('reconcile', () => {
  it('arms one daily trigger and prunes stray app triggers', async () => {
    await saveCachedSchedule({ callTime: '20:00', callEnabled: true, timezone: 'Asia/Kolkata' });
    n.getTriggerNotificationIds.mockResolvedValueOnce(['call-daily', 'call-old-scheme', 'someone-else']);
    const report = await reconcile('test', { signedIn: true, now: Date.parse('2026-10-04T06:00:00Z') });
    expect(report.armedAt).toBe(Date.parse('2026-10-04T14:30:00Z'));
    expect(n.createTriggerNotification).toHaveBeenCalledTimes(1);
    const [notification, trigger] = n.createTriggerNotification.mock.calls[0]!;
    expect(notification.id).toBe('call-daily');
    expect(notification.data).toMatchObject({ callKind: 'scheduled' });
    expect(trigger).toMatchObject({ timestamp: Date.parse('2026-10-04T14:30:00Z'), repeatFrequency: 1 });
    expect(report.pruned).toEqual(['call-old-scheme']);
  });

  it('cancels everything we own when signed out', async () => {
    await saveCachedSchedule({ callTime: '20:00', callEnabled: true, timezone: 'Asia/Kolkata' });
    n.getTriggerNotificationIds.mockResolvedValueOnce(['call-daily', 'call-test']);
    const report = await reconcile('test', { signedIn: false });
    expect(n.createTriggerNotification).not.toHaveBeenCalled();
    expect(report.pruned.sort()).toEqual(['call-daily', 'call-test']);
  });
});
