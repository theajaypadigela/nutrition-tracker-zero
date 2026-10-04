import { nativePayloadJson, readRingPayload } from '@/services/calls/payload';

describe('ring payload', () => {
  it('round-trips through the native JSON (which adds display fields)', () => {
    const json = nativePayloadJson({ callKind: 'scheduled', notificationId: 'call-daily', intendedFireAt: 123 });
    const raw = JSON.parse(json);
    expect(raw).toMatchObject({ kind: 'meal-call', type: 'meal', callId: 'call-daily', assistantName: 'Food check-in' });
    expect(readRingPayload(raw)).toEqual({ callKind: 'scheduled', notificationId: 'call-daily', intendedFireAt: 123 });
  });
  it('reads Notifee string data and the native retry marker', () => {
    expect(readRingPayload({ callKind: 'test', intendedFireAt: '1791096272964' })).toEqual({
      callKind: 'test',
      notificationId: undefined,
      intendedFireAt: 1791096272964,
    });
    expect(readRingPayload({ callKind: 'retry', isRescheduled: true })?.callKind).toBe('retry');
  });
  it('rejects unknown kinds', () => {
    expect(readRingPayload({ callKind: 'habit' })).toBeNull();
    expect(readRingPayload(undefined)).toBeNull();
  });
});
