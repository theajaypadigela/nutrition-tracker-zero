/**
 * Typed wrapper over the native `IncomingCall` module (Android full-screen ring service, iOS
 * CallKit). Native owns the ringing surface; JS hands it a payload and reads back the result.
 */
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { nativePayloadJson, readRingPayload, type RingPayload } from './payload';

type IncomingCallNativeModule = {
  presentIncomingCall: (payloadJson: string) => void;
  dismissIncomingCall: () => void;
  consumePendingAnswer: () => Promise<string | null>;
  drainCallMarkers: () => Promise<string>;
  consumePendingMissedAction: () => Promise<string | null>;
  consumePendingHangup?: () => Promise<string | null>;
  cancelAutoRetry?: () => void;
  canUseFullScreenIntent: () => Promise<boolean>;
  openFullScreenIntentSettings: () => void;
  setCallScreenShown?: (shown: boolean) => void;
  scheduleIncomingCall?: (optionsJson: string) => Promise<number>;
  cancelScheduledCall?: (id: string) => Promise<void>;
  getReminderDiagnostics?: () => Promise<string>;
  openReminderAppSettings?: () => void;
};

const nativeModule: IncomingCallNativeModule | null =
  (NativeModules.IncomingCall as IncomingCallNativeModule | undefined) ?? null;

export const isNativeCallAvailable = nativeModule != null;

export interface NativeReminderDiagnostics {
  schedulerVersion: number;
  appVersion: string;
  manufacturer: string;
  brand: string;
  model: string;
  androidVersion: string;
  androidSdk: number;
  exactAlarmAllowed: boolean;
  notificationsEnabled: boolean;
  fullScreenAllowed: boolean;
  batteryOptimizationExcluded: boolean;
  backgroundRestricted: boolean;
  schedules: { id: string; fireAt: number; repeatDaily: boolean; callTime?: string; timezone?: string }[];
  events: { stage: string; at: number; id?: string; intendedFireAt?: number; error?: string }[];
}

export async function readNativeReminderDiagnostics(): Promise<NativeReminderDiagnostics | null> {
  if (Platform.OS !== 'android' || !nativeModule?.getReminderDiagnostics) return null;
  return JSON.parse(await nativeModule.getReminderDiagnostics());
}

export function openReminderAppSettings(): void {
  nativeModule?.openReminderAppSettings?.();
}

/** Scheduling must reach the OS; a JS timer/headless callback cannot own a closed-app ring. */
export async function scheduleNativeCall(options: {
  id: string;
  payload: RingPayload;
  fireAt: number;
  repeatDaily: boolean;
  callTime?: string;
  timezone?: string;
  /** The words of the iOS reminder notification, when they are not the daily ones (a call back). Android draws its own ring screen. */
  notification?: { title: string; body: string };
}): Promise<number> {
  if (!nativeModule?.scheduleIncomingCall) {
    throw new Error('Install the updated Android/iOS build to enable reminders while the app is closed.');
  }
  return nativeModule.scheduleIncomingCall(JSON.stringify({
    ...options,
    payload: JSON.parse(nativePayloadJson(options.payload)),
  }));
}

export async function cancelNativeScheduledCall(id: string): Promise<void> {
  await nativeModule?.cancelScheduledCall?.(id);
}

function parse(json: string | null | undefined): RingPayload | null {
  if (!json) return null;
  try {
    return readRingPayload(JSON.parse(json));
  } catch {
    return null;
  }
}

/** Rings the native incoming-call surface. False when the module is unavailable. */
export function presentIncomingCall(payload: RingPayload): boolean {
  if (!nativeModule) return false;
  try {
    nativeModule.presentIncomingCall(nativePayloadJson(payload));
    return true;
  } catch {
    return false;
  }
}

export function dismissIncomingCall(): void {
  try {
    nativeModule?.dismissIncomingCall();
  } catch {
    // best effort
  }
}

/** The ring the user ANSWERED (and clears it). */
export async function consumePendingAnswer(): Promise<RingPayload | null> {
  return nativeModule ? parse(await nativeModule.consumePendingAnswer().catch(() => null)) : null;
}

/** The missed-call notification the user tapped "Log now" on (and clears it). */
export async function consumePendingMissedAction(): Promise<RingPayload | null> {
  return nativeModule ? parse(await nativeModule.consumePendingMissedAction().catch(() => null)) : null;
}

/** A CallKit hang-up that arrived after Answer (iOS). */
export async function consumePendingHangup(): Promise<RingPayload | null> {
  if (!nativeModule?.consumePendingHangup) return null;
  return parse(await nativeModule.consumePendingHangup().catch(() => null));
}

export interface RingResult {
  payload: RingPayload;
  result: 'declined' | 'missed';
}

/** Declined / missed results the native side recorded while JS wasn't running (and clears them). */
export async function drainRingResults(): Promise<RingResult[]> {
  if (!nativeModule) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse((await nativeModule.drainCallMarkers().catch(() => '[]')) || '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: RingResult[] = [];
  for (const m of parsed) {
    const payload = readRingPayload(m);
    if (payload && (m.result === 'declined' || m.result === 'missed')) out.push({ payload, result: m.result });
  }
  return out;
}

/** The day's call was handled another way: drop the pending +60 min auto re-ring (Android). */
export function cancelAutoRetry(): void {
  try {
    nativeModule?.cancelAutoRetry?.();
  } catch {
    // best effort
  }
}

/**
 * The call screen opened or closed (Android). It is the only screen that may show over the lock screen: once it closes,
 * the rest of the app needs the phone unlocked, and the person is asked to unlock if it is locked.
 */
export function setCallScreenShown(shown: boolean): void {
  try {
    nativeModule?.setCallScreenShown?.(shown);
  } catch {
    // best effort
  }
}

export async function canUseFullScreenIntent(): Promise<boolean> {
  if (!nativeModule) return true;
  return nativeModule.canUseFullScreenIntent().catch(() => true);
}

export function openFullScreenIntentSettings(): void {
  nativeModule?.openFullScreenIntentSettings();
}

/** iOS CallKit live events (answer / end); Android uses the durable consume methods only. */
export function subscribeToNativeCallEvents(listener: (event: 'answered' | 'ended' | 'other') => void): () => void {
  if (Platform.OS !== 'ios' || !nativeModule) return () => {};
  let emitter: NativeEventEmitter;
  try {
    emitter = new NativeEventEmitter(nativeModule as any);
  } catch {
    return () => {};
  }
  const subs = [
    emitter.addListener('IncomingCallAnswered', () => listener('answered')),
    emitter.addListener('IncomingCallEnded', () => listener('ended')),
    emitter.addListener('IncomingCallDeclined', () => listener('other')),
    emitter.addListener('IncomingCallMissed', () => listener('other')),
  ];
  return () => subs.forEach((s) => s.remove());
}
