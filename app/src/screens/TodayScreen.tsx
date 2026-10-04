import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ChevronLeft, ChevronRight, Mic, Plus } from 'lucide-react-native';
import { api } from '@/api/client';
import type { CallInfo, Day, Item, Meal } from '@/api/types';
import { Banner, Bar, Button, Card, Empty, Header, Loading, Ring, Screen, ScrollBody, SectionTitle } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { useMeta } from '@/state/MetaContext';
import { colors } from '@/theme/colors';
import { addDays, formatDay, localDateIn } from '@/utils/dates';
import { capitalize, formatNumber, formatQuantity } from '@/utils/format';
import { deviceTimeZone } from '@/components/TimezoneField';

const MEAL_ORDER: (Meal | null)[] = ['breakfast', 'lunch', 'snack', 'dinner', null];
const MACROS = ['protein', 'carbs', 'fat', 'fiber', 'sugar', 'sodium'];

export default function TodayScreen() {
  const navigation = useNavigation();
  const meta = useMeta();
  const settings = useAsync(() => api.getSettings(), []);
  const tz = settings.data?.timezone ?? deviceTimeZone();
  const today = localDateIn(tz);
  const [date, setDate] = useState<string | null>(null);
  const shown = date ?? today;

  const day = useAsync(() => api.getDay(shown), [shown]);
  useFocusEffect(
    useCallback(() => {
      day.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shown]),
  );

  const units = useMemo(() => Object.fromEntries(meta.nutrients.map((n) => [n.key, n])), [meta]);

  return (
    <Screen>
      <Header
        title={formatDay(shown, today)}
        subtitle={shown}
        right={
          <View className="flex-row items-center">
            <IconButton label="Previous day" onPress={() => setDate(addDays(shown, -1))}>
              <ChevronLeft color={colors.ink} size={22} />
            </IconButton>
            <IconButton label="Next day" disabled={shown >= today} onPress={() => setDate(addDays(shown, 1))}>
              <ChevronRight color={shown >= today ? colors.line : colors.ink} size={22} />
            </IconButton>
          </View>
        }
      />
      <ScrollBody refreshing={day.loading && !!day.data} onRefresh={day.reload}>
        {day.error ? <Banner tone="error">{day.error}</Banner> : null}
        {!day.data && day.loading ? <Loading /> : null}
        {day.data ? (
          <DayBody day={day.data} units={units} onOpenItem={(item) => navigation.navigate('EditItem', { item })} />
        ) : null}

        <View className="mt-4 flex-row">
          <Button
            title="Add food"
            variant="secondary"
            icon={<Plus color={colors.brand} size={18} />}
            className="mr-2 flex-1"
            onPress={() => navigation.navigate('AddItems', { date: shown })}
            testID="add-food"
          />
          <Button
            title="Talk now"
            icon={<Mic color={colors.white} size={18} />}
            className="flex-1"
            onPress={() => navigation.navigate('VoiceCall', { kind: 'manual', autoStart: true })}
            testID="talk-now"
          />
        </View>
      </ScrollBody>
    </Screen>
  );
}

function IconButton({ children, onPress, label, disabled }: { children: React.ReactNode; onPress: () => void; label: string; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} className="ml-1 rounded-full p-2">
      {children}
    </Pressable>
  );
}

