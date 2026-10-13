import AsyncStorage from '@react-native-async-storage/async-storage';

/** Follow the phone's light or dark setting, or always one of them. */
export type ThemePreference = 'system' | 'light' | 'dark';

const KEY = 'ntz.theme.v1';

export const isThemePreference = (value: unknown): value is ThemePreference => value === 'system' || value === 'light' || value === 'dark';

/**
 * The choice made in Settings, kept on this phone (it is about the screen in your hand, not about a profile). Anything unreadable,
 * and a phone with no choice yet, follows the system.
 */
export async function loadThemePreference(): Promise<ThemePreference> {
  try {
    const stored = await AsyncStorage.getItem(KEY);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export async function saveThemePreference(preference: ThemePreference): Promise<void> {
  try {
    if (preference === 'system') await AsyncStorage.removeItem(KEY);
    else await AsyncStorage.setItem(KEY, preference);
  } catch {
    // The choice still holds until the app closes; the next start follows the system.
  }
}
