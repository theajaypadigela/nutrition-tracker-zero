import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import OnboardingScreen from '@/screens/OnboardingScreen';
import { requestCorePermissions } from '@/services/calls/permissions';
import { ThemeProvider } from '@/theme';

jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('@/state/ProfileContext', () => ({ useProfile: () => ({ finishOnboarding: jest.fn() }) }));
jest.mock('@/api/client', () => ({ api: { updateSettings: jest.fn() }, errorMessage: String }));
jest.mock('@/services/calls/permissions', () => ({ requestCorePermissions: jest.fn(), openAlarmPermissionSettings: jest.fn() }));
jest.mock('@/services/calls/native', () => ({ openFullScreenIntentSettings: jest.fn() }));
jest.mock('@/services/calls/schedule', () => ({ applySchedule: jest.fn() }));

let tree: TestRenderer.ReactTestRenderer;
const all = () => tree.root.findAll((n: ReactTestInstance) => (n.type as unknown) === 'Text').map(n => [n.props.children].flat().join('')).join('\n');
afterEach(() => act(() => tree.unmount()));

it.each([
  ['authorized', { notificationsAuthorized: true }, 'Done'],
  ['denied', { notificationsAuthorized: false }, 'Off'],
  ['failed', null, 'Could not check notification permission. Try again.'],
] as const)('reports the actual notification permission when %s', async (_state, permission, expected) => {
  if (permission) (requestCorePermissions as jest.Mock).mockResolvedValueOnce(permission);
  else (requestCorePermissions as jest.Mock).mockRejectedValueOnce(new Error('Unavailable'));
  await act(async () => { tree = TestRenderer.create(<ThemeProvider><OnboardingScreen /></ThemeProvider>); });
  const button = tree.root.findAll(n => n.props.title === 'Allow notifications' && typeof n.props.onPress === 'function')[0]!;
  await act(async () => button.props.onPress());
  expect(all()).toContain(expected);
  if (!permission?.notificationsAuthorized) expect(all()).not.toContain('Done');
});
