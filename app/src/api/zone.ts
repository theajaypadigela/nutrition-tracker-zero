/**
 * The profile's own time zone, remembered whenever the settings are read or saved, so every screen
 * agrees on which day (and which week) it is. The Today screen always used the profile's zone while
 * the report screens used the phone's, so on a phone set to another zone they could disagree
 * (WEEKLY_BREAKDOWN_PLAN.md P16). Kept apart from the client so the client can feed it without a cycle.
 */
export interface ProfileZone {
  userId: string;
  zone: string;
}

let current: ProfileZone | null = null;
const subscribers = new Set<() => void>();

export const getProfileZone = (): ProfileZone | null => current;

export function rememberProfileZone(userId: string, zone: string): void {
  if (current?.userId === userId && current.zone === zone) return;
  current = { userId, zone };
  subscribers.forEach(notify => notify());
}

export function subscribeProfileZone(notify: () => void): () => void {
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}
