import React, { useState } from 'react';
import { Alert } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Apple } from 'lucide-react-native';
import { api, errorMessage } from '@/api/client';
import { EmptyState, ListGroup, LoadingState, Notice, SearchField } from '@/components/kit';
import { StackScreen } from '@/components/layout/StackScreen';
import { useAsync } from '@/hooks/useAsync';
import type { RootStackParamList } from '@/navigation/types';
import { FoodRow, matchesFood, perBase } from './FoodsScreen';

/** "Same as existing food": links a pending name to a food as an alias. */
export default function FoodPickerScreen() {
  const navigation = useNavigation();
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
    <StackScreen title="Same as existing food" subtitle={`Which food is "${params.aliasFor}"?`}>
      <SearchField value={q} onChangeText={setQ} placeholder="Search foods" autoFocus />
      {foods.error ? <Notice tone="danger">{foods.error}</Notice> : null}
      {!foods.data && foods.loading ? <LoadingState /> : null}
      {foods.data && list.length === 0 ? (
        <EmptyState icon={Apple} title="No matching foods" body="Go back and enter its values instead." />
      ) : null}
      {list.length > 0 ? (
        <ListGroup>
          {list.map(f => (
            <FoodRow key={f.id} food={f} subtitle={`per ${perBase(f.baseUnit)}`} onPress={() => choose(f.id, f.displayName)} />
          ))}
        </ListGroup>
      ) : null}
    </StackScreen>
  );
}
