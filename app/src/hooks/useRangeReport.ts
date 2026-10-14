import { api, ApiError } from '@/api/client';
import type { RangeReport } from '@/api/types';
import { useHealth } from '@/state/HealthContext';
import { useAsync } from './useAsync';

type Result = { from: string; to: string; report: RangeReport | null; locked: boolean };

export function useRangeReport(from: string, to: string) {
  const { status, revision, numbersHidden } = useHealth();
  const waiting = status === 'idle' || status === 'loading';
  const state = useAsync<Result>(async () => {
    if (waiting) return { from, to, report: null, locked: false };
    try {
      return { from, to, report: await api.getRangeReport(from, to), locked: false };
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'profile_secret_required' || e.code === 'profile_secret_invalid')) {
        return { from, to, report: null, locked: true };
      }
      throw e;
    }
  }, [from, to, status, revision]);
  // Never put a previous period's figures underneath the newly selected dates.
  const current = state.data?.from === from && state.data?.to === to ? state.data : undefined;
  return {
    report: current?.report && !numbersHidden ? current.report : null,
    hidden: numbersHidden || current?.report?.display.numbersHidden === true,
    locked: current?.locked ?? false,
    loading: waiting || state.loading,
    error: state.error,
    reload: state.reload,
  };
}
