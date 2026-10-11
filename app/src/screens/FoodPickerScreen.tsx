import React, { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, errorMessage } from '@/api/client';
import AppBar from '@/components/common/AppBar';
import { EmptyState, LoadingState, Notice } from '@/components/common/Feedback';
import { NutrientSearchBar } from '@/components/nutrition-report/weekly-summary/FilterControls';
import { VStack } from '@/components/ui/vstack';
import { useAsync } from '@/hooks/useAsync';
import type { RootStackParamList } from '@/navigation/types';
import { tokens } from '@/theme/tokens';
import { FoodRow, matchesFood, perBase } from './FoodsScreen';

/** "Same as existing food": links a pending name to a food as an alias. */
export default function FoodPickerScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { params } = useRoute<RouteProp<RootStackParamList, 'FoodPicker'>>();
  const [q, setQ] = useState('');
  const foods = useAsync(() => api.listFoods(), []);
  const query = q.trim().toLowerCase();
  const list = (foods.data ?? []).filter(f => matchesFood(f, query));

  const choose = (id: string, name: string) =>
    Alert.alert(`Count "${params.aliasFor}" as ${name}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Link',
        onPress: async () => {
          try {
            const res = await api.addAlias(id, params.aliasFor);
            Alert.alert('Linked', `${res.resolvedCount} item${res.resolvedCount === 1 ? '' : 's'} resolved.`);
            navigation.goBack();
          } catch (e) {
            Alert.alert('Could not link', errorMessage(e));
          }
        },
      },
    ]);

  return (
    <View className="flex-1">
      <AppBar title="Same as existing food" subtitle={`Which food is "${params.aliasFor}"?`} variant="secondary" showBackButton />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}>
        <VStack className="p-6 gap-4">
          <NutrientSearchBar value={q} onChange={setQ} placeholder="Search foods" autoFocus />
          {foods.error ? <Notice tone="error">{foods.error}</Notice> : null}
          {!foods.data && foods.loading ? <LoadingState color={tokens.dashboard.green} /> : null}
          {foods.data && list.length === 0 ? (
            <EmptyState title="No matching foods" body="Go back and enter its values instead." />
          ) : null}
          {list.map(f => (
            <FoodRow key={f.id} food={f} subtitle={`per ${perBase(f.baseUnit)}`} onPress={() => choose(f.id, f.displayName)} />
          ))}
        </VStack>
      </ScrollView>
    </View>
  );
}
