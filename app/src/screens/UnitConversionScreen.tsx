import React, { useState } from 'react';
import { View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { api, errorMessage } from '@/api/client';
import { Button, Card, Field, Notice, Text } from '@/components/kit';
import { StackScreen } from '@/components/layout/StackScreen';
import type { RootStackParamList } from '@/navigation/types';
import { useAsync } from '@/hooks/useAsync';
import { fill } from '@/i18n/fill';
import { strings, where } from '@/i18n/strings';
import { space } from '@/theme';
import { conversionMode, servingsFrom } from '@/utils/conversion';
import { conversionText } from './FoodEditorScreen';
import { readNumber } from '@/utils/foodData';

/** The helpings people measure cooked food in (the Worker asks the same question on save, plan 7.7). */
const COOKED_SERVINGS = ['katori', 'bowl', 'plate', 'serving'];

export default function UnitConversionScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<RootStackParamList, 'UnitConversion'>>();
  const mode = conversionMode(params.baseUnit, params.unit);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Whether the food's numbers are for it raw: then a katori of it is the raw amount that goes into one, not the cooked weight.
  const food = useAsync(() => api.getFood(params.foodId), [params.foodId]);
  const rawNote = food.data?.form === 'raw' && COOKED_SERVINGS.includes(params.unit);

  const n = readNumber(value);
  const servings = n !== null && n > 0 ? servingsFrom(mode, n) : null;

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
      {rawNote ? (
        <Notice tone="warning" testID="conversion-raw-note">
          {fill(strings.food.conversion.rawNote, { unit: params.unit })}
        </Notice>
      ) : null}

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
          {conversionText(params.unit, servings, params.baseUnit)}
        </Notice>
      ) : null}

      <Text variant="caption" tone="muted">
        {where.unitConversionNote(params.unit)}
      </Text>
    </StackScreen>
  );
}
