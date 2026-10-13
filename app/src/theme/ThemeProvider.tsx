import React, { createContext, useContext, useMemo } from 'react';
import { StatusBar, StyleSheet, useColorScheme } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { darkPalette, lightPalette, type Palette } from './palette';

export interface Theme {
  isDark: boolean;
  colors: Palette;
}

const light: Theme = { isDark: false, colors: lightPalette };
const dark: Theme = { isDark: true, colors: darkPalette };

const ThemeContext = createContext<Theme>(light);

/** Follows the system light/dark setting. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const theme = useMemo(() => (scheme === 'dark' ? dark : light), [scheme]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export const useTheme = (): Theme => useContext(ThemeContext);

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
