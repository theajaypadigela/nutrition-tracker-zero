import React, { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { api, errorMessage } from '@/api/client';
import type { MissingUnit, UnknownFood } from '@/api/types';
import { Banner, Button, Card, Chip, Empty, Header, Loading, Screen, ScrollBody, SectionTitle } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';

export default function UncachedScreen() {
  const { data, error, loading, reload } = useAsync(() => api.uncached(), []);
  const [notice, setNotice] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const total = (data?.totals.unknownFoods ?? 0) + (data?.totals.missingUnits ?? 0);
  return (
    <Screen>
      <Header title="Uncached" subtitle="Foods logged by anyone that still need values" />
      <ScrollBody refreshing={loading && !!data} onRefresh={reload}>
        {notice ? <Banner tone="ok">{notice}</Banner> : null}
        {error ? <Banner tone="error">{error}</Banner> : null}
        {!data && loading ? <Loading /> : null}
        {data && total === 0 ? <Empty title="All caught up" body="Every logged food has values and units. Nice." /> : null}

        {data && data.unknownFoods.length > 0 ? (
          <>
            <SectionTitle>Unknown foods · {data.totals.unknownFoods}</SectionTitle>
            {data.unknownFoods.map((f) => (
              <UnknownFoodCard key={f.normalizedName} food={f} onResolved={(msg) => { setNotice(msg); reload(); }} />
            ))}
          </>
        ) : null}

        {data && data.missingUnits.length > 0 ? (
          <>
            <SectionTitle>Missing unit conversions · {data.totals.missingUnits}</SectionTitle>
            {data.missingUnits.map((m) => (
              <MissingUnitCard key={`${m.foodId}:${m.unit}`} missing={m} />
            ))}
          </>
        ) : null}
      </ScrollBody>
    </Screen>
  );
}

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

function UnknownFoodCard({ food, onResolved }: { food: UnknownFood; onResolved: (message: string) => void }) {
  const navigation = useNavigation();
  const [busy, setBusy] = useState(false);

  const alias = (foodId: string, displayName: string) =>
    Alert.alert(`Count "${food.normalizedName}" as ${displayName}?`, 'Everyone\'s items with this name will use its values.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Yes, same food',
        onPress: async () => {
          setBusy(true);
          try {
            const res = await api.addAlias(foodId, food.normalizedName);
            onResolved(`Linked to ${displayName}. ${plural(res.resolvedCount, 'item')} resolved.`);
          } catch (e) {
            Alert.alert('Could not link', errorMessage(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);

  return (
    <Card>
      <Text className="text-lg font-semibold text-ink">{food.examples[0] ?? food.normalizedName}</Text>
      <Text className="mt-0.5 text-sm text-ink-soft">
        {plural(food.itemCount, 'item')} · {plural(food.userCount, 'person', 'people')} · in {food.units.join(', ')}
      </Text>
      {food.examples.length > 1 ? <Text className="mt-0.5 text-xs text-ink-muted">Also said as: {food.examples.slice(1).join(', ')}</Text> : null}
      {food.suggestions.length > 0 ? (
        <View className="mt-3">
          <Text className="mb-1.5 text-sm text-ink-soft">Did you mean</Text>
          <View className="flex-row flex-wrap">
            {food.suggestions.map((s) => (
              <Chip key={s.foodId} label={`${s.displayName}?`} onPress={() => alias(s.foodId, s.displayName)} tone="info" />
            ))}
          </View>
        </View>
      ) : null}
      <View className="mt-2 flex-row">
        <Button
          small
          title="Enter values"
          className="mr-2 flex-1"
          loading={busy}
          onPress={() => navigation.navigate('FoodEditor', { name: food.examples[0] ?? food.normalizedName, unitHint: food.units[0] })}
        />
        <Button small title="Same as existing…" variant="secondary" className="flex-1" onPress={() => navigation.navigate('FoodPicker', { aliasFor: food.normalizedName })} />
      </View>
    </Card>
  );
}

function MissingUnitCard({ missing }: { missing: MissingUnit }) {
  const navigation = useNavigation();
  return (
    <Card>
      <Text className="text-base font-semibold text-ink">
        {missing.foodName} in {missing.unit}
      </Text>
      <Text className="mt-0.5 text-sm text-ink-soft">
        Stored per {missing.baseUnit} · {plural(missing.itemCount, 'item')} · {plural(missing.userCount, 'person', 'people')}
      </Text>
      <Button
        small
        title={`How much is 1 ${missing.unit}?`}
        variant="secondary"
        className="mt-3 self-start"
        onPress={() =>
          navigation.navigate('UnitConversion', { foodId: missing.foodId, foodName: missing.foodName, baseUnit: missing.baseUnit, unit: missing.unit })
        }
      />
    </Card>
  );
}
