import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Appearance, StatusBar, StyleSheet, useColorScheme } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { darkPalette, lightPalette, type Palette } from './palette';
import { loadThemePreference, saveThemePreference, type ThemePreference } from './preference';

export interface Theme {
  isDark: boolean;
  colors: Palette;
}

const light: Theme = { isDark: false, colors: lightPalette };
const dark: Theme = { isDark: true, colors: darkPalette };

const ThemeContext = createContext<Theme>(light);

interface ThemePreferenceState {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const PreferenceContext = createContext<ThemePreferenceState>({ preference: 'system', setPreference: () => {} });

/**
 * Tells the platform too, so what React Native does not draw (the time picker, alerts) follows the choice. `unspecified` hands
 * control back to the system. A platform that cannot be told still gets the right colours: the palette is chosen in ThemeProvider.
 */
function applyToPlatform(preference: ThemePreference): void {
  try {
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
  } catch {
    // Not every platform (or test renderer) can be told.
  }
}

/**
 * Light or dark: the person's choice from Settings, or, until they make one, the system's setting. The choice is read from storage
 * after the first frame, so a person who chose against their system's setting may see one frame of the other palette at start-up.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    let alive = true;
    loadThemePreference().then(stored => {
      if (!alive || stored === 'system') return;
      setPreferenceState(stored);
      applyToPlatform(stored);
    });
    return () => {
      alive = false;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    applyToPlatform(next);
    saveThemePreference(next);
  }, []);

  // Handing control back to the system reads as `unspecified` until the platform reports the real scheme (or never, when the choice
  // matched the system and nothing changed): the palette on screen stays as it was meanwhile, so nothing flashes the wrong colours.
  const shown = useRef<'light' | 'dark'>(system === 'dark' ? 'dark' : 'light');
  const scheme: 'light' | 'dark' = preference !== 'system' ? preference : system === 'dark' || system === 'light' ? system : shown.current;
  useEffect(() => {
    shown.current = scheme;
  }, [scheme]);
  const theme = useMemo(() => (scheme === 'dark' ? dark : light), [scheme]);
  const state = useMemo(() => ({ preference, setPreference }), [preference, setPreference]);
  return (
    <PreferenceContext.Provider value={state}>
      <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
    </PreferenceContext.Provider>
  );
}

export const useTheme = (): Theme => useContext(ThemeContext);

/** The choice in Settings (`system`, `light` or `dark`) and the way to change it. */
export const useThemePreference = (): ThemePreferenceState => useContext(PreferenceContext);

/**
 * `const useStyles = createStyles(({ colors }) => ({ box: { backgroundColor: colors.surface } }))`
 * then `const styles = useStyles()` in the component. Styles are built once per theme, so the
 * hook costs a context read and a map lookup.
 */
export function createStyles<T extends StyleSheet.NamedStyles<T>>(factory: (theme: Theme) => T): () => T {
  const cache = new Map<Theme, T>();
  return function useStyles(): T {
    const theme = useTheme();
    let styles = cache.get(theme);
    if (!styles) {
      styles = StyleSheet.create(factory(theme));
      cache.set(theme, styles);
    }
    return styles;
  };
}

/** System-bar icons that contrast with the theme's page colour. */
export function AppStatusBar({ tone = 'theme' }: { tone?: 'theme' | 'light' }) {
  const { isDark } = useTheme();
  const lightIcons = tone === 'light' || isDark;
  return <StatusBar barStyle={lightIcons ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />;
}

/**
 * The status bar for one screen. Mounted only while that screen is focused, so React Native's
 * StatusBar stack falls back to the previous screen's style on blur (resetting in a blur
 * callback lost the race with the next screen's focus).
 */
export function FocusAwareStatusBar({ tone = 'theme' }: { tone?: 'theme' | 'light' }) {
  const focused = useIsFocused();
  return focused ? <AppStatusBar tone={tone} /> : null;
}
