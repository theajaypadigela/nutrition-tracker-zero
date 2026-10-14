jest.mock('react-native', () => ({
  NativeModules: { IncomingCall: {
    scheduleIncomingCall: jest.fn(async json => JSON.parse(json).fireAt),
    cancelScheduledCall: jest.fn(async () => {}),
  } },
  Platform: { OS: 'android' },
  NativeEventEmitter: jest.fn(),
}));

import { NativeModules } from 'react-native';
import { scheduleNativeCall, cancelNativeScheduledCall } from '@/services/calls/native';

it('passes schedule, zone and display payload to the persistent native scheduler', async () => {
  const options = { id: 'call-daily', payload: { callKind: 'scheduled' as const }, fireAt: 123,
    repeatDaily: true, callTime: '20:00', timezone: 'Asia/Kolkata' };
  expect(await scheduleNativeCall(options)).toBe(123);
  expect(JSON.parse(NativeModules.IncomingCall.scheduleIncomingCall.mock.calls[0][0])).toMatchObject({
    ...options, payload: { callKind: 'scheduled', type: 'meal', kind: 'meal-call', assistantName: 'Food check-in' },
  });
});

it('cancels through the native module', async () => {
  await cancelNativeScheduledCall('call-daily');
  expect(NativeModules.IncomingCall.cancelScheduledCall).toHaveBeenCalledWith('call-daily');
});

it('does not silently fall back to foreground-only scheduling on an old installed binary', async () => {
  const method = NativeModules.IncomingCall.scheduleIncomingCall;
  delete NativeModules.IncomingCall.scheduleIncomingCall;
  try {
    await expect(scheduleNativeCall({ id: 'call-test', payload: { callKind: 'test' }, fireAt: 123,
      repeatDaily: false })).rejects.toThrow('Install the updated Android/iOS build');
  } finally { NativeModules.IncomingCall.scheduleIncomingCall = method; }
});
