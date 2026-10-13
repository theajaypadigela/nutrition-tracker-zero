/**
 * Settings has the light/dark choice: System, Light or Dark, near the top, under the profile. The theme itself is tested in
 * `themePreference.test.tsx`; here the screen is rendered and the control is driven.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

jest.mock('@react-navigation/native', () => {
  const react = jest.requireActual('react');
  const nav = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => true) };
  return { useNavigation: () => nav, useIsFocused: () => true, useRoute: jest.fn(() => ({ params: {} })), useFocusEffect: (effect: () => void) => react.useEffect(effect, [effect]) };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('@/state/ProfileContext', () => ({ useProfile: () => ({ profile: { id: 'u1', name: 'Asha Rao' }, selectProfile: jest.fn() }) }));
jest.mock('@/state/HealthContext', () => ({ useHealth: () => ({ profile: null, status: 'ready', numbersHidden: false, apply: jest.fn(), refresh: jest.fn() }) }));
jest.mock('@/services/calls/reconcile', () => ({ armTestCall: jest.fn() }));
jest.mock('@/services/calls/schedule', () => ({ applySchedule: jest.fn(async () => {}) }));
jest.mock('@/services/calls/scheduleStore', () => ({ loadLastRing: jest.fn(async () => null) }));
jest.mock('@/services/secret', () => ({ clearProfileSecret: jest.fn() }));
jest.mock('@/api/client', () => ({
  api: {
    getSettings: jest.fn(async () => ({ id: 'u1', name: 'Asha Rao', timezone: 'Asia/Kolkata', callTime: '20:00', callEnabled: true, vapi: { configured: true }, lastCall: null })),
  },
  errorMessage: (e: unknown) => String(e),
}));

import * as RN from 'react-native';
import { api } from '@/api/client';
import SettingsScreen from '@/screens/SettingsScreen';
import { ThemeProvider, useTheme } from '@/theme';
import { darkPalette, lightPalette } from '@/theme/palette';

const textOf = (n: ReactTestInstance) => [n.props.children].flat(Infinity).filter(c => typeof c === 'string' || typeof c === 'number').join('');
const all = (tree: TestRenderer.ReactTestRenderer) => tree.root.findAll((n: ReactTestInstance) => (n.type as unknown) === 'Text').map(textOf).join('\n');
let bg = '';
function Watch() {
  bg = useTheme().colors.bg;
  return null;
}
const tab = (tree: TestRenderer.ReactTestRenderer, label: string) =>
  tree.root.findAll((n: ReactTestInstance) => n.props.accessibilityRole === 'tab' && n.props.accessibilityLabel === label)[0]!;

let tree: TestRenderer.ReactTestRenderer;

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.spyOn(RN, 'useColorScheme').mockReturnValue('light');
  jest.spyOn(RN.Appearance, 'setColorScheme').mockImplementation(() => {});
  await act(async () => {
    tree = TestRenderer.create(
      <ThemeProvider>
        <Watch />
        <SettingsScreen />
      </ThemeProvider>,
    );
  });
  await act(async () => {}); // the settings load
});
afterEach(async () => {
  await act(async () => {
    tree.unmount();
  });
  jest.restoreAllMocks();
});

describe('Appearance, in Settings', () => {
  it('is there, with System, Light and Dark, and says what System means', () => {
    const t = all(tree);
    expect(t).toContain('Appearance');
    expect(t).toContain("System follows your phone's light or dark setting.");
    for (const label of ['System', 'Light', 'Dark']) expect(tab(tree, label)).toBeDefined();
  });

  it('sits under the profile, above the daily call', () => {
    const t = all(tree);
    expect(t.indexOf('Your profile')).toBeLessThan(t.indexOf('Appearance'));
    expect(t.indexOf('Appearance')).toBeLessThan(t.indexOf('Daily call'));
  });

  it('starts on System, and a tap on Dark makes the whole app dark at once, and keeps it', async () => {
    expect(tab(tree, 'System').props.accessibilityState.selected).toBe(true);
    expect(bg).toBe(lightPalette.bg);
    await act(async () => {
      tab(tree, 'Dark').props.onPress();
    });
    expect(bg).toBe(darkPalette.bg);
    expect(tab(tree, 'Dark').props.accessibilityState.selected).toBe(true);
    expect(tab(tree, 'System').props.accessibilityState.selected).toBe(false);
    expect(await AsyncStorage.getItem('ntz.theme.v1')).toBe('dark');
  });

  it('takes it back to Light, and back to System', async () => {
    await act(async () => {
      tab(tree, 'Dark').props.onPress();
    });
    await act(async () => {
      tab(tree, 'Light').props.onPress();
    });
    expect(bg).toBe(lightPalette.bg);
    expect(await AsyncStorage.getItem('ntz.theme.v1')).toBe('light');
    await act(async () => {
      tab(tree, 'System').props.onPress();
    });
    expect(tab(tree, 'System').props.accessibilityState.selected).toBe(true);
    expect(await AsyncStorage.getItem('ntz.theme.v1')).toBeNull();
  });
});

describe('Appearance, when the settings cannot be loaded', () => {
  it('is still there and still works, beside the error and the way to switch profile: it is about this phone, not the server', async () => {
    await act(async () => {
      tree.unmount();
    });
    (api.getSettings as jest.Mock).mockRejectedValueOnce(new Error('Could not reach the server'));
    await act(async () => {
      tree = TestRenderer.create(
        <ThemeProvider>
          <Watch />
          <SettingsScreen />
        </ThemeProvider>,
      );
    });
    await act(async () => {});
    const t = all(tree);
    expect(t).toContain('Could not reach the server');
    expect(t).toContain('Log out');
    expect(t).toContain('Tester'.slice(0, 0) + 'Asha Rao');
    expect(t).toContain('Appearance');
    expect(t).not.toContain('Daily call');
    await act(async () => {
      tab(tree, 'Dark').props.onPress();
    });
    expect(bg).toBe(darkPalette.bg);
    expect(await AsyncStorage.getItem('ntz.theme.v1')).toBe('dark');
  });
});
