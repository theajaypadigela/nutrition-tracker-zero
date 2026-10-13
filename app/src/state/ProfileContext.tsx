import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { setApiSecret, setApiUser } from '@/api/client';
import type { Profile } from '@/api/types';
import { clearProfileSecret, loadProfileSecret, saveProfileSecret } from '@/services/secret';
import { loadProfile, saveProfile } from './profileStore';

interface ProfileState {
  ready: boolean;
  profile: Profile | null;
  /** True right after creating a profile, until onboarding is finished. */
  onboarding: boolean;
  /** This profile's secret from secure storage, or null (a new phone, or a profile that has none yet). */
  secret: string | null;
  /** A secret to show once as a recovery code, until the person says they have saved it. */
  recoveryCode: string | null;
  /** Secure storage refused the secret: it works until the app closes, and the recovery code is then the only copy. */
  secretNotStored: boolean;
  /** A new profile has just finished setting up its call: offer to make the targets personal, once. */
  healthIntroPending: boolean;
  selectProfile: (p: Profile | null, opts?: { isNew?: boolean; secret?: string }) => Promise<void>;
  finishOnboarding: () => void;
  /** Keep a secret on this phone (claimed, or typed as a recovery code) and use it from now on. */
  adoptSecret: (secret: string, opts?: { show?: boolean }) => Promise<void>;
  acknowledgeRecovery: () => void;
  consumeHealthIntro: () => void;
  /** Forget the secret on this phone (it no longer matches, or the person is starting over). */
  forgetSecret: () => Promise<void>;
}

const Ctx = createContext<ProfileState | null>(null);

/** Puts a secret in secure storage; false when the phone refuses (never a fallback to plain storage). */
async function storeSecret(userId: string, secret: string): Promise<boolean> {
  try {
    await saveProfileSecret(userId, secret);
    return true;
  } catch {
    return false;
  }
}

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [secretNotStored, setSecretNotStored] = useState(false);
  const [healthIntroPending, setHealthIntroPending] = useState(false);

  useEffect(() => {
    (async () => {
      const p = await loadProfile();
      const stored = p ? await loadProfileSecret(p.id) : null;
      setApiUser(p?.id ?? null);
      setApiSecret(stored);
      setSecret(stored);
      setProfile(p);
      setReady(true);
    })();
  }, []);

  const selectProfile = useCallback(async (p: Profile | null, opts: { isNew?: boolean; secret?: string } = {}) => {
    await saveProfile(p);
    let next: string | null = null;
    let notStored = false;
    if (p && opts.secret) {
      // A new profile: the secret goes to secure storage and is shown once. The server keeps only its hash, so if secure storage
      // refuses it, it is still used and still shown: the recovery code is then the only copy, and the screen says so.
      notStored = !(await storeSecret(p.id, opts.secret));
      next = opts.secret;
    } else if (p) {
      next = await loadProfileSecret(p.id);
    }
    setApiUser(p?.id ?? null);
    setApiSecret(next);
    setSecret(next);
    setRecoveryCode(p && opts.secret ? opts.secret : null);
    setSecretNotStored(notStored);
    setOnboarding(!!p && !!opts.isNew);
    setHealthIntroPending(!!p && !!opts.isNew);
    setProfile(p);
  }, []);

  const finishOnboarding = useCallback(() => setOnboarding(false), []);
  const acknowledgeRecovery = useCallback(() => setRecoveryCode(null), []);
  const consumeHealthIntro = useCallback(() => setHealthIntroPending(false), []);

  const adoptSecret = useCallback(
    async (s: string, opts: { show?: boolean } = {}) => {
      if (!profile) return;
      // Used and shown even if secure storage refuses it (a just-claimed secret exists nowhere else); the screen then says so.
      const stored = await storeSecret(profile.id, s);
      setApiSecret(s);
      setSecret(s);
      setSecretNotStored(!stored);
      if (opts.show) setRecoveryCode(s);
    },
    [profile],
  );

  const forgetSecret = useCallback(async () => {
    if (profile) await clearProfileSecret(profile.id);
    setApiSecret(null);
    setSecret(null);
  }, [profile]);

  const value = useMemo(
    () => ({
      ready,
      profile,
      onboarding,
      secret,
      recoveryCode,
      secretNotStored,
      healthIntroPending,
      selectProfile,
      finishOnboarding,
      adoptSecret,
      acknowledgeRecovery,
      consumeHealthIntro,
      forgetSecret,
    }),
    [
      ready,
      profile,
      onboarding,
      secret,
      recoveryCode,
      secretNotStored,
      healthIntroPending,
      selectProfile,
      finishOnboarding,
      adoptSecret,
      acknowledgeRecovery,
      consumeHealthIntro,
      forgetSecret,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProfile(): ProfileState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useProfile outside ProfileProvider');
  return v;
}
