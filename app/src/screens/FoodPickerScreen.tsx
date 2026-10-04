import React, { useState } from 'react';
import { Alert, Text } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { api, errorMessage } from '@/api/client';
import { Banner, Card, Empty, Field, Loading, Row, Screen, ScrollBody } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import type { RootStackParamList } from '@/navigation/types';

/** "Same as existing food": links a pending name to a food as an alias. */
export default function FoodPickerScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<RootStackParamList, 'FoodPicker'>>();
  const [q, setQ] = useState('');
  const foods = useAsync(() => api.listFoods(), []);
  const query = q.trim().toLowerCase();
  const list = (foods.data ?? []).filter(
    (f) => !query || f.displayName.toLowerCase().includes(query) || f.aliases.some((a) => a.includes(query)),
  );

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
    <Screen edges={['bottom']}>
      <ScrollBody>
        <Text className="mb-3 mt-2 text-sm text-ink-soft">Which food is "{params.aliasFor}"?</Text>
        <Field value={q} onChangeText={setQ} placeholder="Search foods" autoFocus />
        {foods.error ? <Banner tone="error">{foods.error}</Banner> : null}
        {!foods.data && foods.loading ? <Loading /> : null}
        {foods.data && list.length === 0 ? <Empty title="No matching foods" body="Go back and enter its values instead." /> : null}
        {list.length > 0 ? (
          <Card className="py-1">
            {list.map((f, i) => (
              <Row key={f.id} title={f.displayName} subtitle={`per ${f.baseUnit}`} onPress={() => choose(f.id, f.displayName)} last={i === list.length - 1} />
            ))}
          </Card>
        ) : null}
      </ScrollBody>
    </Screen>
  );
}
