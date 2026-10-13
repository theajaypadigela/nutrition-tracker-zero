/**
 * Light or dark: the system's setting until the person chooses in Settings, then their choice, kept on the phone. The palette itself
 * is tested in `palette.test.ts` and the kit in `kit.test.tsx`.
 */
import React from 'react';
import * as RN from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TestRenderer, { act } from 'react-test-renderer';
import { loadThemePreference, saveThemePreference } from '@/theme/preference';
import { ThemeProvider, useTheme, useThemePreference, type ThemePreference } from '@/theme';
import { darkPalette, lightPalette } from '@/theme/palette';

jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));

const KEY = 'ntz.theme.v1';
let current: { isDark: boolean; background: string; preference: ThemePreference; set: (p: ThemePreference) => void };

function Probe() {
  const { isDark, colors } = useTheme();
  const { preference, setPreference } = useThemePreference();
  current = { isDark, background: colors.bg, preference, set: setPreference };
  return null;
}

let scheme: 'light' | 'dark' | 'unspecified';
let tree: TestRenderer.ReactTestRenderer | undefined;
let setColorScheme: jest.SpyInstance;

async function mount() {
  await act(async () => {
    tree = TestRenderer.create(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
  });
}
/** Renders again, so a change to what `useColorScheme` returns is read (the platform tells the app in the same way). */
async function rerender() {
  await act(async () => {
    tree!.update(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  scheme = 'light';
  jest.spyOn(RN, 'useColorScheme').mockImplementation(() => scheme);
  setColorScheme = jest.spyOn(RN.Appearance, 'setColorScheme').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
  });
  tree = undefined;
  jest.restoreAllMocks();
});

describe('the choice, on the phone', () => {
  it('is the system until one is made', async () => {
    expect(await loadThemePreference()).toBe('system');
  });

  it('is kept, and read back', async () => {
    await saveThemePreference('dark');
    expect(await AsyncStorage.getItem(KEY)).toBe('dark');
    expect(await loadThemePreference()).toBe('dark');
    await saveThemePreference('light');
    expect(await loadThemePreference()).toBe('light');
  });

  it('is forgotten when it goes back to following the system, so there is nothing to read', async () => {
    await saveThemePreference('dark');
    await saveThemePreference('system');
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
    expect(await loadThemePreference()).toBe('system');
  });

  it('is the system when what is stored is not a choice', async () => {
    await AsyncStorage.setItem(KEY, 'purple');
    expect(await loadThemePreference()).toBe('system');
  });

  it('is the system when storage cannot be read, or written, and nothing breaks', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk'));
    expect(await loadThemePreference()).toBe('system');
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk'));
    await expect(saveThemePreference('dark')).resolves.toBeUndefined();
  });
});

describe('the look of the app', () => {
  it('follows the system until the person chooses', async () => {
    scheme = 'light';
    await mount();
    expect(current).toMatchObject({ isDark: false, background: lightPalette.bg, preference: 'system' });
    scheme = 'dark';
    await rerender();
    expect(current).toMatchObject({ isDark: true, background: darkPalette.bg, preference: 'system' });
    expect(setColorScheme).not.toHaveBeenCalled(); // nothing to tell the platform
  });

  it('is dark when the person says dark, whatever the system says, at once, and tells the platform and the phone', async () => {
    scheme = 'light';
    await mount();
    await act(async () => {
      current.set('dark');
    });
    expect(current).toMatchObject({ isDark: true, background: darkPalette.bg, preference: 'dark' });
    expect(setColorScheme).toHaveBeenLastCalledWith('dark');
    expect(await AsyncStorage.getItem(KEY)).toBe('dark');
  });

  it('is light when the person says light, even on a phone set to dark', async () => {
    scheme = 'dark';
    await mount();
    expect(current.isDark).toBe(true);
    await act(async () => {
      current.set('light');
    });
    expect(current).toMatchObject({ isDark: false, background: lightPalette.bg, preference: 'light' });
    expect(setColorScheme).toHaveBeenLastCalledWith('light');
    expect(await AsyncStorage.getItem(KEY)).toBe('light');
  });

  it('goes back to following the system when the person says so, and hands control back to the platform', async () => {
    scheme = 'light';
    await mount();
    await act(async () => {
      current.set('dark');
    });
    scheme = 'dark'; // the platform now reports the choice as the scheme
    await rerender();
    await act(async () => {
      current.set('system');
    });
    expect(setColorScheme).toHaveBeenLastCalledWith('unspecified');
    scheme = 'light'; // the platform reports the system's own setting again
    await rerender();
    expect(current).toMatchObject({ isDark: false, preference: 'system' });
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });

  it('keeps the palette on screen while the platform has not yet said what the system is, so nothing flashes', async () => {
    scheme = 'dark';
    await mount();
    expect(current.isDark).toBe(true);
    await act(async () => {
      current.set('light');
    });
    scheme = 'light';
    await rerender();
    expect(current.isDark).toBe(false);
    await act(async () => {
      current.set('system');
    });
    scheme = 'unspecified'; // handed back, and no report yet
    await rerender();
    expect(current).toMatchObject({ isDark: false, preference: 'system' }); // still the light the person had
    scheme = 'dark'; // the system is dark: now it follows
    await rerender();
    expect(current.isDark).toBe(true);
  });

  it('starts with the choice made last time, which may differ from the system', async () => {
    await AsyncStorage.setItem(KEY, 'dark');
    scheme = 'light';
    await mount();
    expect(current).toMatchObject({ isDark: true, background: darkPalette.bg, preference: 'dark' });
    expect(setColorScheme).toHaveBeenCalledWith('dark');
  });

  it('starts on the system when nothing was chosen, without telling the platform anything', async () => {
    scheme = 'dark';
    await mount();
    expect(current).toMatchObject({ isDark: true, preference: 'system' });
    expect(setColorScheme).not.toHaveBeenCalled();
  });

  it('does not break on a platform that cannot be told', async () => {
    setColorScheme.mockImplementation(() => {
      throw new Error('not supported');
    });
    scheme = 'light';
    await mount();
    await act(async () => {
      current.set('dark');
    });
    expect(current).toMatchObject({ isDark: true, preference: 'dark' }); // the palette is chosen in the app either way
  });

  it('keeps one theme object for one palette, so styles built from it are built once', async () => {
    await mount();
    const first = tree!.root.findAllByType(Probe)[0]!;
    expect(first).toBeDefined();
    const seen = new Set<unknown>();
    function Collect() {
      seen.add(useTheme());
      return null;
    }
    await act(async () => {
      tree!.update(
        <ThemeProvider>
          <Collect />
        </ThemeProvider>,
      );
    });
    await act(async () => {
      tree!.update(
        <ThemeProvider>
          <Collect />
        </ThemeProvider>,
      );
    });
    expect(seen.size).toBe(1);
  });
});
