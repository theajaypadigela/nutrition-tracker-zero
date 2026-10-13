/**
 * Where a voice check-in plays, as on a phone call: the earpiece (or a connected headset) by default, the loudspeaker on
 * request. The ids match the Android CallAudio module (android/.../callaudio/AudioRoute.kt).
 */
export type AudioRoute = 'earpiece' | 'speaker' | 'wired' | 'bluetooth';

export interface CallAudioState {
  /** Where the call plays now; null when the phone does not say. */
  route: AudioRoute | null;
  /** The routes that can be chosen, in the order they are shown. */
  available: AudioRoute[];
  /** The phone can turn its screen off against the ear. */
  proximity: boolean;
  /** Something is against the screen (only watched while the earpiece is in use). */
  near: boolean;
}

/** The private route first, as a phone's call screen lists them. */
const ORDER: AudioRoute[] = ['earpiece', 'wired', 'speaker', 'bluetooth'];
const ROUTES = new Set<string>(ORDER);

export const ROUTE_LABEL: Record<AudioRoute, string> = {
  earpiece: 'Phone',
  wired: 'Headphones',
  speaker: 'Speaker',
  bluetooth: 'Bluetooth',
};

const isRoute = (v: unknown): v is AudioRoute => typeof v === 'string' && ROUTES.has(v);

export function sortRoutes(routes: Iterable<AudioRoute>): AudioRoute[] {
  const set = new Set(routes);
  // With headphones plugged in a call plays through them, and the earpiece cannot be chosen.
  if (set.has('wired')) set.delete('earpiece');
  return ORDER.filter(r => set.has(r));
}

/** A state from the native module, or null when it is not one. */
export function readAudioState(raw: unknown): CallAudioState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const available = Array.isArray(o.available) ? sortRoutes(o.available.filter(isRoute)) : [];
  return {
    route: isRoute(o.route) ? o.route : null,
    available,
    proximity: o.proximity === true,
    near: o.near === true,
  };
}

/** Where a call starts: a headset when one is connected, else the earpiece; the speaker only when there is nothing else. */
export function privateRoute(available: AudioRoute[]): AudioRoute | null {
  return (['bluetooth', 'wired', 'earpiece'] as const).find(r => available.includes(r)) ?? available[0] ?? null;
}

/** Daily's id for a route (react-native-webrtc's DailyWebRTCDevicesManager, Android and iOS). */
export type DailyAudioDeviceId = 'SPEAKERPHONE' | 'WIRED_OR_EARPIECE' | 'BLUETOOTH';

export function dailyDeviceId(route: AudioRoute): DailyAudioDeviceId {
  if (route === 'speaker') return 'SPEAKERPHONE';
  if (route === 'bluetooth') return 'BLUETOOTH';
  return 'WIRED_OR_EARPIECE';
}

export interface DailyDevice {
  deviceId?: string;
  kind?: string;
  label?: string;
}

/** The routes Daily lists (its enumerateDevices): the path used on iOS, and on Android if the CallAudio module is missing. */
export function routesFromDaily(devices: DailyDevice[]): AudioRoute[] {
  const out: AudioRoute[] = [];
  for (const d of devices) {
    if (d.kind !== 'audio' && d.kind !== 'audiooutput') continue;
    if (d.deviceId === 'SPEAKERPHONE') out.push('speaker');
    else if (d.deviceId === 'BLUETOOTH') out.push('bluetooth');
    else if (d.deviceId === 'WIRED_OR_EARPIECE') out.push(/wired|headset|headphone/i.test(d.label ?? '') ? 'wired' : 'earpiece');
  }
  return sortRoutes(out);
}

/** The call screen covers itself and ignores touches: the phone is at the ear and the call is in the earpiece. */
export function shouldShield(state: CallAudioState | null): boolean {
  return !!state && state.near && state.route === 'earpiece';
}
