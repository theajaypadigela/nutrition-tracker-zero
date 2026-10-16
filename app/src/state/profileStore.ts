import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Profile } from '@/api/types';

const KEY = 'ntz.profile.v1';
const onboardingKey = (userId: string) => `ntz.onboarding-pending.${userId}`;

/** A new account resumes call setup after the app is closed or the person logs back in. */
export async function loadOnboardingPending(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(onboardingKey(userId))) === '1';
  } catch {
    return false;
  }
}

export async function saveOnboardingPending(userId: string, pending: boolean): Promise<void> {
  if (pending) await AsyncStorage.setItem(onboardingKey(userId), '1');
  else await AsyncStorage.removeItem(onboardingKey(userId));
}

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
