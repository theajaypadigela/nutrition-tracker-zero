import React, { useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { api, errorMessage } from '@/api/client';
import type { Goal } from '@/api/types';
import { Button, FormGroup, InlineField, ListGroup, LoadingState, Notice } from '@/components/kit';
import { StackScreen } from '@/components/layout/StackScreen';
import { useAsync } from '@/hooks/useAsync';

/** Targets are grouped so the ones people set are first and the long tail of vitamins is last. */
const SECTIONS: { title: string; keys: string[] | null }[] = [
  { title: 'Energy and macros', keys: ['calories', 'protein', 'carbs', 'fat'] },
  { title: 'Limits and fiber', keys: ['fiber', 'sugar', 'sodium'] },
  { title: 'Vitamins and minerals', keys: null },
];

export default function GoalsScreen() {
  const navigation = useNavigation();
  const goals = useAsync(() => api.getGoals(), []);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (goals.data) setValues(Object.fromEntries(goals.data.map(g => [g.key, g.custom && g.target != null ? String(g.target) : ''])));
  }, [goals.data]);

  const save = async () => {
    const patch: Record<string, number | null> = {};
    for (const g of goals.data ?? []) {
      const raw = (values[g.key] ?? '').trim();
      if (!raw) {
        if (g.custom) patch[g.key] = null;
        continue;
      }
      const v = Number(raw);
      if (!Number.isFinite(v) || v <= 0) {
        setError(`${g.label}: enter a positive number or leave it empty`);
        return;
      }
      patch[g.key] = v;
    }
    setSaving(true);
    setError(null);
    try {
      await api.updateGoals(patch);
      navigation.goBack();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const named = new Set(SECTIONS.flatMap(s => s.keys ?? []));
  const groupOf = (keys: string[] | null): Goal[] =>
    (goals.data ?? []).filter(g => (keys ? keys.includes(g.key) : !named.has(g.key)));

  return (
    <StackScreen
      title="Daily goals"
      subtitle="Leave a field empty to use the default"
      footer={
        <>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Button label="Save goals" size="lg" fullWidth loading={saving} disabled={!goals.data} onPress={save} />
        </>
      }
    >
      {!goals.data ? goals.error ? <Notice tone="danger">{goals.error}</Notice> : <LoadingState /> : null}

      {goals.data
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
                      placeholder={g.defaultGoal != null ? String(g.defaultGoal) : 'None'}
                    />
                  ))}
                </ListGroup>
              </FormGroup>
            );
          })
        : null}
    </StackScreen>
  );
}
