import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CallSchedule {
  callTime: string | null;
  callEnabled: boolean;
  timezone: string;
}

const KEY = 'ntz.callSchedule.v1';

/** Last schedule seen from the server, so reconciliation can arm the ring while offline. */
export async function loadCachedSchedule(): Promise<CallSchedule | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (typeof v?.timezone !== 'string' || typeof v?.callEnabled !== 'boolean') return null;
    return { callTime: typeof v.callTime === 'string' ? v.callTime : null, callEnabled: v.callEnabled, timezone: v.timezone };
  } catch {
    return null;
  }
}

export async function saveCachedSchedule(schedule: CallSchedule | null): Promise<void> {
  if (schedule) await AsyncStorage.setItem(KEY, JSON.stringify(schedule));
  else await AsyncStorage.removeItem(KEY);
}

const RING_LOG_KEY = 'ntz.lastRing.v1';

export interface LastRing {
  result: 'declined' | 'missed' | 'answered' | 'stale';
  callKind: string;
  at: number;
}

export async function recordRing(ring: LastRing): Promise<void> {
  await AsyncStorage.setItem(RING_LOG_KEY, JSON.stringify(ring)).catch(() => {});
}

export async function loadLastRing(): Promise<LastRing | null> {
  try {
    const raw = await AsyncStorage.getItem(RING_LOG_KEY);
    return raw ? (JSON.parse(raw) as LastRing) : null;
  } catch {
    return null;
  }
}