function DayBody({
  day,
  units,
  onOpenItem,
}: {
  day: Day;
  units: Record<string, { label: string; unit: string }>;
  onOpenItem: (item: Item) => void;
}) {
  const navigation = useNavigation();
  const cal = day.totals.calories;
  const calGoal = day.goals.calories ?? 0;
  const noList = day.calls.filter((c) => c.status === 'no_list');
  const failed = day.calls.filter((c) => c.status === 'failed');

  return (
    <View>
      <Card>
        <View className="flex-row items-center">
          <Ring progress={calGoal ? (cal?.value ?? 0) / calGoal : 0}>
            <Text className="text-2xl font-bold text-ink">{formatNumber(cal?.value ?? 0)}</Text>
            <Text className="text-xs text-ink-muted">{calGoal ? `of ${formatNumber(calGoal)} kcal` : 'kcal'}</Text>
          </Ring>
          <View className="ml-4 flex-1">
            {MACROS.slice(0, 3).map((k) => (
              <MacroLine key={k} k={k} day={day} units={units} />
            ))}
          </View>
        </View>
        <View className="mt-3">
          {MACROS.slice(3).map((k) => (
            <MacroLine key={k} k={k} day={day} units={units} />
          ))}
        </View>
        {cal && cal.missingItems > 0 ? (
          <Text className="mt-1 text-xs text-ink-muted">
            {cal.missingItems} item{cal.missingItems === 1 ? '' : 's'} not counted yet (no food values).
          </Text>
        ) : null}
      </Card>

      {day.pendingCount > 0 ? (
        <Banner
          tone="warn"
          action={<Button small variant="ghost" title="Open Uncached" onPress={() => navigation.navigate('Main', { screen: 'Uncached' } as never)} />}
        >
          {day.pendingCount} item{day.pendingCount === 1 ? ' is' : 's are'} waiting for food values or a unit conversion. Anyone can fill them in from
          Uncached, and they'll count here automatically.
        </Banner>
      ) : null}

      {noList.map((c) => (
        <NoListCall key={c.id} call={c} date={day.date} />
      ))}
      {failed.map((c) => (
        <Banner key={c.id} tone="error">
          Call failed: {c.error ?? c.endedReason ?? 'unknown error'}
        </Banner>
      ))}

      {day.items.length === 0 ? (
        <Empty title="Nothing logged yet" body="Your daily call will fill this in, or add food yourself." />
      ) : (
        MEAL_ORDER.map((meal) => {
          const items = day.items.filter((i) => i.meal === meal);
          if (items.length === 0) return null;
          const kcal = items.reduce((s, i) => s + (i.nutrients.calories ?? 0), 0);
          return (
            <View key={meal ?? 'other'}>
              <SectionTitle right={<Text className="text-xs text-ink-muted">{formatNumber(kcal)} kcal</Text>}>
                {meal ? capitalize(meal) : 'Other'}
              </SectionTitle>
              <Card className="py-1">
                {items.map((item, idx) => (
                  <ItemRow key={item.id} item={item} last={idx === items.length - 1} onPress={() => onOpenItem(item)} />
                ))}
              </Card>
            </View>
          );
        })
      )}
    </View>
  );
}

function MacroLine({ k, day, units }: { k: string; day: Day; units: Record<string, { label: string; unit: string }> }) {
  const total = day.totals[k];
  const goal = day.goals[k];
  const info = units[k];
  if (!total || !info) return null;
  return (
    <View className="mb-2">
      <View className="mb-1 flex-row justify-between">
        <Text className="text-xs font-medium text-ink-soft">{info.label}</Text>
        <Text className="text-xs text-ink-muted">
          {formatNumber(total.value)}
          {goal ? ` / ${formatNumber(goal)}` : ''} {info.unit}
        </Text>
      </View>
      <Bar progress={goal ? total.value / goal : 0} />
    </View>
  );
}

export function ItemRow({ item, onPress, last }: { item: Item; onPress?: () => void; last?: boolean }) {
  const pending = item.status !== 'resolved';
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className={`flex-row items-center py-3 ${last ? '' : 'border-b border-line-soft'}`}>
      <View className="flex-1 pr-3">
        <Text className="text-base text-ink">{item.rawName}</Text>
        <Text className="mt-0.5 text-sm text-ink-soft">
          {formatQuantity(item.quantity, item.unit)}
          {item.foodName && item.foodName.toLowerCase() !== item.rawName.toLowerCase() ? ` · ${item.foodName}` : ''}
        </Text>
      </View>
      {pending ? (
        <View className="rounded-full bg-warn-soft px-2.5 py-1">
          <Text className="text-xs font-medium text-warn">{item.status === 'pending_food' ? 'Unknown food' : 'Unknown unit'}</Text>
        </View>
      ) : (
        <Text className="text-base font-semibold text-ink">{formatNumber(item.nutrients.calories ?? 0)} kcal</Text>
      )}
    </Pressable>
  );
}

function NoListCall({ call, date }: { call: CallInfo; date: string }) {
  const navigation = useNavigation();
  const [open, setOpen] = useState(false);
  const time = new Date(call.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <Card className="border-warn/40">
      <Text className="text-base font-semibold text-ink">Call at {time} ended without a food list</Text>
      <Text className="mt-1 text-sm text-ink-soft">Nothing was saved from this call. You can add what you ate yourself.</Text>
      {call.transcript ? (
        <Pressable onPress={() => setOpen(!open)} className="mt-2">
          <Text className="text-sm font-medium text-brand">{open ? 'Hide transcript' : 'Show transcript'}</Text>
          {open ? <Text className="mt-2 text-sm leading-5 text-ink-soft">{call.transcript}</Text> : null}
        </Pressable>
      ) : null}
      <Button small title="Add items" variant="secondary" className="mt-3 self-start" onPress={() => navigation.navigate('AddItems', { date, callId: call.id })} />
    </Card>
  );
}
