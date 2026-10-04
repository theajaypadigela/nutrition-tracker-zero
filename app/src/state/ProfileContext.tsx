import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { setApiUser } from '@/api/client';
import type { Profile } from '@/api/types';
import { loadProfile, saveProfile } from './profileStore';

interface ProfileState {
  ready: boolean;
  profile: Profile | null;
  /** True right after creating a profile, until onboarding is finished. */
  onboarding: boolean;
  selectProfile: (p: Profile | null, opts?: { isNew?: boolean }) => Promise<void>;
  finishOnboarding: () => void;
}

const Ctx = createContext<ProfileState | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [onboarding, setOnboarding] = useState(false);

  useEffect(() => {
    loadProfile().then((p) => {
      setApiUser(p?.id ?? null);
      setProfile(p);
      setReady(true);
    });
  }, []);

  const selectProfile = useCallback(async (p: Profile | null, opts: { isNew?: boolean } = {}) => {
    await saveProfile(p);
    setApiUser(p?.id ?? null);
    setOnboarding(!!p && !!opts.isNew);
    setProfile(p);
  }, []);

  const finishOnboarding = useCallback(() => setOnboarding(false), []);

  const value = useMemo(
    () => ({ ready, profile, onboarding, selectProfile, finishOnboarding }),
    [ready, profile, onboarding, selectProfile, finishOnboarding],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProfile(): ProfileState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useProfile outside ProfileProvider');
  return v;
}
