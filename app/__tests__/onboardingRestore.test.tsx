import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TestRenderer, { act } from 'react-test-renderer';
import { ProfileProvider, useProfile } from '@/state/ProfileContext';

jest.mock('@/services/secret', () => ({ loadProfileSecret: jest.fn(async () => 's'.repeat(43)), saveProfileSecret: jest.fn(async () => {}) }));
jest.mock('@/api/client', () => ({ setApiUser: jest.fn(), setApiSecret: jest.fn(), isAccountCredential: () => true, ApiError: class extends Error {} }));
let profile: ReturnType<typeof useProfile>;
let tree: TestRenderer.ReactTestRenderer;
function Probe() { profile = useProfile(); return null; }
async function mount() { await act(async () => { tree = TestRenderer.create(<ProfileProvider><Probe /></ProfileProvider>); }); }
beforeEach(async () => { await AsyncStorage.clear(); });
afterEach(async () => { await act(async () => tree.unmount()); });

it('resumes unfinished onboarding after a cold launch, then remembers completion', async () => {
  await mount();
  await act(async () => { await profile.selectProfile({ id: 'new', name: 'Test' }, { isNew: true, secret: 's'.repeat(43) }); });
  expect(profile.onboarding).toBe(true);
  await act(async () => tree.unmount());
  await mount();
  expect(profile.onboarding).toBe(true);
  expect(profile.healthIntroPending).toBe(true);
  await act(async () => { await profile.finishOnboarding(); });
  await act(async () => tree.unmount());
  await mount();
  expect(profile.onboarding).toBe(false);
});
it('keeps onboarding separate for each account and resumes it on login', async () => {
  await mount();
  await act(async () => { await profile.selectProfile({ id: 'new', name: 'New' }, { isNew: true, secret: 's'.repeat(43) }); });
  await act(async () => { await profile.selectProfile(null); });
  await act(async () => { await profile.selectProfile({ id: 'old', name: 'Old' }, { secret: 's'.repeat(43) }); });
  expect(profile.onboarding).toBe(false);
  await act(async () => { await profile.selectProfile({ id: 'new', name: 'New' }, { secret: 's'.repeat(43) }); });
  expect(profile.onboarding).toBe(true);
});
