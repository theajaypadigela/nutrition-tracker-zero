import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The call the person asked for during a call ("call me again in 20 minutes"). The alarm itself lives in the operating system, so it
 * rings with the app closed; this record is what the app knows of it. It is how the screens say it is coming, how a pass at start-up
 * puts it back if the OS lost it (Android's Force stop drops alarms), and how it is dropped once it is over.
 */
export interface PendingCallback {
  /** Epoch ms it should ring. */
  fireAt: number;
  /** When it was asked for, and the minutes that were asked. */
  requestedAt: number;
  minutes: number;
  /** The profile that asked, so a different account never rings for it. */
  profileId?: string;
}

const KEY = 'ntz.callback.v1';

export async function loadPendingCallback(): Promise<PendingCallback | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!Number.isFinite(v?.fireAt) || !Number.isFinite(v?.requestedAt) || !Number.isFinite(v?.minutes)) return null;
    return { fireAt: v.fireAt, requestedAt: v.requestedAt, minutes: v.minutes, ...(typeof v.profileId === 'string' ? { profileId: v.profileId } : {}) };
  } catch {
    return null;
  }
}

export async function savePendingCallback(callback: PendingCallback | null): Promise<void> {
  if (callback) await AsyncStorage.setItem(KEY, JSON.stringify(callback));
  else await AsyncStorage.removeItem(KEY);
}
