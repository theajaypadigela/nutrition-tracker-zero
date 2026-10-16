import { api, ApiError } from '@/api/client';
import type { RangeReport } from '@/api/types';
import { useProfile } from '@/state/ProfileContext';
import { useHealth } from '@/state/HealthContext';
import { useAsync } from './useAsync';

type Result = {
  from: string;
  to: string;
  profileId: string | undefined;
  revision: number;
  report: RangeReport | null;
  locked: boolean;
};

export function useRangeReport(from: string, to: string) {
  const { status, revision, numbersHidden } = useHealth();
  const { profile } = useProfile();
  const profileId = profile?.id;
  const waiting = status === 'idle' || status === 'loading';
  const state = useAsync<Result>(async () => {
    if (waiting) return { from, to, profileId, revision, report: null, locked: false };
    try {
      return {
        from,
        to,
        profileId,
        revision,
        report: await api.getRangeReport(from, to),
        locked: false,
      };
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'profile_secret_required' || e.code === 'profile_secret_invalid')) {
        return { from, to, profileId, revision, report: null, locked: true };
      }
      throw e;
    }
  }, [from, to, status, revision, profileId]);
  // Never put a previous period's figures underneath the newly selected dates.
  const current =
    !waiting &&
    state.data?.profileId === profileId &&
    state.data?.revision === revision &&
    state.data?.from === from &&
    state.data?.to === to
      ? state.data
      : undefined;
  return {
    report: current?.report && !numbersHidden ? current.report : null,
    hidden: numbersHidden || current?.report?.display.numbersHidden === true,
    locked: current?.locked ?? false,
    loading: waiting || state.loading,
    error: state.loading ? null : state.error,
    reload: state.reload,
  };
}
