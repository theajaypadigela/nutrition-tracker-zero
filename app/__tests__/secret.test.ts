import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import {
  clearProfileSecret,
  loadProfileSecret,
  saveProfileSecret,
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

  it('reads a storage failure as "no secret", so the person can log in again', async () => {
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
