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

/** Targets are grouped so the ones people set are first and the long tail of vitamins is last. */
const SECTIONS: { title: string; keys: string[] | null }[] = [
  { title: 'Energy and macros', keys: ['calories', 'protein', 'carbs', 'fat'] },
  { title: 'Fiber, sugar and sodium', keys: ['fiber', 'sugar', 'sodium'] },
  { title: 'Vitamins and minerals', keys: null },
];

/**
 * Typed numbers over the recommended ones (WEEKLY_BREAKDOWN_PLAN.md 6.1, 6.4, 6.7). The grey number in each field is the
 * recommended target (or, with no profile, the general reference); typing a number overrides it, clearing it goes
 * back. For a profile without personal targets the same screen takes the numbers a care team gave.
 */
export default function GoalsScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'Goals'>>();
  const health = useHealth();
  const goals = useAsync(() => api.getGoals(), [health.mode, health.status]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);

  const list = goals.data?.goals;
  const floor = goals.data?.warnings.find(w => w.id === 'below_floor');
  const careTeam = route.params?.careTeam === true || goals.data?.mode === 'reference_only';
  const hidden = goals.data?.hidden === true;
  const outside = (list ?? []).filter(g => g.outsideBounds).map(g => g.label);

  useEffect(() => {
    if (list)
      setValues(Object.fromEntries(list.map(g => [g.key, g.custom && g.target != null ? String(g.target) : ''])));
  }, [list]);

  const save = async () => {
    const patch: Record<string, number | null> = {};
    for (const g of list ?? []) {
      const raw = (values[g.key] ?? '').trim().replace(',', '.');
      if (!raw) {
        if (g.custom) patch[g.key] = null;
        continue;
      }
      const v = Number(raw);
      if (!Number.isFinite(v) || v <= 0) {
        setError(`${g.label}: enter a positive number or leave it empty`);
        return;
      }
      if (!(g.custom && g.target === v)) patch[g.key] = v;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await api.updateGoals(patch, careTeam ? 'care_team' : 'custom');
      health.refresh();
      const said = (saved.notes ?? []).map(n => n.note);
      // A calorie target under the floor, or a note about a value that was accepted, stays on screen with its message.
      if (saved.warnings.length > 0 || said.length > 0) {
        goals.setData(saved);
        setNotes(said);
      } else navigation.goBack();
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
          <Button
            label="Save targets"
            size="lg"
            fullWidth
            loading={saving}
            disabled={!goals.data || hidden}
            onPress={save}
          />
        </>
      }
    >
      {hidden ? <Notice tone="info">Numbers are hidden. You can show them again in Settings.</Notice> : null}
      {floor ? (
        <Notice tone="warning" testID="floor-warning">
          Your calorie target is under {floor.floor.toLocaleString('en-US')} kcal. That is lower than most guidance for
          adults; a doctor or dietitian can help you set it.
        </Notice>
      ) : null}
      {outside.length > 0 ? (
        <Notice tone="info">Outside the usual bounds, but kept as you set it: {outside.join(', ')}.</Notice>
      ) : null}
      {notes.map(n => (
        <Notice key={n} tone="info">
          {n}
        </Notice>
      ))}
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
                      onChangeText={v => setValues({ ...values, [g.key]: v })}
                      placeholder={
                        g.recommended != null
                          ? String(g.recommended)
                          : g.origin === 'reference' && g.defaultGoal != null
                            ? String(g.defaultGoal)
                            : 'None'
                      }
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
          : goals.data?.mode === 'personalised'
            ? 'The grey number is your recommended target. Typing a number overrides it; clearing the field goes back. Targets under 800 kcal are not accepted.'
            : `${strings.disclaimer.reference}: the grey numbers are for a typical adult on a 2,000 kcal diet. Type your own to override one.`}
      </Text>
    </StackScreen>
  );
}
