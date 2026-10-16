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
  /** Changes when saved settings or targets are loaded/applied, so dependent views reload their API data. */
  revision: number;
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
  const whoId = who?.id;
  const accountKey = whoId ? `${whoId}:${secret ?? ''}` : null;
  const currentAccount = useRef(accountKey);
  currentAccount.current = accountKey;
  const [state, setState] = useState<Omit<HealthState, 'refresh' | 'apply'> & { accountKey: string | null }>({
    accountKey: null,
    revision: 0,
    status: 'idle',
    ...GENERIC,
    error: null,
  });
  const run = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++run.current;
    if (!whoId) {
      setState(s => ({ accountKey, revision: s.revision, status: 'idle', ...GENERIC, error: null }));
      return;
    }
    if (!secret) {
      // No secret on this phone: health features stay off, and the app behaves as before (generic references).
      setState(s => ({ accountKey, revision: s.revision, status: 'locked', ...GENERIC, error: null }));
      return;
    }
    setState(s => ({
      ...(s.accountKey === accountKey ? s : { ...GENERIC, error: null, revision: s.revision }),
      accountKey,
      status: s.accountKey === accountKey && s.status === 'ready' ? 'ready' : 'loading',
    }));
    try {
      const r = await api.getHealthProfile();
      if (id !== run.current) return;
      setState(s => ({
        accountKey,
        revision: s.revision + 1,
        status: 'ready',
        mode: r.profile.mode,
        profile: r.profile.mode === 'generic' ? null : r.profile,
        targetSet: r.targetSet,
        checkIn: r.checkIn ?? null,
        numbersHidden: r.profile.numbersHidden === true,
        error: null,
      }));
    } catch (e) {
      if (id !== run.current) return;
      if (e instanceof ApiError && (e.code === 'profile_secret_invalid' || e.code === 'profile_secret_required')) {
        // The secret on this phone is not this profile's (a stale Keychain entry after a reinstall, say).
        setState(s => ({ accountKey, revision: s.revision + 1, status: 'mismatch', ...GENERIC, error: null }));
      } else {
        // Capture the message before React runs the updater; Hermes may release the catch binding first.
        const message = e instanceof Error ? e.message : String(e);
        setState(s => ({
          ...s,
          status: 'error',
          error: message,
        }));
      }
    }
  }, [whoId, secret, accountKey]);

  useEffect(() => {
    const pending = run;
    if (ready) refresh();
    return () => { ++pending.current; };
  }, [ready, refresh]);

  const apply = useCallback((r: ProfileResponse) => {
    // Ignore a save that belonged to an account we have since left.
    if (accountKey !== currentAccount.current) return;
    // A fetch started before this save must not replace the newly saved answers.
    ++run.current;
    setState(s => ({
      accountKey,
      revision: s.revision + 1,
      status: 'ready',
      mode: r.profile.mode,
      profile: r.profile.mode === 'generic' ? null : r.profile,
      targetSet: r.targetSet,
      checkIn: r.checkIn ?? null,
      numbersHidden: r.profile.numbersHidden === true,
      error: null,
    }));
  }, [accountKey]);

  const value = useMemo(() => {
    const { accountKey: loadedAccount, ...snapshot } = state;
    return {
      ...(loadedAccount === accountKey ? snapshot : {
        ...GENERIC, revision: state.revision, error: null,
        status: (!whoId ? 'idle' : secret ? 'loading' : 'locked') as HealthStatus,
      }),
      refresh,
      apply,
    };
  }, [state, accountKey, whoId, secret, refresh, apply]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHealth(): HealthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useHealth outside HealthProvider');
  return v;
}
