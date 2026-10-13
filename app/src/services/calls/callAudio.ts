/**
 * The voice check-in's audio route and proximity screen-off, like a phone call.
 *
 * Android: the CallAudio native module routes (setCommunicationDevice on Android 12+) and holds the proximity screen-off
 * lock while the earpiece is in use. iOS: Daily routes (AVAudioSession), and the IncomingCall module switches UIDevice's
 * proximity monitoring, with which iOS turns the screen and touches off at the ear by itself.
 *
 * Daily (under Vapi) opens a call in its 'video' mode, which plays through the loudspeaker; openOnEarpiece switches it
 * to 'voice' before the call joins.
 */
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { reminderLog } from './logger';
import {
  dailyDeviceId,
  privateRoute,
  readAudioState,
  routesFromDaily,
  type AudioRoute,
  type CallAudioState,
  type DailyDevice,
} from './audioRoute';

/** The parts of Daily's call object this uses. */
export interface DailyAudioControls {
  setNativeInCallAudioMode?: (mode: 'video' | 'voice') => unknown;
  setAudioDevice?: (deviceId: string) => Promise<unknown>;
  enumerateDevices?: () => Promise<{ devices: DailyDevice[] }>;
  removeAllListeners?: (event?: string) => unknown;
}

type CallAudioNativeModule = {
  getState: () => Promise<unknown>;
  start: (route: string | null) => Promise<unknown>;
  setRoute: (route: string) => Promise<unknown>;
  stop: () => void;
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
};

type ProximityNativeModule = { setProximityMonitoring?: (enabled: boolean) => void };

export const CALL_AUDIO_EVENT = 'CallAudioChanged';
/** Daily answers setAudioDevice from its own thread; a call never waits longer than this for it. */
const DAILY_TIMEOUT_MS = 1500;

export interface CallAudioSession {
  /** The call joined: open it on the private route and watch for headsets and the proximity sensor. */
  start(daily: DailyAudioControls | null | undefined): Promise<void>;
  /** The person picked a route on the call screen. */
  setRoute(route: AudioRoute): Promise<void>;
  /** The call ended or the screen closed. */
  stop(): void;
}

/** Before the call joins: open it on the earpiece (or a connected headset) rather than the loudspeaker. */
export function openOnEarpiece(daily: DailyAudioControls | null | undefined): void {
  try {
    daily?.setNativeInCallAudioMode?.('voice');
  } catch (e) {
    reminderLog.warn('audio.voice_mode_failed', String(e));
  }
}

export function createCallAudioSession(onChange: (state: CallAudioState | null) => void): CallAudioSession {
  const native = (NativeModules.CallAudio as CallAudioNativeModule | undefined) ?? null;
  return Platform.OS === 'android' && native ? nativeSession(native, onChange) : dailySession(onChange);
}

function withTimeout<T>(p: Promise<T> | undefined): Promise<T | undefined> {
  if (!p) return Promise.resolve(undefined);
  return new Promise(resolve => {
    const t = setTimeout(() => resolve(undefined), DAILY_TIMEOUT_MS);
    p.then(
      v => {
        clearTimeout(t);
        resolve(v);
      },
      e => {
        clearTimeout(t);
        reminderLog.warn('audio.daily_failed', String(e));
        resolve(undefined);
      },
    );
  });
}

function nativeSession(native: CallAudioNativeModule, onChange: (state: CallAudioState | null) => void): CallAudioSession {
  let started: Promise<void> | null = null;
  let stopped = false;
  let subscription: { remove(): void } | null = null;
  const report = (raw: unknown) => {
    const state = readAudioState(raw);
    if (state && !stopped) onChange(state);
  };

  return {
    start(daily) {
      if (started || stopped) return started ?? Promise.resolve();
      started = (async () => {
        // Vapi puts back Daily's own idea of the route whenever a device comes or goes; the native module does that itself.
        try {
          daily?.removeAllListeners?.('available-devices-updated');
        } catch {
          // best effort
        }
        subscription = new NativeEventEmitter(native as never).addListener(CALL_AUDIO_EVENT, report);
        const route = privateRoute(readAudioState(await native.getState())?.available ?? []);
        // Picking a route through Daily once makes it stop routing by itself (its USER_SPECIFIED_ROUTE mode).
        if (route) await withTimeout(daily?.setAudioDevice?.(dailyDeviceId(route)));
        if (stopped) return;
        report(await native.start(route));
      })().catch(e => reminderLog.warn('audio.start_failed', String(e)));
      return started;
    },
    async setRoute(route) {
      if (!started || stopped) return;
      await started;
      if (stopped) return;
      report(await native.setRoute(route).catch(e => reminderLog.warn('audio.route_failed', String(e))));
    },
    stop() {
      if (stopped) return;
      stopped = true;
      subscription?.remove();
      subscription = null;
      // The native side runs calls in order, so this lands after a start that is still on its way.
      if (started) native.stop();
      onChange(null);
    },
  };
}

function dailySession(onChange: (state: CallAudioState | null) => void): CallAudioSession {
  const proximity = Platform.OS === 'ios' ? ((NativeModules.IncomingCall as ProximityNativeModule | undefined) ?? null) : null;
  const canDarken = typeof proximity?.setProximityMonitoring === 'function';
  let daily: DailyAudioControls | null = null;
  let started: Promise<void> | null = null;
  let stopped = false;

  const monitor = (on: boolean) => {
    try {
      proximity?.setProximityMonitoring?.(on);
    } catch {
      // best effort
    }
  };
  const routes = async () => routesFromDaily((await withTimeout(daily?.enumerateDevices?.()))?.devices ?? []);
  const applyRoute = async (route: AudioRoute, available: AudioRoute[]) => {
    await withTimeout(daily?.setAudioDevice?.(dailyDeviceId(route)));
    if (stopped) return;
    monitor(route === 'earpiece');
    onChange({ route, available, proximity: canDarken, near: false });
  };

  return {
    start(d) {
      if (started || stopped) return started ?? Promise.resolve();
      daily = d ?? null;
      started = (async () => {
        const available = await routes();
        const first = privateRoute(available);
        if (first && !stopped) await applyRoute(first, available);
      })().catch(e => reminderLog.warn('audio.start_failed', String(e)));
      return started;
    },
    async setRoute(route) {
      if (!started || stopped) return;
      await started;
      // Listed again each time: a headset may have come or gone since.
      const available = await routes();
      if (available.includes(route) && !stopped) await applyRoute(route, available);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      monitor(false);
      onChange(null);
    },
  };
}
