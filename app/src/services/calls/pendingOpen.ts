import AsyncStorage from '@react-native-async-storage/async-storage';
import { readRingPayload, type RingPayload } from './payload';

const KEY = 'ntz.pendingOpen.v1';

/** A ring/missed notification pressed while the UI wasn't running; consumed once the app is up. */
export async function setPendingOpen(payload: RingPayload): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(payload)).catch(() => {});
}

export async function takePendingOpen(): Promise<RingPayload | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    await AsyncStorage.removeItem(KEY);
    return readRingPayload(JSON.parse(raw));
  } catch {
    return null;
  }
}
