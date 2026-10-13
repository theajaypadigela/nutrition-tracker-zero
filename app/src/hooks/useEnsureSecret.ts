import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { api, ApiError, setApiSecret } from '@/api/client';
import { useProfile } from '@/state/ProfileContext';

/**
 * Makes sure this phone holds the profile's secret before a health screen needs it (WEEKLY_BREAKDOWN_PLAN.md 8.3.2).
 * A profile made before secrets existed claims one, once, and is shown it as a recovery code; a profile that already
 * has one (a new phone, a reinstall) asks for it. Resolves true when the phone has the secret and the caller can go on.
 */
export function useEnsureSecret() {
  const navigation = useNavigation();
  const { secret, adoptSecret } = useProfile();
  return useCallback(async (): Promise<boolean> => {
    if (secret) return true;
    try {
      const claimed = await api.claimSecret();
      await adoptSecret(claimed.secret, { show: true });
      navigation.navigate('RecoveryCode');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'secret_already_set') navigation.navigate('RecoveryEntry');
      else throw e;
    }
    return false;
  }, [secret, adoptSecret, navigation]);
}

/** Checks a typed recovery code against the server without keeping it unless it is right. */
export async function verifyRecoveryCode(candidate: string, current: string | null): Promise<boolean> {
  setApiSecret(candidate);
  try {
    await api.getHealthProfile();
    return true;
  } catch (e) {
    setApiSecret(current);
    if (e instanceof ApiError && (e.code === 'profile_secret_invalid' || e.code === 'profile_secret_required'))
      return false;
    throw e;
  }
}
