import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TestRenderer, { act } from 'react-test-renderer';
import { api } from '@/api/client';
import type { ProfileResponse } from '@/api/types';
import { useHealthCard } from '@/hooks/useHealthCard';
import { HealthProvider, useHealth } from '@/state/HealthContext';
import { useProfile } from '@/state/ProfileContext';

jest.mock('@/api/client', () => ({ api: { getHealthProfile: jest.fn() }, ApiError: class extends Error {} }));
jest.mock('@/state/ProfileContext', () => ({ useProfile: jest.fn() }));

const generic: ProfileResponse = { profile: { mode: 'generic' }, targetSet: null };
const personal: ProfileResponse = { profile: { mode: 'personalised', birthYear: 1990, heightCm: 170, weightKg: 65 }, targetSet: null };
let health: ReturnType<typeof useHealth>;
let card: ReturnType<typeof useHealthCard>;
function Probe() {
  health = useHealth();
  card = useHealthCard();
  return null;
}
let tree: TestRenderer.ReactTestRenderer;
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  (useProfile as jest.Mock).mockReturnValue({ profile: { id: 'u1' }, secret: 'secret', ready: true });
});
afterEach(async () => { await act(async () => { tree?.unmount(); }); });
async function render() {
  await act(async () => { tree = TestRenderer.create(<HealthProvider><Probe /></HealthProvider>); });
}

it('offers setup only after confirming that no health profile exists', async () => {
  (api.getHealthProfile as jest.Mock).mockResolvedValue(generic);
  await render();
  expect(card.visible).toBe(true);
  await act(async () => { health.apply(personal); });
  expect(card.visible).toBe(false);
  expect(health.profile?.birthYear).toBe(1990);
  await act(async () => { health.apply({ profile: { mode: 'reference_only' }, targetSet: null }); });
  expect(card.visible).toBe(false);
});

it('keeps a successful save when an older fetch finishes afterward', async () => {
  let resolve!: (r: ProfileResponse) => void;
  (api.getHealthProfile as jest.Mock).mockReturnValue(new Promise<ProfileResponse>(r => { resolve = r; }));
  await render();
  expect(card.visible).toBe(false);
  await act(async () => { health.apply(personal); });
  await act(async () => { resolve(generic); });
  expect(health.mode).toBe('personalised');
  expect(health.profile?.weightKg).toBe(65);
  expect(card.visible).toBe(false);
});

it('does not offer setup for a locked profile whose saved details cannot be read', async () => {
  (useProfile as jest.Mock).mockReturnValue({ profile: { id: 'u1' }, secret: null, ready: true });
  await render();
  expect(health.status).toBe('locked');
  expect(card.visible).toBe(false);
  expect(api.getHealthProfile).not.toHaveBeenCalled();
});

it('clears personal details while another account loads and ignores the previous account’s late response or save', async () => {
  (api.getHealthProfile as jest.Mock).mockResolvedValueOnce(personal);
  await render();
  const oldApply = health.apply;
  let finishOld!: (r: ProfileResponse) => void;
  (api.getHealthProfile as jest.Mock).mockReturnValueOnce(new Promise<ProfileResponse>(r => { finishOld = r; }));
  let oldRefresh!: Promise<void>;
  await act(async () => { oldRefresh = health.refresh(); });
  let finishNew!: (r: ProfileResponse) => void;
  (api.getHealthProfile as jest.Mock).mockReturnValueOnce(new Promise<ProfileResponse>(r => { finishNew = r; }));
  (useProfile as jest.Mock).mockReturnValue({ profile: { id: 'u2' }, secret: 'other', ready: true });
  await act(async () => { tree.update(<HealthProvider><Probe /></HealthProvider>); });
  expect(health.status).toBe('loading');
  expect(health.profile).toBeNull();
  expect(health.targetSet).toBeNull();
  await act(async () => { finishOld(personal); await oldRefresh; oldApply(personal); });
  expect(health.profile).toBeNull();
  await act(async () => { finishNew(generic); });
  expect(health.status).toBe('ready');
  expect(health.mode).toBe('generic');
});
