import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import {
  clearProfileSecret,
  groupSecret,
  loadProfileSecret,
  normaliseSecret,
  saveProfileSecret,
  SECRET_RE,
} from '@/services/secret';

const SECRET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ'; // 43 characters, as the Worker makes it
const store = (Keychain as unknown as { __store: Map<string, unknown> }).__store;

beforeEach(() => {
  store.clear();
  jest.clearAllMocks();
});

describe('the profile secret in secure storage (plan 8.3.2)', () => {
  it('is saved to the Keychain or Keystore under its own service, and read back', async () => {
    await saveProfileSecret('user-1', SECRET);
    expect(Keychain.setGenericPassword).toHaveBeenCalledWith('user-1', SECRET, {
      service: 'ntz.profile-secret.user-1',
    });
    await expect(loadProfileSecret('user-1')).resolves.toBe(SECRET);
  });

  it("keeps each profile's secret apart on a shared phone", async () => {
    await saveProfileSecret('user-1', SECRET);
    await saveProfileSecret('user-2', SECRET.split('').reverse().join(''));
    await expect(loadProfileSecret('user-1')).resolves.toBe(SECRET);
    await expect(loadProfileSecret('user-2')).resolves.not.toBe(SECRET);
    await expect(loadProfileSecret('user-3')).resolves.toBeNull();
    await clearProfileSecret('user-1');
    await expect(loadProfileSecret('user-1')).resolves.toBeNull();
    await expect(loadProfileSecret('user-2')).resolves.not.toBeNull();
  });

  it('never touches plain storage', async () => {
    const spies = [jest.spyOn(AsyncStorage, 'setItem'), jest.spyOn(AsyncStorage, 'multiSet')];
    await saveProfileSecret('user-1', SECRET);
    await loadProfileSecret('user-1');
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });

  it('reads a storage failure as "no secret", so the person can enter the recovery code', async () => {
    (Keychain.getGenericPassword as jest.Mock).mockRejectedValueOnce(new Error('keystore unavailable'));
    await expect(loadProfileSecret('user-1')).resolves.toBeNull();
  });

  it('refuses, loudly, to fall back when secure storage is unavailable', async () => {
    (Keychain.setGenericPassword as jest.Mock).mockResolvedValueOnce(false);
    await expect(saveProfileSecret('user-1', SECRET)).rejects.toThrow(/secure storage/);
    (Keychain.setGenericPassword as jest.Mock).mockRejectedValueOnce(new Error('denied'));
    await expect(saveProfileSecret('user-1', SECRET)).rejects.toThrow();
  });

  it('clearing never throws, even with nothing to clear', async () => {
    (Keychain.resetGenericPassword as jest.Mock).mockRejectedValueOnce(new Error('nothing'));
    await expect(clearProfileSecret('user-1')).resolves.toBeUndefined();
  });
});

describe('the recovery code', () => {
  it('has the shape the Worker makes: 43 URL-safe characters', () => {
    expect(SECRET_RE.test(SECRET)).toBe(true);
    for (const bad of [
      '',
      'short',
      `${SECRET}x`,
      SECRET.slice(1),
      `${SECRET.slice(0, 42)}!`,
      `${SECRET.slice(0, 42)} `,
    ])
      expect(SECRET_RE.test(bad)).toBe(false);
  });

  it('is shown in blocks, and accepted back with spaces and line breaks', () => {
    const shown = groupSecret(SECRET);
    expect(shown.split(' ')).toHaveLength(8);
    expect(shown.replace(/ /g, '')).toBe(SECRET);
    expect(normaliseSecret(` ${shown.replace(/ /g, '\n')}  `)).toBe(SECRET);
    expect(normaliseSecret(shown)).toBe(SECRET);
  });
});
