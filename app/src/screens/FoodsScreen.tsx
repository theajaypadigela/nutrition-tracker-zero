import React, { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Apple, ChevronRight, Plus } from 'lucide-react-native';
import { api } from '@/api/client';
import type { Food } from '@/api/types';
import { EmptyState, Fab, Icon, ListGroup, LoadingState, Notice, SearchField, Text } from '@/components/kit';
import { TabScreen } from '@/components/layout/TabScreen';
import { useAsync } from '@/hooks/useAsync';
import { createStyles, space, useTheme } from '@/theme';
import { formatNumber } from '@/utils/format';

export function matchesFood(f: Food, query: string): boolean {
  return !query || f.displayName.toLowerCase().includes(query) || f.aliases.some(a => a.includes(query));
}

export const perBase = (baseUnit: string) => (baseUnit.startsWith('100') ? baseUnit : `1 ${baseUnit}`);

const useRowStyles = createStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, paddingHorizontal: space.lg, paddingVertical: space.md },
  body: { flex: 1, minWidth: 0, gap: 2 },
}));

/** One shared food as a row of a ListGroup: name, what its values are per, and its other names. */
export function FoodRow({ food, onPress, subtitle }: { food: Food; onPress: () => void; subtitle?: string }) {
  const { colors } = useTheme();
  const styles = useRowStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={food.displayName}
      android_ripple={{ color: colors.ripple }}
      style={styles.row}
    >
      <View style={styles.body}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {food.displayName}
        </Text>
        <Text variant="small" tone="secondary" numberOfLines={1}>
          {subtitle ?? `${formatNumber(food.nutrients.calories ?? 0)} kcal per ${perBase(food.baseUnit)}`}
        </Text>
        {food.aliases.length ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            Also called {food.aliases.join(', ')}
          </Text>
        ) : null}
      </View>
      <Icon as={ChevronRight} size="sm" tone="faint" />
    </Pressable>
  );
}

/** The shared foods table everyone's logs are counted from. */
export default function FoodsScreen() {
  const navigation = useNavigation();
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
    <TabScreen
      title="Foods"
      subtitle={foods.data ? `${foods.data.length} shared food${foods.data.length === 1 ? '' : 's'}` : 'Shared by everyone'}
      refreshing={foods.loading && !!foods.data}
      onRefresh={foods.reload}
      fab={<Fab icon={Plus} label="New food" onPress={() => navigation.navigate('FoodEditor', {})} />}
    >
      <SearchField value={q} onChangeText={setQ} placeholder="Search foods and aliases" />
      {foods.error ? <Notice tone="danger">{foods.error}</Notice> : null}
      {!foods.data && foods.loading ? <LoadingState /> : null}
      {foods.data && list.length === 0 ? (
        <EmptyState
          icon={Apple}
          title={query ? 'No match' : 'No foods yet'}
          body={query ? 'Try another name.' : 'Foods get added from the Pending tab, or with +.'}
        />
      ) : null}
      {list.length > 0 ? (
        <ListGroup>
          {list.map(f => (
            <FoodRow key={f.id} food={f} onPress={() => navigation.navigate('FoodEditor', { foodId: f.id })} />
          ))}
        </ListGroup>
      ) : null}
    </TabScreen>
  );
}
