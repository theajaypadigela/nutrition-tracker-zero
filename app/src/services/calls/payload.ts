import type { CallKind } from '@/api/types';

/** Shown on the native ring screen and the notification. */
export const ASSISTANT_NAME = 'Food check-in';
export const ASSISTANT_SUBTITLE = 'Daily voice log';
export const ASSISTANT_VERIFIED_LABEL = 'Nutrition Zero';

/**
 * The call descriptor that travels through the Notifee trigger data, the native ring surface
 * (relayed verbatim, see IncomingCallPayload.kt) and back to JS on answer / missed / "Log now".
 */
export interface RingPayload {
  callKind: CallKind;
  notificationId?: string;
  /** Epoch ms this ring was meant to fire (staleness check). */
  intendedFireAt?: number | null;
}

const KINDS: CallKind[] = ['scheduled', 'retry', 'test', 'manual'];

export function readRingPayload(raw: Record<string, unknown> | undefined | null): RingPayload | null {
  if (!raw) return null;
  const kind = raw.callKind;
  if (typeof kind !== 'string' || !KINDS.includes(kind as CallKind)) return null;
  const fire = Number(raw.intendedFireAt);
  return {
    callKind: kind as CallKind,
    notificationId: typeof raw.notificationId === 'string' ? raw.notificationId : undefined,
    intendedFireAt: Number.isFinite(fire) && fire > 0 ? fire : null,
  };
}

/** JSON for the native module: adds the display fields it renders. `kind` keeps the native meal-call copy. */
export function nativePayloadJson(p: RingPayload): string {
  return JSON.stringify({
    ...p,
    type: 'meal',
    kind: 'meal-call',
    callId: p.notificationId ?? `${p.callKind}-call`,
    assistantName: ASSISTANT_NAME,
    subtitle: ASSISTANT_SUBTITLE,
    verifiedLabel: ASSISTANT_VERIFIED_LABEL,
  });
}
