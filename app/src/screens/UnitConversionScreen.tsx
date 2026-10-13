import React, { useState } from 'react';
import { View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { api, errorMessage } from '@/api/client';
import { Button, Card, Field, Notice, Text } from '@/components/kit';
import { StackScreen } from '@/components/layout/StackScreen';
import type { RootStackParamList } from '@/navigation/types';
import { space } from '@/theme';
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
    <StackScreen
      title="Unit conversion"
      subtitle={params.foodName}
      footer={
        <>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Button label="Save conversion" size="lg" fullWidth loading={saving} disabled={!servings} onPress={save} />
        </>
      }
    >
      <Card padding="xl">
        <View style={{ gap: space.xs }}>
          <Text variant="title2">1 {params.unit}</Text>
          <Text variant="small" tone="muted">
            {params.foodName} is stored per {params.baseUnit}
          </Text>
        </View>
        <View style={{ gap: space.lg, marginTop: space.xl }}>
          <Text variant="body" tone="secondary">
            {prompt}
          </Text>
          <Field value={value} onChangeText={setValue} keyboardType="decimal-pad" autoFocus placeholder="e.g. 1.5" />
        </View>
      </Card>

      {servings ? (
        <Notice tone="success" title="Summary">
          1 {params.unit} = {Math.round(servings * 1000) / 1000} × {params.baseUnit}
        </Notice>
      ) : null}

      <Text variant="caption" tone="muted">
        Applies to everyone's items in {params.unit} for this food.
      </Text>
    </StackScreen>
  );
}
