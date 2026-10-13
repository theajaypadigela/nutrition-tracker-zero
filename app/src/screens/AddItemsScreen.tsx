import React, { useState } from 'react';
import { View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Plus } from 'lucide-react-native';
import { api, errorMessage } from '@/api/client';
import { Button, Card, Notice, Text } from '@/components/kit';
import ItemForm, { draftErrors, emptyDraft, type DraftErrors, type ItemDraft } from '@/components/ItemForm';
import { StackScreen } from '@/components/layout/StackScreen';
import { deviceTimeZone } from '@/components/TimezoneField';
import type { RootStackParamList } from '@/navigation/types';
import { space } from '@/theme';
import { dayHeading, localDateIn } from '@/utils/dates';

export default function AddItemsScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<RootStackParamList, 'AddItems'>>();
  const [drafts, setDrafts] = useState<ItemDraft[]>([emptyDraft(params.meal ?? null)]);
  const [errors, setErrors] = useState<DraftErrors[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const errs = drafts.map(draftErrors);
    setErrors(errs);
    if (errs.some(e => Object.keys(e).length > 0)) {
      setError('Check the highlighted fields.');
      return;
    }
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
  const heading = dayHeading(params.date, localDateIn(deviceTimeZone()));
  const when = heading.title === 'Today' || heading.title === 'Yesterday' ? heading.title : `${heading.title}, ${heading.subtitle}`;

  return (
    <StackScreen
      title="Log food"
      subtitle={`Manual entry · ${when}`}
      footer={
        <>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Button
            testID="save-items"
            label={count > 1 ? `Add ${count} food entries` : 'Add food entry'}
            size="lg"
            fullWidth
            loading={saving}
            onPress={save}
          />
        </>
      }
    >
      {drafts.map((d, i) => (
        <Card key={i}>
          {count > 1 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.lg }}>
              <Text variant="bodyStrong">Item {i + 1}</Text>
              <Button
                label="Remove"
                variant="dangerGhost"
                size="sm"
                onPress={() => {
                  setDrafts(drafts.filter((_, j) => j !== i));
                  setErrors(errors.filter((_, j) => j !== i));
                }}
              />
            </View>
          ) : null}
          <ItemForm
            draft={d}
            errors={errors[i]}
            onChange={next => setDrafts(drafts.map((x, j) => (j === i ? next : x)))}
          />
        </Card>
      ))}

      <Button
        label="Add another item"
        icon={Plus}
        variant="secondary"
        fullWidth
        onPress={() => setDrafts([...drafts, emptyDraft(drafts[drafts.length - 1]?.meal ?? null)])}
      />

      <Text variant="caption" tone="muted">
        Foods nobody has entered values for are saved anyway and count once someone adds them.
      </Text>
    </StackScreen>
  );
}
