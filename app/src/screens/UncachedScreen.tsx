import React, { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { CheckCircle2 } from 'lucide-react-native';
import { api, errorMessage } from '@/api/client';
import type { MissingUnit, UnknownFood } from '@/api/types';
import { Button, Card, Chip, EmptyState, LoadingState, Notice, SectionHeader, Text } from '@/components/kit';
import { TabScreen } from '@/components/layout/TabScreen';
import { useAsync } from '@/hooks/useAsync';
import { setPendingTotal } from '@/state/pendingStore';
import { space } from '@/theme';

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/**
 * Everything anyone has logged that still can't be counted: foods nobody has entered values
 * for, and units nobody has converted. Fixing one fixes it for everyone, retroactively.
 */
export default function UncachedScreen() {
  const { data, error, loading, reload } = useAsync(() => api.uncached(), []);
  const [notice, setNotice] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const total = (data?.totals.unknownFoods ?? 0) + (data?.totals.missingUnits ?? 0);
  // Keep the tab badge in step with what this screen just loaded.
  useEffect(() => {
    if (data) setPendingTotal(total);
  }, [data, total]);

  return (
    <TabScreen
      title="Pending"
      subtitle={data ? (total > 0 ? `${total} waiting for values` : 'Nothing waiting') : undefined}
      refreshing={loading && !!data}
      onRefresh={reload}
    >
      {notice ? (
        <Notice tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Notice>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {!data && loading ? <LoadingState /> : null}
      {data && total === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="All caught up"
          body="Every food anyone has logged has its values and units."
        />
      ) : null}
      {data && total > 0 ? (
        <Text variant="small" tone="muted">
          Foods that people logged but nobody has entered values for yet. Fill one in and it counts for everyone,
          including their past logs.
        </Text>
      ) : null}

      {data && data.unknownFoods.length > 0 ? (
        <View style={{ gap: space.md }}>
          <SectionHeader
            title="Unknown foods"
            right={
              <Text variant="small" tone="muted" tabular>
                {data.totals.unknownFoods}
              </Text>
            }
          />
          {data.unknownFoods.map(f => (
            <UnknownFoodCard
              key={f.normalizedName}
              food={f}
              onResolved={msg => {
                setNotice(msg);
                reload();
              }}
            />
          ))}
        </View>
      ) : null}

      {data && data.missingUnits.length > 0 ? (
        <View style={{ gap: space.md }}>
          <SectionHeader
            title="Missing unit conversions"
            right={
              <Text variant="small" tone="muted" tabular>
                {data.totals.missingUnits}
              </Text>
            }
          />
          {data.missingUnits.map(m => (
            <MissingUnitCard key={`${m.foodId}:${m.unit}`} missing={m} />
          ))}
        </View>
      ) : null}
    </TabScreen>
  );
}

function UnknownFoodCard({ food, onResolved }: { food: UnknownFood; onResolved: (message: string) => void }) {
  const navigation = useNavigation();
  const [busy, setBusy] = useState(false);

  const alias = (foodId: string, displayName: string) =>
    Alert.alert(`Count "${food.normalizedName}" as ${displayName}?`, "Everyone's items with this name will use its values.", [
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
      <View style={{ gap: space.xs }}>
        <Text variant="title3">{food.examples[0] ?? food.normalizedName}</Text>
        <Text variant="small" tone="muted">
          {`${plural(food.itemCount, 'item')} · ${plural(food.userCount, 'person', 'people')} · in ${food.units.join(', ')}`}
        </Text>
        {food.examples.length > 1 ? (
          <Text variant="caption" tone="muted">
            Also said as: {food.examples.slice(1).join(', ')}
          </Text>
        ) : null}
      </View>

      {food.suggestions.length > 0 ? (
        <View style={{ gap: space.sm, marginTop: space.lg }}>
          <Text variant="smallStrong" tone="secondary">
            Did you mean
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {food.suggestions.map(s => (
              <Chip key={s.foodId} label={`${s.displayName}?`} onPress={() => !busy && alias(s.foodId, s.displayName)} />
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ gap: space.xs, marginTop: space.lg }}>
        <Button
          label="Enter values"
          fullWidth
          onPress={() =>
            navigation.navigate('FoodEditor', { name: food.examples[0] ?? food.normalizedName, unitHint: food.units[0] })
          }
        />
        <Button
          label="Same as an existing food…"
          variant="ghost"
          fullWidth
          onPress={() => navigation.navigate('FoodPicker', { aliasFor: food.normalizedName })}
        />
      </View>
    </Card>
  );
}

function MissingUnitCard({ missing }: { missing: MissingUnit }) {
  const navigation = useNavigation();
  return (
    <Card>
      <View style={{ gap: space.xs }}>
        <Text variant="title3">{`${missing.foodName} in ${missing.unit}`}</Text>
        <Text variant="small" tone="muted">
          {`Stored per ${missing.baseUnit} · ${plural(missing.itemCount, 'item')} · ${plural(missing.userCount, 'person', 'people')}`}
        </Text>
      </View>
      <View style={{ marginTop: space.lg }}>
        <Button
          label={`How much is 1 ${missing.unit}?`}
          variant="secondary"
          fullWidth
          onPress={() =>
            navigation.navigate('UnitConversion', {
              foodId: missing.foodId,
              foodName: missing.foodName,
              baseUnit: missing.baseUnit,
              unit: missing.unit,
            })
          }
        />
      </View>
    </Card>
  );
}
