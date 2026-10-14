import { Platform } from 'react-native';
import notifee from '@notifee/react-native';
import { readPermissionSnapshot } from '@/services/calls/permissions';
import { readNativeReminderDiagnostics } from '@/services/calls/native';

jest.mock('@/services/calls/native', () => ({ readNativeReminderDiagnostics: jest.fn(async () => null) }));
const originalOS = Platform.OS;
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', { value: 'android' });
  (notifee.getNotificationSettings as jest.Mock).mockResolvedValue({ authorizationStatus: 1, android: { alarm: 1 }, ios: {} });
});
afterEach(() => { Object.defineProperty(Platform, 'OS', { value: originalOS }); });

it('uses the actual native AlarmManager permission when notification-library settings disagree', async () => {
  (readNativeReminderDiagnostics as jest.Mock).mockResolvedValue({ exactAlarmAllowed: false, notificationsEnabled: true });
  expect((await readPermissionSnapshot()).exactAlarm).toBe('denied');
});

it('detects blocked notifications even when the library reports authorization', async () => {
  (readNativeReminderDiagnostics as jest.Mock).mockResolvedValue({ exactAlarmAllowed: true, notificationsEnabled: false });
  expect((await readPermissionSnapshot()).notificationsAuthorized).toBe(false);
});

it('falls back to library settings on an older binary so its health report can request an update', async () => {
  (readNativeReminderDiagnostics as jest.Mock).mockResolvedValue(null);
  expect(await readPermissionSnapshot()).toMatchObject({ exactAlarm: 'granted', native: null });
});
