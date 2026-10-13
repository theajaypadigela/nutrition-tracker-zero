import React, { useEffect, useState } from 'react';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { api, errorMessage } from '@/api/client';
import type { GoalDetail } from '@/api/types';
import { Button, FormGroup, InlineField, ListGroup, LoadingState, Notice, Text } from '@/components/kit';
import { StackScreen } from '@/components/layout/StackScreen';
import { useAsync } from '@/hooks/useAsync';
import { strings } from '@/i18n/strings';
import type { RootStackParamList } from '@/navigation/types';
import { useHealth } from '@/state/HealthContext';
import { goalWarning, parseGoal } from '@/utils/goals';
import { fmtNum } from '@/utils/nutrition';

/** Targets are grouped so the ones people set are first and the long tail of vitamins is last. */
const SECTIONS: { title: string; keys: string[] | null }[] = [
  { title: 'Energy and macros', keys: ['calories', 'protein', 'carbs', 'fat'] },
  { title: 'Fiber, sugar and sodium', keys: ['fiber', 'sugar', 'sodium'] },
  { title: 'Vitamins and minerals', keys: null },
];

/**
 * Typed numbers over the recommended ones (WEEKLY_BREAKDOWN_PLAN.md 6.1, 6.4, 6.7). The grey number in each field is the
 * recommended target (or, with no profile, the general reference); typing a number overrides it, higher or lower, and
 * clearing it goes back. A number away from the usual values gets a warning as it is typed but is saved all the same,
 * and saving closes the screen. For a profile without personal targets the same screen takes the numbers a care team gave.
 */
export default function GoalsScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'Goals'>>();
  const health = useHealth();
  const goals = useAsync(() => api.getGoals(), [health.mode, health.status]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = goals.data?.goals;
  const mode = goals.data?.mode;
  const careTeam = route.params?.careTeam === true || mode === 'reference_only';
  const hidden = goals.data?.hidden === true;

  useEffect(() => {
    if (list)
      setValues(Object.fromEntries(list.map(g => [g.key, g.custom && g.target != null ? String(g.target) : ''])));
  }, [list]);

  /** The value an empty field stands for: the recommended target, or with no profile the general reference. */
  const ideal = (g: GoalDetail) => g.recommended ?? (mode === 'generic' ? g.defaultGoal : null);
  /** A warning for what is typed in the field now. A care-team number is used as typed and is never measured. */
  const warningFor = (g: GoalDetail) => {
    const typed = parseGoal(values[g.key] ?? '');
    return careTeam || typed === null ? null : goalWarning(g.bounds, typed);
  };
  /** The ideal stays in view next to a number of the person's own. */
  const hintFor = (g: GoalDetail) => {
    const typed = parseGoal(values[g.key] ?? '');
    const value = ideal(g);
    if (careTeam || typed === null || value == null || typed === value) return null;
    return `${g.recommended != null ? 'Recommended' : 'General reference'}: ${fmtNum(value, g.unit)}`;
  };
  const warned = (list ?? []).filter(g => warningFor(g) !== null).length;

  const save = async () => {
    const patch: Record<string, number | null> = {};
    for (const g of list ?? []) {
      const v = parseGoal(values[g.key] ?? '');
      if (v === null) {
        if (g.custom) patch[g.key] = null;
        continue;
      }
      if (!Number.isFinite(v) || v <= 0) {
        setError(`${g.label}: enter a positive number or leave it empty`);
        return;
      }
      if (!(g.custom && g.target === v)) patch[g.key] = v;
    }
    setSaving(true);
    setError(null);
    try {
      await api.updateGoals(patch, careTeam ? 'care_team' : 'custom');
      health.refresh();
      // Saved: close the screen. Any warning was shown while typing and stays next to the target on the targets screen.
      if (navigation.canGoBack()) navigation.goBack();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const named = new Set(SECTIONS.flatMap(s => s.keys ?? []));
  const groupOf = (keys: string[] | null): GoalDetail[] =>
    (list ?? []).filter(g => (keys ? keys.includes(g.key) : !named.has(g.key)));

  return (
    <StackScreen
      title={careTeam ? 'Care-team numbers' : 'Daily targets'}
      subtitle={
        careTeam
          ? 'Type the numbers your doctor or dietitian gave you'
          : 'Leave a field empty to use the recommended value'
      }
      footer={
        <>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {warned > 0 ? (
            <Text variant="caption" tone="muted" testID="goals-warned">
              {warned === 1 ? 'One target is' : `${warned} targets are`} away from the usual range. You can still save
              {warned === 1 ? ' it' : ' them'} as typed.
            </Text>
          ) : null}
          <Button
            label="Save targets"
            size="lg"
            fullWidth
            loading={saving}
            disabled={!goals.data || hidden}
            onPress={save}
            testID="goals-save"
          />
        </>
      }
    >
      {hidden ? <Notice tone="info">Numbers are hidden. You can show them again in Settings.</Notice> : null}
      {!goals.data ? goals.error ? <Notice tone="danger">{goals.error}</Notice> : <LoadingState /> : null}

      {list && !hidden
        ? SECTIONS.map(section => {
            const rows = groupOf(section.keys);
            if (rows.length === 0) return null;
            return (
              <FormGroup key={section.title} title={section.title}>
                <ListGroup>
                  {rows.map(g => (
                    <InlineField
                      key={g.key}
                      label={g.label}
                      unit={g.unit}
                      value={values[g.key] ?? ''}
                      onChangeText={v => setValues(prev => ({ ...prev, [g.key]: v }))}
                      placeholder={ideal(g) != null ? String(ideal(g)) : 'None'}
                      hint={hintFor(g)}
                      warning={warningFor(g)}
                      testID={`goal-${g.key}`}
                    />
                  ))}
                </ListGroup>
              </FormGroup>
            );
          })
        : null}

      <Text variant="caption" tone="muted">
        {careTeam
          ? 'Used as typed, with only a check for typing mistakes. Nothing here is a recommendation, and no score is worked out from it.'
          : mode === 'personalised'
            ? 'The grey number is your recommended target. Type your own number to change it, higher or lower; clearing the field goes back. A number away from the usual range is saved with a warning.'
            : `${strings.disclaimer.reference}: the grey numbers are for a typical adult on a 2,000 kcal diet. Type your own to change one; a number away from the usual range is saved with a warning.`}
      </Text>
    </StackScreen>
  );
}
