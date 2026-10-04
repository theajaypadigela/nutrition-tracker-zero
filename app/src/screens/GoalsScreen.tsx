import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api, errorMessage } from '@/api/client';
import { Banner, Button, Card, Field, Loading, Screen, ScrollBody } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';

export default function GoalsScreen() {
  const navigation = useNavigation();
  const goals = useAsync(() => api.getGoals(), []);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (goals.data) setValues(Object.fromEntries(goals.data.map((g) => [g.key, g.custom && g.target != null ? String(g.target) : ''])));
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

  if (!goals.data) return goals.error ? <Banner tone="error">{goals.error}</Banner> : <Loading />;
  return (
    <Screen edges={['bottom']}>
      <ScrollBody>
        <Text className="mb-3 mt-2 text-sm text-ink-soft">Leave a field empty to use the default.</Text>
        {error ? <Banner tone="error">{error}</Banner> : null}
        <Card>
          {goals.data.map((g) => (
            <Field
              key={g.key}
              label={`${g.label} (${g.unit})`}
              value={values[g.key] ?? ''}
              onChangeText={(v) => setValues({ ...values, [g.key]: v })}
              keyboardType="decimal-pad"
              placeholder={g.defaultGoal != null ? `default ${g.defaultGoal}` : 'no goal'}
            />
          ))}
        </Card>
        <Button title="Save goals" onPress={save} loading={saving} />
      </ScrollBody>
    </Screen>
  );
}
