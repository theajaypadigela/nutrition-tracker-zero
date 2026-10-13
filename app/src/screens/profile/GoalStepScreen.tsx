import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api } from '@/api/client';
import type { HealthGoal, Pace, TargetSetInfo } from '@/api/types';
import { Button, FormGroup, LoadingState, Notice, Text } from '@/components/kit';
import { StackScreen } from '@/components/layout/StackScreen';
import { ChoiceCard } from '@/components/health/ChoiceCard';
import { useAsync } from '@/hooks/useAsync';
import { strings } from '@/i18n/strings';
import { profileInputOf, safetyOf, useHealthDraft } from '@/state/HealthDraft';
import { space } from '@/theme';
import { formatNumber } from '@/utils/format';

const t = strings.health.goal;
const GOALS: HealthGoal[] = ['general_health', 'maintain', 'lose', 'gain', 'build_muscle'];
const PACES: Pace[] = ['gentle', 'standard', 'faster'];

/** The first-weeks rate of a deficit, kg a week: deficit x 7 / 7,700 (plan 4.3). A rough guide that slows down. */
const weeklyKg = (delta: number) => Math.abs(delta * 7) / 7700;

/** "About 1,670 kcal a day (a typical range is 1,430 to 1,910)" from the Worker, so the formulas live in one place. */
export function energyLine(set: TargetSetInfo | null): string | null {
  if (!set?.energy) return null;
  const e = set.energy;
  return `About ${formatNumber(e.target)} kcal a day (a typical range is ${formatNumber(e.low + (e.target - e.maintenance))} to ${formatNumber(e.high + (e.target - e.maintenance))})`;
}

/** Step 4: the goal and, for a loss or gain, the pace, with the daily calories each gives, previewed by the Worker. */
export default function GoalStepScreen() {
  const navigation = useNavigation();
  const { draft, update } = useHealthDraft();
  const input = useMemo(() => profileInputOf(draft), [draft]);
  const safety = useMemo(() => safetyOf(draft), [draft]);
  const paced = draft.goal === 'lose' || draft.goal === 'gain';

  // One preview with the goal asked, to learn which goals are offered; one per pace when the goal has a pace.
  const base = useAsync(
    () => api.previewTargets({ ...input, goal: 'general_health' }, safety),
    [input.heightCm, input.weightKg, input.birthYear, input.sexForCalc, input.activity],
  );
  const byPace = useAsync(
    () =>
      paced
        ? Promise.all(PACES.map(p => api.previewTargets({ ...input, pace: p }, safety)))
        : Promise.resolve([] as TargetSetInfo[]),
    [draft.goal, input.heightCm, input.weightKg, input.birthYear, input.sexForCalc, input.activity],
  );
  const current = paced ? (byPace.data?.[PACES.indexOf(draft.pace)] ?? null) : null;
  const available = base.data?.availableGoals ?? GOALS;

  return (
    <StackScreen
      title={t.title}
      subtitle="Step 4"
      footer={
        <Button
          testID="goal-continue"
          label={t.continue}
          size="lg"
          fullWidth
          disabled={!available.includes(draft.goal)}
          onPress={() => navigation.navigate('Pattern')}
        />
      }
    >
      {base.error ? <Notice tone="danger">{base.error}</Notice> : null}
      <View style={{ gap: space.md }}>
        {GOALS.map(g => {
          const offered = available.includes(g);
          return (
            <ChoiceCard
              key={g}
              testID={`goal-${g}`}
              title={t[g].title}
              body={offered ? t[g].body : t.notOffered}
              selected={draft.goal === g}
              disabled={!offered}
              onPress={() => update({ goal: g })}
            />
          );
        })}
      </View>

      {paced ? (
        <FormGroup title={t.paceTitle} hint={strings.disclaimer.projection}>
          {byPace.loading && !byPace.data ? <LoadingState /> : null}
          <View style={{ gap: space.md }}>
            {PACES.map((p, i) => {
              const set = byPace.data?.[i];
              const e = set?.energy;
              const body = e
                ? `About ${formatNumber(e.target)} kcal a day. About ${(Math.round(weeklyKg(e.delta) * 10) / 10).toFixed(1)} kg a week at first, slowing down.`
                : undefined;
              return (
                <ChoiceCard
                  key={p}
                  testID={`pace-${p}`}
                  title={t[p]}
                  body={body}
                  selected={draft.pace === p}
                  onPress={() => update({ pace: p })}
                />
              );
            })}
          </View>
          <Text variant="caption" tone="muted">
            {t.paceNote}
          </Text>
        </FormGroup>
      ) : null}

      {current ? (
        <Notice tone="info" testID="goal-preview">
          {energyLine(current)}
        </Notice>
      ) : null}
    </StackScreen>
  );
}
