import React, { useState } from 'react';
import { Alert, Text } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { api, errorMessage } from '@/api/client';
import ItemForm, { draftError, type ItemDraft } from '@/components/ItemForm';
import { Banner, Button, Card, Screen, ScrollBody } from '@/components/ui';
import type { RootStackParamList } from '@/navigation/types';
import { useMeta } from '@/state/MetaContext';
import { formatNumber } from '@/utils/format';

export default function EditItemScreen() {
  const navigation = useNavigation();
  const meta = useMeta();
  const { params } = useRoute<RouteProp<RootStackParamList, 'EditItem'>>();
  const item = params.item;
  const [draft, setDraft] = useState<ItemDraft>({ name: item.rawName, quantity: String(item.quantity), unit: item.unit, meal: item.meal });
  const [formError, setFormError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);

  const save = async () => {
    const err = draftError(draft);
    setFormError(err);
    if (err) return;
    setBusy('save');
    try {
      await api.updateItem(item.id, { name: draft.name.trim(), quantity: Number(draft.quantity), unit: draft.unit!, meal: draft.meal });
      navigation.goBack();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = () =>
    Alert.alert('Delete this item?', item.rawName, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy('delete');
          try {
            await api.deleteItem(item.id);
            navigation.goBack();
          } catch (e) {
            setError(errorMessage(e));
            setBusy(null);
          }
        },
      },
    ]);

  return (
    <Screen edges={['bottom']}>
      <ScrollBody>
        {error ? <Banner tone="error">{error}</Banner> : null}
        {item.status === 'pending_food' ? (
          <Banner
            tone="warn"
            action={<Button small variant="ghost" title="Enter food values" onPress={() => navigation.navigate('FoodEditor', { name: item.rawName, unitHint: item.unit })} />}
          >
            Nobody has entered values for "{item.normalizedName}" yet, so it doesn't count toward your totals.
          </Banner>
        ) : null}
        {item.status === 'pending_unit' && item.foodId ? (
          <Banner
            tone="warn"
            action={
              <Button
                small
                variant="ghost"
                title={`Convert ${item.unit}`}
                onPress={() =>
                  navigation.navigate('UnitConversion', { foodId: item.foodId!, foodName: item.foodName ?? item.rawName, baseUnit: item.baseUnit ?? '', unit: item.unit })
                }
              />
            }
          >
            {item.foodName} is stored per {item.baseUnit}; nobody has said how much one {item.unit} is yet.
          </Banner>
        ) : null}
        {item.status === 'resolved' ? (
          <Card>
            <Text className="mb-1 text-sm font-medium text-ink-soft">Counts as {item.foodName}</Text>
            <Text className="text-sm text-ink-soft">
              {meta.nutrients
                .filter((n) => item.nutrients[n.key] != null)
                .map((n) => `${n.label} ${formatNumber(item.nutrients[n.key]!, 1)} ${n.unit}`)
                .join(' · ')}
            </Text>
          </Card>
        ) : null}
        <Card>
          <ItemForm draft={draft} onChange={setDraft} error={formError} />
        </Card>
        <Button title="Save" onPress={save} loading={busy === 'save'} className="mb-2" />
        <Button title="Delete item" variant="danger" onPress={remove} loading={busy === 'delete'} />
      </ScrollBody>
    </Screen>
  );
}
