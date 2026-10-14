import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import TestRenderer, { act } from 'react-test-renderer';
import { createEmbedded, type EmbeddedBackend } from '@/embedded/runtime';
import { nodeSqliteDriver } from '../../testing/nodeSqlite';

let mockBackend: EmbeddedBackend;
const driver = nodeSqliteDriver();
jest.mock('@/config/local', () => ({ ON_DEVICE: true, API_BASE_URL: 'http://unused', APP_TOKEN: 'tok' }));
jest.mock('@/embedded/runtime', () => ({ ...jest.requireActual('@/embedded/runtime'), getEmbedded: () => mockBackend }));

import { api, setApiSecret, setApiUser } from '@/api/client';
import { CONSENT_VERSION } from '@/i18n/strings';
import { HealthProvider, useHealth } from '@/state/HealthContext';
import { draftFromProfile } from '@/state/HealthDraft';
import { ProfileProvider, useProfile } from '@/state/ProfileContext';
import { clearProfileSecret } from '@/services/secret';

const INPUT = {
  birthYear: 1990, birthMonth: 3, sexForCalc: 'female' as const, heightCm: 180, weightKg: 89,
  activity: 'inactive' as const, goal: 'maintain' as const, pace: 'gentle' as const,
  pattern: 'vegan' as const, referenceSet: 'nasem' as const, numbersHidden: false,
};
const SAFETY = { pregnantOrBreastfeeding: false, eatingDisorder: false, clinicianDiet: false, dietInteractingMedicine: true };
let profile: ReturnType<typeof useProfile>;
let health: ReturnType<typeof useHealth>;
let tree: TestRenderer.ReactTestRenderer;
function Probe() {
  profile = useProfile();
  health = useHealth();
  return null;
}
async function mount() {
  await act(async () => {
    tree = TestRenderer.create(<ProfileProvider><HealthProvider><Probe /></HealthProvider></ProfileProvider>);
  });
}
async function settle() {
  for (let i = 0; i < 50 && (health.status === 'loading' || health.status === 'idle'); ++i) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  }
}
afterEach(async () => { await act(async () => { tree?.unmount(); }); });

it('persists the saved profile and 89g protein target through restart and password login without a recovery step', async () => {
  await AsyncStorage.clear();
  setApiUser(null);
  setApiSecret(null);
  mockBackend = createEmbedded(driver, 'tok');
  await mount();
  const account = await api.register('Personal targets account', 'a long password');
  await act(async () => { await profile.selectProfile(account.profile, { secret: account.secret, isNew: true }); });
  await settle();
  expect(health.status).toBe('ready');
  expect((await api.getGoals()).goals.find(g => g.key === 'protein')?.target).toBe(50);

  const saved = await api.saveHealthProfile({ profile: INPUT, safety: SAFETY, consentVersion: CONSENT_VERSION });
  await act(async () => { health.apply(saved); });
  expect(health.profile).toMatchObject({ ...INPUT, dietInteractingMedicine: true });
  expect(health.targetSet?.targets?.find(t => t.nutrient === 'protein')?.value).toBe(89);

  // A fresh app reads SQLite and the Keychain rather than the now-discarded onboarding draft.
  await act(async () => { tree.unmount(); });
  setApiUser(null);
  setApiSecret(null);
  mockBackend = createEmbedded(driver, 'tok');
  await mount();
  await settle();
  expect(health.status).toBe('ready');
  expect(health.profile).toMatchObject(INPUT);
  expect(draftFromProfile(health.profile!)).toMatchObject({ birthYear: '1990', birthMonth: 3, height: { cm: '180' }, weight: { kg: '89' }, activity: 'inactive', goal: 'maintain', pace: 'gentle', pattern: 'vegan', medicine: true });

  await act(async () => { await profile.selectProfile(null); });
  await clearProfileSecret(account.profile.id);
  const loggedIn = await api.login(account.profile.name, 'a long password');
  await act(async () => { await profile.selectProfile(loggedIn.profile, { secret: loggedIn.secret }); });
  await settle();
  expect(health.profile).toMatchObject(INPUT);
  expect(profile.onboarding).toBe(false);
  expect(profile).not.toHaveProperty('recoveryCode');

  const date = new Date().toISOString().slice(0, 10);
  expect((await api.getGoals()).goals.find(g => g.key === 'protein')).toMatchObject({ target: 89, recommended: 89, origin: 'recommended' });
  expect((await api.getDay(date)).goals.protein).toBe(89);
  expect((await api.getDays(date, date)).goals.protein).toBe(89);
  expect((await api.getTargets()).targets.find(t => t.nutrient === 'protein')?.value).toBe(89);
  const report = await api.getWeeklyReport(date);
  expect(report.mode).toBe('personalised');
  // An explicit override still wins, and resetting it restores the saved recommendation.
  await api.updateGoals({ protein: 95 });
  expect((await api.getDay(date)).goals.protein).toBe(95);
  await api.updateGoals({ protein: null });
  expect((await api.getDay(date)).goals.protein).toBe(89);
});

it('reports secure-storage failures without persisting an account that cannot be reopened', async () => {
  await AsyncStorage.clear();
  setApiUser(null);
  setApiSecret(null);
  mockBackend = createEmbedded(driver, 'tok');
  await mount();
  const loggedIn = await api.register('Storage failure account', 'a long password');
  (Keychain.setGenericPassword as jest.Mock).mockResolvedValueOnce(false);
  await act(async () => {
    await expect(profile.selectProfile(loggedIn.profile, { secret: loggedIn.secret })).rejects.toThrow(/secure storage/);
  });
  expect(profile.profile).toBeNull();
  expect(await AsyncStorage.getItem('ntz.profile.v1')).toBeNull();
  await act(async () => { await profile.selectProfile(loggedIn.profile, { secret: loggedIn.secret }); });
  await settle();
  expect(health.status).toBe('ready');
  expect(health.mode).toBe('generic');
});

it('does not fall back to a stale credential when authentication explicitly supplies no credential', async () => {
  await AsyncStorage.clear();
  setApiUser(null);
  setApiSecret(null);
  mockBackend = createEmbedded(driver, 'tok');
  await mount();
  const account = await api.register('Incomplete login account', 'a long password');
  await act(async () => { await profile.selectProfile(account.profile, { secret: account.secret }); });
  await settle();
  await act(async () => {
    await expect(profile.selectProfile(account.profile, { secret: undefined })).rejects.toMatchObject({ code: 'auth_upgrade_required' });
  });
  expect(profile.secret).toBe(account.secret);
  expect(health.status).toBe('ready');
});
