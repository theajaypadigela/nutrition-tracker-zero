import React, { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Plus } from 'lucide-react-native';
import { api } from '@/api/client';
import { Banner, Button, Card, Empty, Field, Header, Loading, Row, Screen, ScrollBody } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { colors } from '@/theme/colors';
import { formatNumber } from '@/utils/format';

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
  const list = (foods.data ?? []).filter(
    (f) => !query || f.displayName.toLowerCase().includes(query) || f.aliases.some((a) => a.includes(query)),
  );

  return (
    <Screen>
      <Header
        title="Foods"
        subtitle={foods.data ? `${foods.data.length} shared foods` : 'Shared by everyone'}
        right={<Button small title="New" icon={<Plus color={colors.white} size={16} />} onPress={() => navigation.navigate('FoodEditor', {})} />}
      />
      <ScrollBody refreshing={foods.loading && !!foods.data} onRefresh={foods.reload}>
        <Field value={q} onChangeText={setQ} placeholder="Search foods and aliases" />
        {foods.error ? <Banner tone="error">{foods.error}</Banner> : null}
        {!foods.data && foods.loading ? <Loading /> : null}
        {foods.data && list.length === 0 ? (
          <Empty title={query ? 'No match' : 'No foods yet'} body="Foods get added from the Uncached tab, or with New." />
        ) : null}
        {list.length > 0 ? (
          <Card className="py-1">
            {list.map((f, i) => (
              <Row
                key={f.id}
                title={f.displayName}
                subtitle={`${formatNumber(f.nutrients.calories ?? 0)} kcal per ${f.baseUnit.startsWith('100') ? f.baseUnit : `1 ${f.baseUnit}`}${f.aliases.length ? ` · aka ${f.aliases.join(', ')}` : ''}`}
                onPress={() => navigation.navigate('FoodEditor', { foodId: f.id })}
                last={i === list.length - 1}
              />
            ))}
          </Card>
        ) : null}
      </ScrollBody>
    </Screen>
  );
}
