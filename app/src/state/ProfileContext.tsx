import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { setApiUser } from '@/api/client';
import type { Profile } from '@/api/types';
import { loadProfile, saveProfile } from './profileStore';

interface ProfileState {
  ready: boolean;
  profile: Profile | null;
  selectProfile: (p: Profile | null) => Promise<void>;
}

const Ctx = createContext<ProfileState | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    loadProfile().then((p) => {
      setApiUser(p?.id ?? null);
      setProfile(p);
      setReady(true);
    });
  }, []);

  const selectProfile = useCallback(async (p: Profile | null) => {
    await saveProfile(p);
    setApiUser(p?.id ?? null);
    setProfile(p);
  }, []);

  const value = useMemo(() => ({ ready, profile, selectProfile }), [ready, profile, selectProfile]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProfile(): ProfileState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useProfile outside ProfileProvider');
  return v;
}
