import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ACCOUNT_ACCESS_UPDATE_REQUIRED, ApiError, isAccountCredential, setApiSecret, setApiUser } from '@/api/client';
import type { Profile } from '@/api/types';
import { loadProfileSecret, saveProfileSecret } from '@/services/secret';
import { loadOnboardingPending, loadProfile, saveOnboardingPending, saveProfile } from './profileStore';

interface ProfileState {
  ready: boolean;
  profile: Profile | null;
  /** True right after creating a profile, until onboarding is finished. */
  onboarding: boolean;
  /** The account credential stored automatically after registration or password login. */
  secret: string | null;
  /** A new profile has just finished setting up its call: offer to make the targets personal, once. */
  healthIntroPending: boolean;
  selectProfile: (p: Profile | null, opts?: { isNew?: boolean; secret?: string }) => Promise<void>;
  finishOnboarding: () => Promise<void>;
  consumeHealthIntro: () => void;
}

const Ctx = createContext<ProfileState | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [healthIntroPending, setHealthIntroPending] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const p = await loadProfile();
      const stored = p ? await loadProfileSecret(p.id) : null;
      const pending = p ? await loadOnboardingPending(p.id) : false;
      if (!active) return;
      setApiUser(p?.id ?? null);
      setApiSecret(stored);
      setSecret(stored);
      setProfile(p);
      setOnboarding(pending);
      setHealthIntroPending(pending);
      setReady(true);
    })();
    return () => { active = false; };
  }, []);

  const selectProfile = useCallback(async (p: Profile | null, opts: { isNew?: boolean; secret?: string } = {}) => {
    // Explicit authentication must carry a valid credential. Only session restoration may load one from secure storage.
    if (p && 'secret' in opts && !isAccountCredential(opts.secret)) {
      throw new ApiError(503, 'auth_upgrade_required', ACCOUNT_ACCESS_UPDATE_REQUIRED);
    }
    let next: string | null = null;
    if (p && opts.secret) {
      // Complete secure persistence before changing the selected account. A storage failure stays on the login screen.
      await saveProfileSecret(p.id, opts.secret);
      next = opts.secret;
    } else if (p) {
      next = await loadProfileSecret(p.id);
    }
    const pending = !!p && (!!opts.isNew || await loadOnboardingPending(p.id));
    if (p && opts.isNew) await saveOnboardingPending(p.id, true);
    await saveProfile(p);
    setApiUser(p?.id ?? null);
    setApiSecret(next);
    setSecret(next);
    setOnboarding(pending);
    setHealthIntroPending(pending);
    setProfile(p);
  }, []);

  const finishOnboarding = useCallback(async () => {
    if (profile) await saveOnboardingPending(profile.id, false);
    setOnboarding(false);
  }, [profile]);
  const consumeHealthIntro = useCallback(() => setHealthIntroPending(false), []);

  const value = useMemo(
    () => ({
      ready,
      profile,
      onboarding,
      secret,
      healthIntroPending,
      selectProfile,
      finishOnboarding,
      consumeHealthIntro,
    }),
    [
      ready,
      profile,
      onboarding,
      secret,
      healthIntroPending,
      selectProfile,
      finishOnboarding,
      consumeHealthIntro,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProfile(): ProfileState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useProfile outside ProfileProvider');
  return v;
}
