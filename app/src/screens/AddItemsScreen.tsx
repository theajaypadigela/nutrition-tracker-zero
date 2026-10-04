import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { api, errorMessage } from '@/api/client';
import ItemForm, { draftError, emptyDraft, type ItemDraft } from '@/components/ItemForm';
import { Banner, Button, Card, Screen, ScrollBody } from '@/components/ui';
import type { RootStackParamList } from '@/navigation/types';

export default function AddItemsScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<RootStackParamList, 'AddItems'>>();
  const [drafts, setDrafts] = useState<ItemDraft[]>([emptyDraft()]);
  const [errors, setErrors] = useState<(string | null)[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const errs = drafts.map(draftError);
    setErrors(errs);
    if (errs.some(Boolean)) return;
    setSaving(true);
    setError(null);
    try {
      await api.addItems(
        params.date,
        drafts.map((d) => ({ name: d.name.trim(), quantity: Number(d.quantity), unit: d.unit!, meal: d.meal })),
        params.callId,
      );
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
        <Text className="mb-3 mt-2 text-sm text-ink-soft">
          Adding to {params.date}. Foods nobody has entered yet are saved anyway and count once someone adds their values.
        </Text>
        {error ? <Banner tone="error">{error}</Banner> : null}
        {drafts.map((d, i) => (
          <Card key={i}>
            <ItemForm
              draft={d}
              error={errors[i]}
              onChange={(next) => setDrafts(drafts.map((x, j) => (j === i ? next : x)))}
            />
            {drafts.length > 1 ? (
              <Pressable onPress={() => setDrafts(drafts.filter((_, j) => j !== i))} className="mt-2 self-start">
                <Text className="text-sm text-danger">Remove</Text>
              </Pressable>
            ) : null}
          </Card>
        ))}
        <View className="flex-row">
          <Button title="Another item" variant="secondary" className="mr-2 flex-1" onPress={() => setDrafts([...drafts, emptyDraft()])} />
          <Button title={`Save ${drafts.length > 1 ? `${drafts.length} items` : 'item'}`} className="flex-1" loading={saving} onPress={save} testID="save-items" />
        </View>
      </ScrollBody>
    </Screen>
  );
}
