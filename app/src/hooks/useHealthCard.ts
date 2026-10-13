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
  const { mode, status } = useHealth();
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!profile) return;
    setDismissed(null);
    AsyncStorage.getItem(key(profile.id)).then(
      v => setDismissed(v === '1'),
      () => setDismissed(false),
    );
  }, [profile]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    if (profile) AsyncStorage.setItem(key(profile.id), '1').catch(() => {});
  }, [profile]);

  const eligible = !!profile && mode === 'generic' && (status === 'ready' || status === 'locked');
  return { visible: eligible && dismissed === false, dismiss };
}
