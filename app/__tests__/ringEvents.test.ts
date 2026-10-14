import { Platform } from 'react-native';
import { EventType } from '@notifee/react-native';
import { handleNotifeeEvent } from '@/services/calls/ringEvents';
import { presentIncomingCall } from '@/services/calls/native';

jest.mock('@/services/calls/native', () => ({ presentIncomingCall: jest.fn(() => true) }));
const originalOS = Platform.OS;
afterEach(() => { Object.defineProperty(Platform, 'OS', { value: originalOS }); jest.clearAllMocks(); });

it('leaves iOS local delivery to the OS instead of ringing CallKit only when JS is alive', async () => {
  Object.defineProperty(Platform, 'OS', { value: 'ios' });
  await handleNotifeeEvent({ type: EventType.DELIVERED, detail: {
    notification: { id: 'call-daily', data: { callKind: 'scheduled', intendedFireAt: String(Date.now()) } },
  } });
  expect(presentIncomingCall).not.toHaveBeenCalled();
});

it('opens an iOS reminder on tap even if the stored legacy timestamp is old', async () => {
  Object.defineProperty(Platform, 'OS', { value: 'ios' });
  const result = await handleNotifeeEvent({ type: EventType.PRESS, detail: {
    notification: { id: 'call-daily', data: { callKind: 'scheduled', intendedFireAt: '1' } },
  } });
  expect(result?.callKind).toBe('scheduled');
  expect(presentIncomingCall).not.toHaveBeenCalled();
});
