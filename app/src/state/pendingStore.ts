import { useSyncExternalStore } from 'react';
import { api } from '@/api/client';

/**
 * How many foods and unit conversions are waiting for someone to fill them in, across everyone
 * (the Pending tab's badge). A tiny external store so the tab bar and the Pending screen agree.
 */
let total = 0;
const listeners = new Set<() => void>();

export function setPendingTotal(next: number): void {
  if (next === total) return;
  total = next;
  listeners.forEach(l => l());
}

export async function refreshPendingTotal(): Promise<void> {
  try {
    const { totals } = await api.uncached();
    setPendingTotal(totals.unknownFoods + totals.missingUnits);
  } catch {
    // Keep the last known count; the badge is a hint, not a promise.
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function usePendingTotal(): number {
  return useSyncExternalStore(subscribe, () => total, () => total);
}
