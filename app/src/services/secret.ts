import * as Keychain from 'react-native-keychain';

/**
 * The profile's secret, in the phone's secure storage: the iOS Keychain or the Android Keystore, never in
 * AsyncStorage (WEEKLY_BREAKDOWN_PLAN.md 8.3.2). One entry per profile, so switching profiles on a shared
 * phone keeps each person's secret apart. The iOS Keychain can survive an uninstall, so a fresh install may
 * find an old credential: callers verify it with the server and ask for password login if it no longer matches.
 */
const service = (userId: string) => `ntz.profile-secret.${userId}`;

/** The stored credential for a profile, or null. A storage error requires password login again. */
export async function loadProfileSecret(userId: string): Promise<string | null> {
  try {
    const found = await Keychain.getGenericPassword({
      service: service(userId),
    });
    return found ? found.password : null;
  } catch {
    return null;
  }
}

/** Stores the secret. Throws if secure storage is unavailable: the secret must never fall back to plain storage. */
export async function saveProfileSecret(userId: string, secret: string): Promise<void> {
  const ok = await Keychain.setGenericPassword(userId, secret, {
    service: service(userId),
  });
  if (!ok) throw new Error('Could not save the secret to secure storage on this phone.');
}

export async function clearProfileSecret(userId: string): Promise<void> {
  try {
    await Keychain.resetGenericPassword({ service: service(userId) });
  } catch {
    // Nothing to clear.
  }
}
