import type { Settings } from '@/api/types';
import { reconcile } from './reconcile';
import { saveCachedSchedule } from './scheduleStore';

/** Caches the server's call schedule for offline arming and re-arms the daily ring. */
export async function applySchedule(settings: Pick<Settings, 'callTime' | 'callEnabled' | 'timezone'>): Promise<void> {
  await saveCachedSchedule({ callTime: settings.callTime, callEnabled: settings.callEnabled, timezone: settings.timezone });
  await reconcile('save', { signedIn: true });
}
