import React, { useState } from 'react';
import { Text } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { api, errorMessage } from '@/api/client';
import { Banner, Button, Card, Field, Screen, ScrollBody } from '@/components/ui';
import type { RootStackParamList } from '@/navigation/types';
import { conversionMode, servingsFrom } from '@/utils/conversion';

export default function UnitConversionScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<RootStackParamList, 'UnitConversion'>>();
  const mode = conversionMode(params.baseUnit, params.unit);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const n = Number(value);
  const valid = Number.isFinite(n) && n > 0;
  const servings = valid ? servingsFrom(mode, n) : null;

  const prompt =
    mode.kind === 'per100'
      ? `How many ${mode.measure} is 1 ${params.unit} of ${params.foodName}?`
      : mode.kind === 'weightHelper'
        ? `How many ${mode.measure} does 1 ${params.baseUnit} of ${params.foodName} ${mode.measure === 'g' ? 'weigh' : 'hold'}?`
        : `1 ${params.unit} of ${params.foodName} = how many ${params.baseUnit}?`;

  const save = async () => {
    if (!servings) return;
    setSaving(true);
    setError(null);
    try {
      await api.setUnit(params.foodId, params.unit, servings);
      navigation.goBack();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={['bottom']}>
      <ScrollBody>
        {error ? <Banner tone="error">{error}</Banner> : null}
        <Card>
          <Text className="mb-3 text-base text-ink">{prompt}</Text>
          <Field value={value} onChangeText={setValue} keyboardType="decimal-pad" autoFocus placeholder="e.g. 1.5" />
          {servings ? (
            <Text className="text-sm text-ink-soft">
              So 1 {params.unit} = {Math.round(servings * 1000) / 1000} × {params.baseUnit}.
            </Text>
          ) : null}
        </Card>
        <Button title="Save conversion" onPress={save} loading={saving} disabled={!servings} />
        <Text className="mt-3 text-xs text-ink-muted">Applies to everyone's items in {params.unit} for this food.</Text>
      </ScrollBody>
    </Screen>
  );
}
