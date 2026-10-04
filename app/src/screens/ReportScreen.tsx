import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { api } from '@/api/client';
import type { DayRange } from '@/api/types';
import { Banner, Bar, Button, Card, Header, Loading, Screen, ScrollBody, SectionTitle } from '@/components/ui';
import { deviceTimeZone } from '@/components/TimezoneField';
import { useAsync } from '@/hooks/useAsync';
import { useMeta } from '@/state/MetaContext';
import { colors } from '@/theme/colors';
import { addDays, localDateIn, weekStart } from '@/utils/dates';
import { formatNumber } from '@/utils/format';

/** Weekly totals and daily averages vs goals, computed from D1 (no AI, PLAN.md §12). */
export default function ReportScreen() {
  const navigation = useNavigation();
  const meta = useMeta();
  const today = localDateIn(deviceTimeZone());
  const [start, setStart] = useState(weekStart(today));
  const end = addDays(start, 6);
  const range = useAsync(() => api.getDays(start, end), [start]);
  useFocusEffect(
    useCallback(() => {
      range.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [start]),
  );

  return (
    <Screen>
      <Header
        title="This week"
        subtitle={`${start} – ${end}`}
        right={
          <View className="flex-row">
            <Pressable accessibilityLabel="Previous week" className="p-2" onPress={() => setStart(addDays(start, -7))}>
              <ChevronLeft color={colors.ink} size={22} />
            </Pressable>
            <Pressable accessibilityLabel="Next week" className="p-2" disabled={end >= today} onPress={() => setStart(addDays(start, 7))}>
              <ChevronRight color={end >= today ? colors.line : colors.ink} size={22} />
            </Pressable>
          </View>
        }
      />
      <ScrollBody refreshing={range.loading && !!range.data} onRefresh={range.reload}>
        {range.error ? <Banner tone="error">{range.error}</Banner> : null}
        {!range.data && range.loading ? <Loading /> : null}
        {range.data ? <Week data={range.data} today={today} nutrients={meta.nutrients} /> : null}
        <Button title="Edit daily goals" variant="secondary" className="mt-2" onPress={() => navigation.navigate('Goals')} />
      </ScrollBody>
    </Screen>
  );
}

function Week({ data, today, nutrients }: { data: DayRange; today: string; nutrients: { key: string; label: string; unit: string }[] }) {
  const logged = data.days.filter((d) => d.itemCount > 0 && d.date <= today);
  const pending = data.days.reduce((s, d) => s + d.pendingCount, 0);
  const maxCal = Math.max(1, ...data.days.map((d) => d.totals.calories?.value ?? 0), data.goals.calories ?? 0);

  return (
    <View>
      <Card>
        <Text className="mb-3 text-sm font-medium text-ink-soft">Calories per day</Text>
        <View className="h-36 flex-row items-end justify-between">
          {data.days.map((d) => {
            const v = d.totals.calories?.value ?? 0;
            return (
              <View key={d.date} className="flex-1 items-center">
                <Text className="mb-1 text-[10px] text-ink-muted">{v ? formatNumber(v) : ''}</Text>
                <View style={{ height: Math.max(2, (v / maxCal) * 100), backgroundColor: d.date > today ? colors.line : colors.brand }} className="w-5 rounded-md" />
                <Text className="mt-1 text-xs text-ink-soft">{new Date(`${d.date}T12:00:00Z`).toUTCString().slice(0, 2)}</Text>
              </View>
            );
          })}
        </View>
        <Text className="mt-3 text-xs text-ink-muted">
          {logged.length} of 7 days logged{pending ? ` · ${pending} item${pending === 1 ? '' : 's'} still unknown, not counted` : ''}
        </Text>
      </Card>

      <SectionTitle>Daily average on logged days</SectionTitle>
      <Card>
        {logged.length === 0 ? <Text className="text-sm text-ink-muted">Nothing logged this week yet.</Text> : null}
        {logged.length > 0
          ? nutrients.map((n) => {
              const total = logged.reduce((s, d) => s + (d.totals[n.key]?.value ?? 0), 0);
              const avg = total / logged.length;
              const goal = data.goals[n.key];
              if (!goal && avg === 0) return null;
              return (
                <View key={n.key} className="mb-3">
                  <View className="mb-1 flex-row justify-between">
                    <Text className="text-sm text-ink">{n.label}</Text>
                    <Text className="text-sm text-ink-soft">
                      {formatNumber(avg, n.unit === 'g' ? 1 : 0)}
                      {goal ? ` / ${formatNumber(goal)}` : ''} {n.unit}
                    </Text>
                  </View>
                  {goal ? <Bar progress={avg / goal} /> : null}
                </View>
              );
            })
          : null}
      </Card>
    </View>
  );
}
