import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, Plus, UtensilsCrossed } from 'lucide-react-native';
import { api } from '@/api/client';
import type { Food } from '@/api/types';
import AppBar from '@/components/common/AppBar';
import { EmptyState, LoadingState, Notice } from '@/components/common/Feedback';
import { NutrientSearchBar } from '@/components/nutrition-report/weekly-summary/FilterControls';
import { Text } from '@/components/ui/text';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { useAsync } from '@/hooks/useAsync';
import { tokens } from '@/theme/tokens';
import { formatNumber } from '@/utils/format';

export function matchesFood(f: Food, query: string): boolean {
  return !query || f.displayName.toLowerCase().includes(query) || f.aliases.some(a => a.includes(query));
}

export const perBase = (baseUnit: string) => (baseUnit.startsWith('100') ? baseUnit : `1 ${baseUnit}`);

/** One shared food, in the old habit list's row style. */
export function FoodRow({ food, onPress, subtitle }: { food: Food; onPress: () => void; subtitle?: string }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <HStack className="rounded-xl p-4 border-2 border-gray-200 items-center gap-4 bg-white">
        <View className="w-10 h-10 rounded-full bg-emerald-50 items-center justify-center">
          <UtensilsCrossed size={18} stroke={tokens.dashboard.green} strokeWidth={2.2} />
        </View>
        <VStack className="flex-1">
          <Text className="font-medium text-gray-900 mb-0.5">{food.displayName}</Text>
          <Text size="xs" className="text-gray-500">
            {subtitle ?? `${formatNumber(food.nutrients.calories ?? 0)} kcal per ${perBase(food.baseUnit)}`}
          </Text>
          {food.aliases.length ? (
            <Text size="xs" className="text-gray-400 mt-0.5" numberOfLines={1}>
              aka {food.aliases.join(', ')}
            </Text>
          ) : null}
        </VStack>
        <ChevronRight size={18} color={tokens.icon.muted} />
      </HStack>
    </TouchableOpacity>
  );
}

export default function FoodsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const foods = useAsync(() => api.listFoods(), []);
  useFocusEffect(
    useCallback(() => {
      foods.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );
  const query = q.trim().toLowerCase();
  const list = (foods.data ?? []).filter(f => matchesFood(f, query));

  return (
    <View className="flex-1">
      <AppBar
        title="Foods"
        subtitle={foods.data ? `${foods.data.length} shared foods` : 'Shared by everyone'}
        showProfileShortcut
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={foods.loading && !!foods.data} onRefresh={foods.reload} />}
      >
        <VStack className="p-6 gap-4">
          <NutrientSearchBar value={q} onChange={setQ} placeholder="Search foods and aliases" />
          {foods.error ? <Notice tone="error">{foods.error}</Notice> : null}
          {!foods.data && foods.loading ? <LoadingState color={tokens.dashboard.green} /> : null}
          {foods.data && list.length === 0 ? (
            <EmptyState title={query ? 'No match' : 'No foods yet'} body="Foods get added from the Uncached tab, or with +." />
          ) : null}
          {list.map(f => (
            <FoodRow key={f.id} food={f} onPress={() => navigation.navigate('FoodEditor', { foodId: f.id })} />
          ))}
        </VStack>
      </ScrollView>

      {/* Floating Action Button */}
      <TouchableOpacity
        accessibilityLabel="New food"
        onPress={() => navigation.navigate('FoodEditor', {})}
        className="absolute right-6 w-14 h-14 rounded-full bg-emerald-500 items-center justify-center"
        style={[styles.floatingButton, { bottom: 120 + insets.bottom }]}
      >
        <Plus size={28} color={tokens.icon.onAccent} strokeWidth={2.5} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  floatingButton: {
    shadowColor: tokens.icon.green,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
