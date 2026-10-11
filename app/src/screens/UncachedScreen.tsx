import React, { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HelpCircle, Scale } from 'lucide-react-native';
import { api, errorMessage } from '@/api/client';
import type { MissingUnit, UnknownFood } from '@/api/types';
import AppBar from '@/components/common/AppBar';
import { EmptyState, LoadingState, Notice, SectionLabel } from '@/components/common/Feedback';
import { Text } from '@/components/ui/text';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { useAsync } from '@/hooks/useAsync';
import { tokens } from '@/theme/tokens';

export default function UncachedScreen() {
  const insets = useSafeAreaInsets();
  const { data, error, loading, reload } = useAsync(() => api.uncached(), []);
  const [notice, setNotice] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const total = (data?.totals.unknownFoods ?? 0) + (data?.totals.missingUnits ?? 0);
  return (
    <View className="flex-1">
      <AppBar title="Uncached" subtitle="Foods logged by anyone that still need values" showProfileShortcut />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} />}
      >
        <VStack className="p-6 gap-4">
          {notice ? <Notice tone="success">{notice}</Notice> : null}
          {error ? <Notice tone="error">{error}</Notice> : null}
          {!data && loading ? <LoadingState color={tokens.dashboard.green} /> : null}
          {data && total === 0 ? <EmptyState title="All caught up" body="Every logged food has values and units. Nice." /> : null}

          {data && data.unknownFoods.length > 0 ? (
            <VStack className="gap-3">
              <SectionLabel dot="bg-amber-400">Unknown foods · {data.totals.unknownFoods}</SectionLabel>
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
            </VStack>
          ) : null}

          {data && data.missingUnits.length > 0 ? (
            <VStack className="gap-3">
              <SectionLabel dot="bg-blue-400">Missing unit conversions · {data.totals.missingUnits}</SectionLabel>
              {data.missingUnits.map(m => (
                <MissingUnitCard key={`${m.foodId}:${m.unit}`} missing={m} />
              ))}
            </VStack>
          ) : null}
        </VStack>
      </ScrollView>
    </View>
  );
}

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/** Dashboard-style card: tinted round icon, title + meta, then the card's body. */
function TaskCard({
  icon,
  iconBg,
  title,
  meta,
  children,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  meta: string;
  children: React.ReactNode;
}) {
  return (
    <VStack className="w-full bg-white rounded-2xl p-4 border border-gray-200 gap-3">
      <HStack className="items-center gap-3">
        <View className={`w-10 h-10 rounded-full items-center justify-center ${iconBg}`}>{icon}</View>
        <VStack className="flex-1">
          <Text className="text-base font-semibold text-gray-900">{title}</Text>
          <Text className="text-xs text-gray-500 mt-0.5">{meta}</Text>
        </VStack>
      </HStack>
      {children}
    </VStack>
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
    <TaskCard
      icon={<HelpCircle size={18} stroke={tokens.icon.amber} strokeWidth={2.5} />}
      iconBg="bg-amber-50"
      title={food.examples[0] ?? food.normalizedName}
      meta={`${plural(food.itemCount, 'item')} · ${plural(food.userCount, 'person', 'people')} · in ${food.units.join(', ')}`}
    >
      {food.examples.length > 1 ? (
        <Text className="text-xs text-gray-400">Also said as: {food.examples.slice(1).join(', ')}</Text>
      ) : null}
      {food.suggestions.length > 0 ? (
        <VStack className="gap-2">
          <Text className="text-[10px] font-medium text-gray-400 uppercase tracking-widest">Did you mean</Text>
          <View className="flex-row flex-wrap gap-2">
            {food.suggestions.map(s => (
              <TouchableOpacity
                key={s.foodId}
                onPress={() => alias(s.foodId, s.displayName)}
                disabled={busy}
                className="rounded-full bg-blue-50 border border-blue-100 px-3 py-1.5"
              >
                <Text className="text-xs font-semibold text-blue-600">{s.displayName}?</Text>
              </TouchableOpacity>
            ))}
          </View>
        </VStack>
      ) : null}
      <HStack className="gap-2">
        <TouchableOpacity
          onPress={() =>
            navigation.navigate('FoodEditor', { name: food.examples[0] ?? food.normalizedName, unitHint: food.units[0] })
          }
          className="flex-1 items-center rounded-lg bg-emerald-600 px-4 py-2.5"
        >
          <Text className="text-white font-semibold text-sm">Enter values</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate('FoodPicker', { aliasFor: food.normalizedName })}
          className="flex-1 items-center rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5"
        >
          <Text className="text-emerald-700 font-semibold text-sm">Same as existing…</Text>
        </TouchableOpacity>
      </HStack>
    </TaskCard>
  );
}

function MissingUnitCard({ missing }: { missing: MissingUnit }) {
  const navigation = useNavigation();
  return (
    <TaskCard
      icon={<Scale size={18} stroke={tokens.icon.blue} strokeWidth={2.5} />}
      iconBg="bg-blue-50"
      title={`${missing.foodName} in ${missing.unit}`}
      meta={`Stored per ${missing.baseUnit} · ${plural(missing.itemCount, 'item')} · ${plural(missing.userCount, 'person', 'people')}`}
    >
      <TouchableOpacity
        onPress={() =>
          navigation.navigate('UnitConversion', {
            foodId: missing.foodId,
            foodName: missing.foodName,
            baseUnit: missing.baseUnit,
            unit: missing.unit,
          })
        }
        className="self-start rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5"
      >
        <Text className="text-emerald-700 font-semibold text-sm">How much is 1 {missing.unit}?</Text>
      </TouchableOpacity>
    </TaskCard>
  );
}
