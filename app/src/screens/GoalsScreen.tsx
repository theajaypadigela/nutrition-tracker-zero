import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Target } from 'lucide-react-native';
import { api, errorMessage } from '@/api/client';
import AppBar from '@/components/common/AppBar';
import { LoadingState, Notice } from '@/components/common/Feedback';
import { ActionButton, BottomActionBar, BOTTOM_BAR_CLEARANCE, BOTTOM_BAR_SPACE, FormInput, SectionCard } from '@/components/common/Form';
import { VStack } from '@/components/ui/vstack';
import { useAsync } from '@/hooks/useAsync';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboard';
import { tokens } from '@/theme/tokens';

export default function GoalsScreen() {
  const navigation = useNavigation();
  const { keyboardHeight, scrollProps } = useKeyboardAwareScroll(BOTTOM_BAR_CLEARANCE);
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

  return (
    <View className="flex-1">
      <AppBar title="Daily goals" subtitle="Leave a field empty to use the default" variant="secondary" showBackButton />
      {!goals.data ? (
        goals.error ? (
          <View className="p-6">
            <Notice tone="error">{goals.error}</Notice>
          </View>
        ) : (
          <LoadingState color={tokens.dashboard.green} />
        )
      ) : (
        <ScrollView
          {...scrollProps}
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: BOTTOM_BAR_SPACE + keyboardHeight }}
        >
          <VStack className="p-6 gap-5">
            <SectionCard
              icon={Target}
              iconColor={tokens.icon.green}
              iconBg="bg-emerald-50"
              title="Daily targets"
              subtitle="Today and the reports compare against these"
            >
              <View className="flex-row flex-wrap justify-between gap-y-3">
                {goals.data.map(g => (
                  <FormInput
                    key={g.key}
                    className="w-[48%]"
                    label={`${g.label} (${g.unit})`}
                    value={values[g.key] ?? ''}
                    onChangeText={v => setValues({ ...values, [g.key]: v })}
                    keyboardType="decimal-pad"
                    placeholder={g.defaultGoal != null ? `default ${g.defaultGoal}` : 'no goal'}
                  />
                ))}
              </View>
            </SectionCard>
          </VStack>
        </ScrollView>
      )}
      <BottomActionBar error={error}>
        <ActionButton title="Save goals" onPress={save} loading={saving} disabled={!goals.data} />
      </BottomActionBar>
    </View>
  );
}
