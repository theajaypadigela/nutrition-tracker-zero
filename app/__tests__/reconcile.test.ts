import notifee from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { desiredDailyFire, reconcile } from '@/services/calls/reconcile';
import { scheduleNativeCall, cancelNativeScheduledCall } from '@/services/calls/native';
import { armTestCall } from '@/services/calls/reconcile';
import { saveCachedSchedule } from '@/services/calls/scheduleStore';

jest.mock('@/services/calls/native', () => ({
  scheduleNativeCall: jest.fn(async options => options.fireAt),
  cancelNativeScheduledCall: jest.fn(async () => {}),
  drainRingResults: jest.fn(async () => []),
  readNativeReminderDiagnostics: jest.fn(async () => null),
}));

const n = notifee as jest.Mocked<typeof notifee>;
const originalOS = Platform.OS;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  n.getNotificationSettings.mockResolvedValue({ authorizationStatus: 1, android: { alarm: 1 }, ios: {} } as any);
});
afterEach(() => { Object.defineProperty(Platform, 'OS', { value: originalOS }); });

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
  it('does not claim a five-second closed-app test is armed without exact-alarm permission', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    n.getNotificationSettings.mockResolvedValueOnce({ authorizationStatus: 1, android: { alarm: 0 }, ios: {} } as any);
    await expect(armTestCall()).rejects.toThrow('Allow Alarms & reminders');
    expect(scheduleNativeCall).not.toHaveBeenCalled();
  });

  it('does not arm an invisible test with notifications denied', async () => {
    n.getNotificationSettings.mockResolvedValueOnce({ authorizationStatus: 0, android: { alarm: 1 }, ios: {} } as any);
    await expect(armTestCall()).rejects.toThrow('Allow notifications');
    expect(scheduleNativeCall).not.toHaveBeenCalled();
  });
  it('cancels native alarms on disable even when Notifee has no triggers', async () => {
    await saveCachedSchedule({ callTime: '20:00', callEnabled: false, timezone: 'Asia/Kolkata' });
    n.getTriggerNotificationIds.mockResolvedValueOnce([]);
    await reconcile('disabled');
    expect(cancelNativeScheduledCall).toHaveBeenCalledWith('call-daily');
    expect(scheduleNativeCall).not.toHaveBeenCalled();
  });

  it('surfaces native scheduling failures and recovers on the next pass', async () => {
    await saveCachedSchedule({ callTime: '20:00', callEnabled: true, timezone: 'Asia/Kolkata' });
    (scheduleNativeCall as jest.Mock).mockRejectedValueOnce(new Error('native failure'));
    await expect(reconcile('failed')).rejects.toThrow('native failure');
    await expect(reconcile('recovered')).resolves.toMatchObject({ armedAt: expect.any(Number) });
  });

  it('uses the same native path for closed-app test calls', async () => {
    const fireAt = await armTestCall();
    expect(scheduleNativeCall).toHaveBeenCalledWith(expect.objectContaining({
      id: 'call-test', fireAt, repeatDaily: false,
      payload: { callKind: 'test', notificationId: 'call-test', intendedFireAt: fireAt },
    }));
    expect(n.createTriggerNotification).not.toHaveBeenCalled();
  });

  it('arms one daily trigger and prunes stray app triggers', async () => {
    await saveCachedSchedule({ callTime: '20:00', callEnabled: true, timezone: 'Asia/Kolkata' });
    n.getTriggerNotificationIds.mockResolvedValueOnce(['call-daily', 'call-old-scheme', 'someone-else']);
    const report = await reconcile('test', { signedIn: true, now: Date.parse('2026-10-04T06:00:00Z') });
    expect(report.armedAt).toBe(Date.parse('2026-10-04T14:30:00Z'));
    expect(n.createTriggerNotification).not.toHaveBeenCalled();
    expect(scheduleNativeCall).toHaveBeenCalledWith({
      id: 'call-daily', payload: { callKind: 'scheduled', notificationId: 'call-daily', intendedFireAt: report.armedAt },
      fireAt: report.armedAt, repeatDaily: true, callTime: '20:00', timezone: 'Asia/Kolkata',
    });
    expect(report.pruned).toEqual(['call-daily', 'call-old-scheme']);
    expect(n.cancelTriggerNotification).not.toHaveBeenCalledWith('someone-else');
  });

  it('cancels everything we own when signed out', async () => {
    await saveCachedSchedule({ callTime: '20:00', callEnabled: true, timezone: 'Asia/Kolkata' });
    n.getTriggerNotificationIds.mockResolvedValueOnce(['call-daily', 'call-test']);
    const report = await reconcile('test', { signedIn: false });
    expect(n.createTriggerNotification).not.toHaveBeenCalled();
    expect(report.pruned.sort()).toEqual(['call-daily', 'call-test']);
    expect(cancelNativeScheduledCall).toHaveBeenCalledWith('call-daily');
    expect(cancelNativeScheduledCall).toHaveBeenCalledWith('call-test');
  });
});
