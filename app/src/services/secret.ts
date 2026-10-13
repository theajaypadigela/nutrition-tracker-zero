import * as Keychain from 'react-native-keychain';

/**
 * The profile's secret, in the phone's secure storage: the iOS Keychain or the Android Keystore, never in
 * AsyncStorage (WEEKLY_BREAKDOWN_PLAN.md 8.3.2). One entry per profile, so switching profiles on a shared
 * phone keeps each person's secret apart. The iOS Keychain can survive an uninstall, so a fresh install may
 * find an old secret: callers verify it with the server and offer to start over if it no longer matches.
 */
const service = (userId: string) => `ntz.profile-secret.${userId}`;

/** The stored secret for a profile, or null. A storage error reads as "none": the person can enter the recovery code. */
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

/** A secret as the Worker makes it: 43 URL-safe base64 characters. */
export const SECRET_RE = /^[A-Za-z0-9_-]{43}$/;

/** "abcd efgh …": the recovery code in blocks, easier to read and to copy by hand. */
export const groupSecret = (secret: string): string => secret.match(/.{1,6}/g)?.join(' ') ?? secret;

/** Accepts a recovery code typed or pasted with spaces and line breaks. */
export const normaliseSecret = (typed: string): string => typed.replace(/\s+/g, '');
