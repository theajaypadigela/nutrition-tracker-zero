import { useMemo } from 'react';
import { api, ApiError } from '@/api/client';
import type { WeeklyReport } from '@/api/types';
import { useHealth } from '@/state/HealthContext';
import { useAsync, type AsyncState } from './useAsync';

type Result = { kind: 'report'; report: WeeklyReport } | { kind: 'locked' } | null;

export interface WeeklyReportState {
  /** The report for the week, when there is one. */
  report: WeeklyReport | null;
  /** The profile has personal targets, and this phone does not hold the secret that unlocks them (plan 8.3.2). */
  locked: boolean;
  /** Loading for the first time: nothing to show yet. */
  loading: boolean;
  /** Reloading with a report already on screen. */
  refreshing: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * The weekly view for the week starting at `start`, from the Worker (plan 9.3). It waits for the health context to settle,
 * so the secret is on the request when there is one, and it reports a missing or wrong secret as `locked` instead of an
 * error: that is a state with a way forward (enter the recovery code), not a failure.
 */
export function useWeeklyReport(start: string): WeeklyReportState {
  const { status } = useHealth();
  const waiting = status === 'idle' || status === 'loading';
  const state: AsyncState<Result> = useAsync<Result>(async () => {
    if (waiting) return null;
    try {
      return { kind: 'report', report: await api.getWeeklyReport(start) };
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'profile_secret_required' || e.code === 'profile_secret_invalid')) {
        return { kind: 'locked' };
      }
      throw e;
    }
  }, [start, status]);

  return useMemo(
    () => ({
      report: state.data?.kind === 'report' ? state.data.report : null,
      locked: state.data?.kind === 'locked',
      loading: waiting || (state.loading && !state.data),
      refreshing: state.loading && !!state.data,
      error: state.error,
      reload: state.reload,
    }),
    [state.data, state.loading, state.error, state.reload, waiting],
  );
}
