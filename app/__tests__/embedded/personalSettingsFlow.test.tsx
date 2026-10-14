import React, { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { createEmbedded, type EmbeddedBackend } from '@/embedded/runtime';
import { nodeSqliteDriver } from '../../testing/nodeSqlite';

let mockBackend: EmbeddedBackend;
let driver: ReturnType<typeof nodeSqliteDriver>;
jest.mock('@/config/local', () => ({ ON_DEVICE: true, API_BASE_URL: 'http://unused', APP_TOKEN: 'tok' }));
jest.mock('@/embedded/runtime', () => ({ ...jest.requireActual('@/embedded/runtime'), getEmbedded: () => mockBackend }));
jest.mock('@react-navigation/native', () => {
  const react = jest.requireActual('react');
  const nav = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true, dispatch: jest.fn() };
  return {
    useNavigation: () => nav, useRoute: () => ({ params: {} }), useIsFocused: () => true,
    useFocusEffect: (effect: () => void) => react.useEffect(effect, [effect]),
    CommonActions: { reset: (state: object) => ({ type: 'RESET', payload: state }) }, __nav: nav,
  };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

import { api, setApiSecret, setApiUser } from '@/api/client';
import LoginScreen from '@/screens/LoginScreen';
import TargetsScreen from '@/screens/TargetsScreen';
import AboutYouScreen from '@/screens/profile/AboutYouScreen';
import HealthIntroScreen from '@/screens/profile/HealthIntroScreen';
import ReviewScreen from '@/screens/profile/ReviewScreen';
import { HealthProvider, useHealth } from '@/state/HealthContext';
import { HealthDraftProvider, useHealthDraft } from '@/state/HealthDraft';
import { MetaProvider } from '@/state/MetaContext';
import { ProfileProvider, useProfile } from '@/state/ProfileContext';
import { ThemeProvider } from '@/theme';

type Screen = 'login' | 'intro' | 'about' | 'review' | 'targets' | null;
let show: (screen: Screen) => void;
let account: ReturnType<typeof useProfile>;
let health: ReturnType<typeof useHealth>;
let draft: ReturnType<typeof useHealthDraft>;
let tree: TestRenderer.ReactTestRenderer;
const nav = jest.requireMock('@react-navigation/native').__nav;
function Outlet() {
  const [screen, setScreen] = useState<Screen>('login');
  show = setScreen;
  account = useProfile();
  health = useHealth();
  draft = useHealthDraft();
  return screen === 'login' ? <LoginScreen /> : screen === 'intro' ? <HealthIntroScreen /> : screen === 'about' ? <AboutYouScreen /> : screen === 'review' ? <ReviewScreen /> : screen === 'targets' ? <TargetsScreen /> : null;
}
async function mount() {
  await act(async () => {
    tree = TestRenderer.create(
      <ThemeProvider><ProfileProvider><MetaProvider><HealthProvider><HealthDraftProvider><Outlet /></HealthDraftProvider></HealthProvider></MetaProvider></ProfileProvider></ThemeProvider>,
    );
  });
  await settle();
}
async function settle() {
  for (let i = 0; i < 50 && health.status === 'loading'; ++i) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  }
}
async function open(screen: Screen) { await act(async () => { show(null); }); await act(async () => { show(screen); }); }
const allText = () => tree.root.findAll(n => (n.type as unknown) === 'Text').map(n => [n.props.children].flat(Infinity).filter(c => typeof c === 'string' || typeof c === 'number').join('')).join('\n');
const input = (id: string) => tree.root.findAll(n => (n.type as unknown) === 'TextInput' && n.props.testID === id)[0]!;
async function type(id: string, text: string) { await act(async () => { input(id).props.onChangeText(text); }); }
async function press(id: string) {
  const button = tree.root.findAll((n: ReactTestInstance) => n.props.testID === id && typeof n.props.onPress === 'function')[0]!;
  await act(async () => { await button.props.onPress(); });
}
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  setApiUser(null);
  setApiSecret(null);
  driver = nodeSqliteDriver();
  mockBackend = createEmbedded(driver, 'tok');
});
afterEach(async () => { await act(async () => { tree?.unmount(); }); jest.restoreAllMocks(); });

it('opens an unconfigured account after one login, saves it, then directly opens and edits the configured profile and targets after restart', async () => {
  await api.register('Settings flow user', 'a long password');
  const login = jest.spyOn(api, 'login');
  await mount();
  await type('login-username', 'Settings flow user');
  await type('login-password', 'a long password');
  await press('login-submit');
  await settle();
  expect(account.profile?.name).toBe('Settings flow user');
  expect(health.status).toBe('ready');

  await open('intro');
  expect(allText()).not.toContain('Log in again');
  expect(draft.draft.birthYear).toBe('');
  await press('intro-consent');
  await press('intro-continue');
  expect(nav.navigate).toHaveBeenLastCalledWith('SafetyCheck');
  await act(async () => { draft.update({ none: true, sex: 'female', activity: 'inactive', goal: 'maintain', pace: 'gentle', pattern: 'vegan', birthMonth: 3, medicine: true }); });
  await open('about');
  await type('about-birth-year', '1990');
  await type('about-height-cm', '180');
  await type('about-weight-kg', '89');
  await open('review');
  await press('review-save');
  expect(health.profile?.weightKg).toBe(89);
  await open('targets');
  expect(allText()).not.toContain('Log in again');
  expect((await api.getTargets()).targets.find(t => t.nutrient === 'protein')?.value).toBe(89);
  expect(login).toHaveBeenCalledTimes(1);

  // Recreate both backend and providers: only SQLite and secure storage carry the answers across this boundary.
  await act(async () => { tree.unmount(); });
  setApiUser(null);
  setApiSecret(null);
  mockBackend = createEmbedded(driver, 'tok');
  await mount();
  expect(health.status).toBe('ready');
  await open('intro');
  expect(allText()).toContain('Edit personal details');
  expect(allText()).not.toContain('Log in again');
  expect(draft.draft).toMatchObject({ birthYear: '1990', birthMonth: 3, activity: 'inactive', goal: 'maintain', pace: 'gentle', pattern: 'vegan', medicine: true });
  await open('about');
  expect(input('about-birth-year').props.value).toBe('1990');
  expect(input('about-height-cm').props.value).toBe('180');
  expect(input('about-weight-kg').props.value).toBe('89');
  await type('about-birth-year', '1991');
  await type('about-height-cm', '181');
  await type('about-weight-kg', '91');
  await open('review');
  await press('review-save');
  await open('intro');
  await open('about');
  expect(input('about-birth-year').props.value).toBe('1991');
  expect(input('about-height-cm').props.value).toBe('181');
  expect(input('about-weight-kg').props.value).toBe('91');
  expect((await api.getDay(new Date().toISOString().slice(0, 10))).goals.protein).toBe(91);
  await open('targets');
  expect(allText()).not.toContain('Log in again');
  expect(login).toHaveBeenCalledTimes(1);
  login.mockRestore();
});
