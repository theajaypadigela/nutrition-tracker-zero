import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '@/api/client';
import type { CheckIn, HealthProfile, Mode, ProfileResponse, TargetSetInfo } from '@/api/types';
import { useProfile } from './ProfileContext';

/**
 * The person's health profile and the target set in force (WEEKLY_BREAKDOWN_PLAN.md 9.4). It lives only while a
 * profile is chosen: switching profiles clears it, so one person's health context never lingers for the next on
 * a shared phone (6.8). Without a secret on this phone it is `locked`, which behaves as generic mode.
 */
export type HealthStatus = 'idle' | 'loading' | 'ready' | 'locked' | 'mismatch' | 'error';

interface HealthState {
  status: HealthStatus;
  mode: Mode;
  profile: HealthProfile | null;
  targetSet: TargetSetInfo | null;
  checkIn: CheckIn | null;
  /** Low-pressure mode: no calorie, weight, percentage or score numbers anywhere (plan 8.2). */
  numbersHidden: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Take the result of a save, so every screen sees it at once. */
  apply: (r: ProfileResponse) => void;
}

const GENERIC: Pick<HealthState, 'mode' | 'profile' | 'targetSet' | 'checkIn' | 'numbersHidden'> = {
  mode: 'generic',
  profile: null,
  targetSet: null,
  checkIn: null,
  numbersHidden: false,
};

const Ctx = createContext<HealthState | null>(null);

export function HealthProvider({ children }: { children: React.ReactNode }) {
  const { profile: who, secret, ready } = useProfile();
  const [state, setState] = useState<Omit<HealthState, 'refresh' | 'apply'>>({
    status: 'idle',
    ...GENERIC,
    error: null,
  });
  const run = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++run.current;
    if (!who) {
      setState({ status: 'idle', ...GENERIC, error: null });
      return;
    }
    if (!secret) {
      // No secret on this phone: health features stay off, and the app behaves as before (generic references).
      setState({ status: 'locked', ...GENERIC, error: null });
      return;
    }
    setState(s => ({
      ...s,
      status: s.status === 'ready' ? 'ready' : 'loading',
    }));
    try {
      const r = await api.getHealthProfile();
      if (id !== run.current) return;
      setState({
        status: 'ready',
        mode: r.profile.mode,
        profile: r.profile.mode === 'generic' ? null : r.profile,
        targetSet: r.targetSet,
        checkIn: r.checkIn ?? null,
        numbersHidden: r.profile.numbersHidden === true,
        error: null,
      });
    } catch (e) {
      if (id !== run.current) return;
      if (e instanceof ApiError && (e.code === 'profile_secret_invalid' || e.code === 'profile_secret_required')) {
        // The secret on this phone is not this profile's (a stale Keychain entry after a reinstall, say).
        setState({ status: 'mismatch', ...GENERIC, error: null });
      } else {
        setState(s => ({
          ...s,
          status: 'error',
          error: e instanceof Error ? e.message : String(e),
        }));
      }
    }
  }, [who, secret]);

  useEffect(() => {
    if (ready) refresh();
  }, [ready, refresh]);

  const apply = useCallback((r: ProfileResponse) => {
    setState({
      status: 'ready',
      mode: r.profile.mode,
      profile: r.profile.mode === 'generic' ? null : r.profile,
      targetSet: r.targetSet,
      checkIn: r.checkIn ?? null,
      numbersHidden: r.profile.numbersHidden === true,
      error: null,
    });
  }, []);

  const value = useMemo(() => ({ ...state, refresh, apply }), [state, refresh, apply]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHealth(): HealthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useHealth outside HealthProvider');
  return v;
}
