import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHealth } from '@/state/HealthContext';
import { useProfile } from '@/state/ProfileContext';
import { useToday } from './useToday';

/** "Update your weight?" at most every four weeks (plan 6.6). */
export const WEIGH_IN_PROMPT_DAYS = 28;

const key = (id: string) => `ntz.weight-prompt.dismissed.${id}`;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/**
 * Whether to ask "Update your weight?": only with personal targets, never in low-pressure mode, only when the last weigh-in is four weeks old
 * or more, and not again for four weeks after the person said "Not now". It is a question, never a reminder: there are no streaks, no
 * "you are behind", and a missed weigh-in changes nothing (plan 6.6).
 */
export function useWeightPrompt(): { visible: boolean; dismiss: () => void } {
  const { profile } = useProfile();
  const { mode, status, numbersHidden, profile: health } = useHealth();
  const today = useToday();
  const [dismissedOn, setDismissedOn] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!profile) return;
    setDismissedOn(undefined);
    AsyncStorage.getItem(key(profile.id)).then(
      v => setDismissedOn(v),
      () => setDismissedOn(null),
    );
  }, [profile]);

  const dismiss = useCallback(() => {
    setDismissedOn(today);
    if (profile) AsyncStorage.setItem(key(profile.id), today).catch(() => {});
  }, [profile, today]);

  const weightDate = health?.weightDate;
  const stale = !!weightDate && daysBetween(weightDate, today) >= WEIGH_IN_PROMPT_DAYS;
  const quiet = !!dismissedOn && daysBetween(dismissedOn, today) < WEIGH_IN_PROMPT_DAYS;
  const eligible = !!profile && mode === 'personalised' && status === 'ready' && !numbersHidden && stale;
  return { visible: eligible && dismissedOn !== undefined && !quiet, dismiss };
}
