import React, { useState } from 'react';
import { Text as RNText, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Plus } from 'lucide-react-native';
import { api, errorMessage } from '@/api/client';
import AppBar from '@/components/common/AppBar';
import { Notice } from '@/components/common/Feedback';
import ItemForm, { draftErrors, emptyDraft, type DraftErrors, type ItemDraft } from '@/components/ItemForm';
import { Divider } from '@/components/ui/divider';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboard';
import type { RootStackParamList } from '@/navigation/types';
import { tokens } from '@/theme/tokens';

export default function AddItemsScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<RootStackParamList, 'AddItems'>>();
  const { keyboardHeight, scrollProps } = useKeyboardAwareScroll();
  const [drafts, setDrafts] = useState<ItemDraft[]>([emptyDraft(params.meal ?? null)]);
  const [errors, setErrors] = useState<DraftErrors[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const errs = drafts.map(draftErrors);
    setErrors(errs);
    if (errs.some(e => Object.keys(e).length > 0)) return;
    setSaving(true);
    setError(null);
    try {
      await api.addItems(
        params.date,
        drafts.map(d => ({ name: d.name.trim(), quantity: Number(d.quantity), unit: d.unit!.trim(), meal: d.meal })),
        params.callId,
      );
      navigation.goBack();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const count = drafts.length;

  return (
    <View className="flex-1">
        <AppBar title="Log Food" subtitle="Manual entry" variant="secondary" showBackButton />

        <ScrollView
          {...scrollProps}
          className="flex-1"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 120 + keyboardHeight }}
        >
          <VStack className="p-6 gap-6">
            {/* Error banner */}
            {error ? <Notice tone="error">{error}</Notice> : null}

            {/* Form cards, one per item */}
            {drafts.map((d, i) => (
              <View key={i} className="bg-white rounded-2xl border border-gray-200 p-5">
                <HStack className="items-center justify-between mb-4">
                  <Text className="text-base font-semibold text-gray-900">
                    {count > 1 ? `Food Details · ${i + 1}` : 'Food Details'}
                  </Text>
                  {count > 1 ? (
                    <TouchableOpacity
                      onPress={() => {
                        setDrafts(drafts.filter((_, j) => j !== i));
                        setErrors(errors.filter((_, j) => j !== i));
                      }}
                      className="rounded-full bg-red-50 px-3 py-1.5"
                    >
                      <Text className="text-xs font-semibold text-red-500">Remove</Text>
                    </TouchableOpacity>
                  ) : null}
                </HStack>
                <Divider className="mb-5" />
                <ItemForm
                  draft={d}
                  errors={errors[i]}
                  onChange={next => setDrafts(drafts.map((x, j) => (j === i ? next : x)))}
                />
              </View>
            ))}

            {/* Another item — the meal card's dashed add button */}
            <TouchableOpacity
              onPress={() => setDrafts([...drafts, emptyDraft(drafts[drafts.length - 1]?.meal ?? null)])}
              className="flex-row items-center justify-center gap-1.5 rounded-xl py-3 border-dashed"
              style={{ borderWidth: 1.5, borderColor: tokens.foodLog.line }}
              activeOpacity={0.7}
            >
              <Plus size={15} color={tokens.foodLog.green} strokeWidth={2.4} />
              <Text className="text-[13px] font-bold" style={{ color: tokens.foodLog.green }}>
                Add another item
              </Text>
            </TouchableOpacity>

            {/* Date info */}
            <View className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 gap-1">
              <Text className="text-xs text-blue-600">
                This entry will be logged for: <Text className="text-xs font-semibold text-blue-600">{params.date}</Text>
              </Text>
              <Text className="text-xs text-blue-600">
                Foods nobody has entered yet are saved anyway and count once someone adds their values.
              </Text>
            </View>

            {/* Submit button — the old xl emerald Button, drawn with a plain RN Text: the
                className-styled label re-lays out short after a re-render and clips. */}
            <TouchableOpacity
              testID="save-items"
              accessibilityRole="button"
              accessibilityState={{ disabled: saving, busy: saving }}
              onPress={save}
              disabled={saving}
              activeOpacity={0.85}
              className={`w-full h-12 px-7 flex-row items-center justify-center bg-emerald-500 rounded-2xl ${saving ? 'opacity-40' : ''}`}
            >
              <RNText style={styles.submitText}>
                {saving ? 'Adding Entry...' : count > 1 ? `Add ${count} Food Entries` : 'Add Food Entry'}
              </RNText>
            </TouchableOpacity>
          </VStack>
        </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // NativeWind's text-base, which is 14 on native (rem 14).
  submitText: {
    color: tokens.icon.onAccent,
    fontSize: 14,
    fontWeight: '600',
  },
});
