import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHealth } from '@/state/HealthContext';
import { useProfile } from '@/state/ProfileContext';

const key = (id: string) => `ntz.health-card.dismissed.${id}`;

/**
 * Whether to offer "Make your targets personal": for a profile with no health profile yet, until it is dismissed.
 * Dismissal is remembered per profile on this phone (WEEKLY_BREAKDOWN_PLAN.md 3.6).
 */
export function useHealthCard(): { visible: boolean; dismiss: () => void } {
  const { profile } = useProfile();
  const profileId = profile?.id;
  const { mode, status, profile: healthProfile } = useHealth();
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    setDismissed(null);
    if (!profileId) return;
    AsyncStorage.getItem(key(profileId)).then(
      v => { if (active) setDismissed(v === '1'); },
      () => { if (active) setDismissed(false); },
    );
    return () => { active = false; };
  }, [profileId]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    if (profile) AsyncStorage.setItem(key(profile.id), '1').catch(() => {});
  }, [profile]);

  const eligible = !!profile && !healthProfile && mode === 'generic' && status === 'ready';
  return { visible: eligible && dismissed === false, dismiss };
}
