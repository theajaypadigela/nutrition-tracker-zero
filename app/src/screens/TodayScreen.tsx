import React, { useCallback, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ChevronLeft, ChevronRight, Plus, Utensils } from 'lucide-react-native';
import { api, errorMessage } from '@/api/client';
import type { Item, Meal, Settings } from '@/api/types';
import { Button, EmptyState, Fab, IconButton, LoadingState, Notice, SectionHeader, Text } from '@/components/kit';
import { TabScreen } from '@/components/layout/TabScreen';
import { deviceTimeZone } from '@/components/TimezoneField';
import { AddMenuSheet } from '@/components/today/AddMenuSheet';
import { CheckinCard } from '@/components/today/CheckinCard';
import { EditItemSheet } from '@/components/today/EditItemSheet';
import { MealSection } from '@/components/today/MealSection';
import { NoListCallCard } from '@/components/today/NoListCallCard';
import { SummaryCard } from '@/components/today/SummaryCard';
import { useAsync } from '@/hooks/useAsync';
import { applySchedule } from '@/services/calls/schedule';
import { useMeta } from '@/state/MetaContext';
import { addDays, dayHeading, localDateIn } from '@/utils/dates';

const MEAL_ORDER: (Meal | null)[] = ['breakfast', 'lunch', 'snack', 'dinner', null];
const DEFAULT_TARGET_CALORIES = 2500;

export default function TodayScreen() {
  const navigation = useNavigation();
  const meta = useMeta();
  const settings = useAsync(() => api.getSettings(), []);
  const tz = settings.data?.timezone ?? deviceTimeZone();
  const today = localDateIn(tz);
  const [date, setDate] = useState<string | null>(null);
  const shown = date ?? today;
  const [editing, setEditing] = useState<Item | null>(null);
  const [addMenu, setAddMenu] = useState(false);

  const day = useAsync(() => api.getDay(shown), [shown]);
  useFocusEffect(
    useCallback(() => {
      day.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shown]),
  );

  const units = useMemo(() => Object.fromEntries(meta.nutrients.map(n => [n.key, n.unit])), [meta]);
  const groups = useMemo(
    () =>
      MEAL_ORDER.map(meal => ({
        meal,
        key: meal ?? 'other',
        items: (day.data?.items ?? []).filter(i => i.meal === meal),
      })).filter(g => g.items.length > 0),
    [day.data],
  );

  const consumed = day.data?.totals.calories?.value ?? 0;
  const target = day.data?.goals.calories ?? DEFAULT_TARGET_CALORIES;
  const noList = day.data?.calls.filter(c => c.status === 'no_list') ?? [];
  // The same failure on two calls is one message, not two banners.
  const failed = useMemo(() => {
    const byMessage = new Map<string, number>();
    for (const c of day.data?.calls ?? []) {
      if (c.status !== 'failed') continue;
      const message = c.error ?? c.endedReason ?? 'unknown error';
      byMessage.set(message, (byMessage.get(message) ?? 0) + 1);
    }
    return [...byMessage.entries()];
  }, [day.data]);
  const itemCount = day.data?.items.length ?? 0;

  const saveCallSettings = async (patch: Partial<Pick<Settings, 'callTime' | 'callEnabled'>>) => {
    try {
      const next = await api.updateSettings(patch);
      settings.setData(next);
      await applySchedule(next);
      return true;
    } catch {
      return false;
    }
  };

  const confirmDelete = (item: Item) =>
    Alert.alert('Delete this item?', item.rawName, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteItem(item.id);
            day.reload();
          } catch (e) {
            Alert.alert('Could not delete', errorMessage(e));
          }
        },
      },
    ]);

  const heading = dayHeading(shown, today);

  return (
    <>
      <TabScreen
        title={heading.title}
        subtitle={heading.subtitle}
        headerActions={
          <>
            <IconButton
              icon={ChevronLeft}
              accessibilityLabel="Previous day"
              variant="outline"
              onPress={() => setDate(addDays(shown, -1))}
            />
            <IconButton
              icon={ChevronRight}
              accessibilityLabel="Next day"
              variant="outline"
              disabled={shown >= today}
              onPress={() => setDate(addDays(shown, 1))}
            />
          </>
        }
        refreshing={day.loading && !!day.data}
        onRefresh={day.reload}
        fab={<Fab testID="add-fab" icon={Plus} label="Add food" onPress={() => setAddMenu(true)} />}
      >
        {day.error ? <Notice tone="danger">{day.error}</Notice> : null}
        {!day.data && day.loading ? <LoadingState /> : null}

        {day.data ? (
          <SummaryCard consumed={consumed} target={target} totals={day.data.totals} goals={day.data.goals} units={units} />
        ) : null}

        {/* items waiting on food values / a unit conversion */}
        {day.data && day.data.pendingCount > 0 ? (
          <Notice
            tone="warning"
            title={`${day.data.pendingCount} item${day.data.pendingCount === 1 ? '' : 's'} waiting for values`}
            action={{ label: 'Open Pending', onPress: () => navigation.navigate('Main', { screen: 'Uncached' }) }}
          >
            Once someone fills in the food values or unit conversion, they count here automatically.
          </Notice>
        ) : null}

        {failed.map(([message, count]) => (
          <Notice
            key={message}
            tone="danger"
            title={count > 1 ? `Call failed (${count} times)` : 'Call failed'}
            action={/key/i.test(message) ? { label: 'Check the Vapi key', onPress: () => navigation.navigate('Settings') } : undefined}
          >
            {message}
          </Notice>
        ))}

        {noList.map(c => (
          <NoListCallCard key={c.id} call={c} date={shown} />
        ))}

        {settings.data ? (
          <CheckinCard
            callTime={settings.data.callTime}
            callEnabled={settings.data.callEnabled}
            timezone={settings.data.timezone}
            onSave={saveCallSettings}
          />
        ) : null}

        {day.data ? (
          <>
            <SectionHeader
              title="Meals"
              right={
                itemCount > 0 ? (
                  <Text variant="small" tone="muted">
                    {itemCount} item{itemCount === 1 ? '' : 's'}
                  </Text>
                ) : null
              }
            />
            {groups.length === 0 ? (
              <EmptyState
                icon={Utensils}
                title="Nothing logged yet"
                body="Your daily call will fill this in, or add food yourself."
                action={<Button label="Add food" icon={Plus} variant="soft" onPress={() => setAddMenu(true)} />}
              />
            ) : (
              groups.map(g => (
                <MealSection
                  key={g.key}
                  meal={g.meal}
                  items={g.items}
                  onEdit={setEditing}
                  onAdd={meal => navigation.navigate('AddItems', { date: shown, meal })}
                />
              ))
            )}
          </>
        ) : null}
      </TabScreen>

      <EditItemSheet
        item={editing}
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        onSaved={day.reload}
        onDelete={confirmDelete}
      />
      <AddMenuSheet
        visible={addMenu}
        onClose={() => setAddMenu(false)}
        onVoice={() => navigation.navigate('VoiceCall', { kind: 'manual', autoStart: true })}
        onManual={() => navigation.navigate('AddItems', { date: shown })}
      />
    </>
  );
}
