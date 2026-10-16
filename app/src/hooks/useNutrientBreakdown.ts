import { useMemo } from 'react';
import { api, ApiError } from '@/api/client';
import type { Day, NutrientBreakdown } from '@/api/types';
import { useHealth } from '@/state/HealthContext';
import { useProfile } from '@/state/ProfileContext';
import { breakdownOfDay } from '@/utils/breakdown';
import { useAsync } from './useAsync';

type Result = { from: string; to: string; nutrient: string; profileId: string | undefined; revision: number; breakdown: NutrientBreakdown | null; locked: boolean; day: Day | null };

/**
 * The logged items behind one nutrient's total. One day is built from that day's own items, the very list Today draws its totals from,
 * so the two cannot disagree; a longer span comes from the Worker, which adds it up the way the report does. It waits for the health
 * context to settle (a secret may be needed), reports a missing secret as `locked`, and never puts another day's list under the day
 * that was asked for.
 */
export function useNutrientBreakdown(nutrient: string, from: string, to: string) {
  const { status, revision } = useHealth();
  const { profile } = useProfile();
  const profileId = profile?.id;
  const waiting = status === 'idle' || status === 'loading';
  const state = useAsync<Result>(async () => {
    const base = { from, to, nutrient, profileId, revision };
    if (waiting) return { ...base, breakdown: null, locked: false, day: null };
    try {
      if (from === to) {
        const day = await api.getDay(from);
        return { ...base, breakdown: breakdownOfDay(day, nutrient), locked: false, day };
      }
      return { ...base, breakdown: await api.getNutrientBreakdown(from, to, nutrient), locked: false, day: null };
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'profile_secret_required' || e.code === 'profile_secret_invalid')) {
        return { ...base, breakdown: null, locked: true, day: null };
      }
      throw e;
    }
  }, [nutrient, from, to, status, revision, profileId]);

  const current =
    !waiting &&
    state.data?.profileId === profileId &&
    state.data?.revision === revision &&
    state.data?.nutrient === nutrient &&
    state.data?.from === from &&
    state.data?.to === to
      ? state.data
      : undefined;
  return useMemo(
    () => ({
      breakdown: current?.breakdown ?? null,
      /** The day itself, when the span is one day: its items can be edited in place. */
      day: current?.day ?? null,
      locked: current?.locked ?? false,
      loading: waiting || (state.loading && !current),
      refreshing: state.loading && !!current,
      error: state.loading ? null : state.error,
      reload: state.reload,
    }),
    [current, waiting, state.loading, state.error, state.reload],
  );
}
