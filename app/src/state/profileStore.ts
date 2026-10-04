import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Profile } from '@/api/types';

const KEY = 'ntz.profile.v1';

/** The chosen profile, persisted so the app (and the headless ring handler) know who this phone is. */
export async function loadProfile(): Promise<Profile | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.id === 'string' && typeof parsed?.name === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveProfile(profile: Profile | null): Promise<void> {
  if (profile) await AsyncStorage.setItem(KEY, JSON.stringify(profile));
  else await AsyncStorage.removeItem(KEY);
}
