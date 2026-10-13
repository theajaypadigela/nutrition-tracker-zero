import { useEffect, useSyncExternalStore } from 'react';
import { api } from '@/api/client';
import { getProfileZone, subscribeProfileZone } from '@/api/zone';
import { deviceTimeZone } from '@/components/TimezoneField';
import { useProfile } from '@/state/ProfileContext';
import { localDateIn } from '@/utils/dates';

/**
 * The time zone "today" is measured in: the profile's own (the one the daily call uses), the phone's
 * only until the profile's has loaded. Every screen uses this, so none disagrees about the day.
 */
export function useProfileTimeZone(): string {
  const { profile } = useProfile();
  const known = useSyncExternalStore(subscribeProfileZone, getProfileZone);
  useEffect(() => {
    if (profile && known?.userId !== profile.id) api.getSettings().catch(() => {});
  }, [profile, known?.userId]);
  return known && known.userId === profile?.id ? known.zone : deviceTimeZone();
}

/** Today's date, 'YYYY-MM-DD', in the profile's time zone. */
export function useToday(): string {
  return localDateIn(useProfileTimeZone());
}
