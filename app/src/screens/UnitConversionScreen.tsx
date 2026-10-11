import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Scale } from 'lucide-react-native';
import { api, errorMessage } from '@/api/client';
import AppBar from '@/components/common/AppBar';
import { ActionButton, BottomActionBar, BOTTOM_BAR_CLEARANCE, BOTTOM_BAR_SPACE, FormInput, SectionCard } from '@/components/common/Form';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboard';
import type { RootStackParamList } from '@/navigation/types';
import { tokens } from '@/theme/tokens';
import { conversionMode, servingsFrom } from '@/utils/conversion';

export default function UnitConversionScreen() {
  const navigation = useNavigation();
  const { keyboardHeight, scrollProps } = useKeyboardAwareScroll(BOTTOM_BAR_CLEARANCE);
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
    <View className="flex-1">
      <AppBar title="Unit conversion" subtitle={params.foodName} variant="secondary" showBackButton />
      <ScrollView
        {...scrollProps}
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: BOTTOM_BAR_SPACE + keyboardHeight }}
      >
        <VStack className="p-6 gap-5">
          <SectionCard
            icon={Scale}
            iconColor={tokens.icon.blue}
            iconBg="bg-blue-50"
            title={`1 ${params.unit}`}
            subtitle={`${params.foodName} is stored per ${params.baseUnit}`}
          >
            <Text className="text-base text-gray-900">{prompt}</Text>
            <FormInput value={value} onChangeText={setValue} keyboardType="decimal-pad" autoFocus placeholder="e.g. 1.5" />
          </SectionCard>

          {servings ? (
            <VStack className="bg-emerald-50 rounded-2xl p-5 border border-emerald-200 gap-2">
              <Text size="sm" className="font-semibold text-emerald-800">
                Summary
              </Text>
              <Text size="sm" className="text-emerald-700">
                🔁 1 {params.unit} = {Math.round(servings * 1000) / 1000} × {params.baseUnit}
              </Text>
            </VStack>
          ) : null}

          <Text size="xs" className="text-gray-500">
            Applies to everyone's items in {params.unit} for this food.
          </Text>
        </VStack>
      </ScrollView>
      <BottomActionBar error={error}>
        <ActionButton title="Save conversion" onPress={save} loading={saving} disabled={!servings} />
      </BottomActionBar>
    </View>
  );
}
