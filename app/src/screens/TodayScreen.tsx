import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { CalendarCheck, ChevronLeft, ChevronRight, Plus, Utensils } from 'lucide-react-native';
import { api, errorMessage } from '@/api/client';
import type { DayMark, Item, Meal, Settings } from '@/api/types';
import { Button, EmptyState, Fab, IconButton, ListGroup, ListRow, LoadingState, Notice, SectionHeader, Text } from '@/components/kit';
import { HealthCard } from '@/components/health/HealthCard';
import { TabScreen } from '@/components/layout/TabScreen';
import { AddMenuSheet } from '@/components/today/AddMenuSheet';
import { CallbackCard } from '@/components/today/CallbackCard';
import { CheckinCard } from '@/components/today/CheckinCard';
import { DayStatusSheet } from '@/components/today/DayStatusSheet';
import { EditItemSheet } from '@/components/today/EditItemSheet';
import { IncompleteDayCard } from '@/components/today/IncompleteDayCard';
import { MealSection } from '@/components/today/MealSection';
import { NoListCallCard } from '@/components/today/NoListCallCard';
import { SummaryCard } from '@/components/today/SummaryCard';
import { useAsync } from '@/hooks/useAsync';
import { useHealthCard } from '@/hooks/useHealthCard';
import { usePendingCallback } from '@/hooks/usePendingCallback';
import { useProfileTimeZone, useToday } from '@/hooks/useToday';
import { strings, where } from '@/i18n/strings';
import type { TabParamList } from '@/navigation/types';
import { FEATURES } from '@/config/features';
import { useHealth } from '@/state/HealthContext';
import { applySchedule } from '@/services/calls/schedule';
import { useMeta } from '@/state/MetaContext';
import { addDays, dayHeading } from '@/utils/dates';

const MEAL_ORDER: (Meal | null)[] = ['breakfast', 'lunch', 'snack', 'dinner', null];

export default function TodayScreen() {
  const navigation = useNavigation();
  const meta = useMeta();
  const health = useHealth();
  const healthCard = useHealthCard();
  const settings = useAsync(() => api.getSettings(), []);
  const today = useToday();
  const pendingCallback = usePendingCallback(useProfileTimeZone());
  const route = useRoute<RouteProp<TabParamList, 'Today'>>();
  const [date, setDate] = useState<string | null>(null);
  const shown = date ?? today;
  const [editing, setEditing] = useState<Item | null>(null);
  const [addMenu, setAddMenu] = useState(false);
  const [markSheet, setMarkSheet] = useState(false);

  // An insight about a day ("Thursday looks incomplete") opens this screen on that day.
  const requested = route.params?.date;
  useEffect(() => {
    if (requested && requested <= today) setDate(requested);
  }, [requested, today]);

  const day = useAsync(() => api.getDay(shown), [shown, health.revision]);
  useFocusEffect(
    useCallback(() => {
      day.reload();
      settings.reload();
      health.refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shown, health.refresh]),
  );

  const units = useMemo(() => Object.fromEntries(meta.nutrients.map(n => [n.key, n.unit])), [meta]);
  const kinds = useMemo(() => Object.fromEntries(meta.nutrients.map(n => [n.key, n.kind])), [meta]);
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
  // The calorie target comes from the day itself: the person's, a typed number, or the general reference. A profile
  // without personal targets has none, and the card shows amounts only.
  const target = day.data?.goals.calories ?? null;
  const targetIsReference = health.mode === 'generic' && !day.data?.customGoals?.includes('calories');
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
  // A past day the weekly figures leave out because very little is logged: ask whether that is everything (plan 7.2). A day that
  // is incomplete because its foods are unknown has the Pending notice instead, and one the person marked has their mark.
  // Off for now with the rest of day marking (config/features.ts): the question has no answer while nothing can be marked.
  const looksIncomplete =
    FEATURES.dayCompletion &&
    !!day.data &&
    shown < today &&
    day.data.dayState?.state === 'partial' &&
    day.data.dayState.reason === 'low';

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

  const mark = async (status: DayMark | null) => {
    setMarkSheet(false);
    try {
      if (status) await api.setDayStatus(shown, status);
      else await api.clearDayStatus(shown);
      day.reload();
    } catch (e) {
      Alert.alert('Could not save', errorMessage(e));
    }
  };

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

        {day.data && health.numbersHidden ? (
          <Notice tone="info" title={strings.lowPressure.todayTitle} testID="numbers-hidden-note">
            {strings.lowPressure.todayBody}
          </Notice>
        ) : null}
        {day.data && !health.numbersHidden ? (
          <SummaryCard
            consumed={consumed}
            target={target}
            targetIsReference={targetIsReference}
            totals={day.data.totals}
            itemCount={day.data.items.length}
            goals={day.data.goals}
            units={units}
            kinds={kinds}
            nutrients={meta.nutrients}
            onOpenNutrient={key => navigation.navigate('NutrientBreakdown', { nutrient: key, from: shown, to: shown, origin: 'today' })}
          />
        ) : null}

        {looksIncomplete ? (
          <IncompleteDayCard
            kcal={consumed}
            numbersHidden={health.numbersHidden}
            onComplete={() => mark('complete')}
            onLeaveOut={() => mark('skip')}
          />
        ) : null}

        {FEATURES.dayCompletion && day.data ? (
          <ListGroup>
            <ListRow
              testID="mark-day"
              icon={CalendarCheck}
              title={strings.day.mark}
              value={day.data.status ? strings.day.marked[day.data.status] : undefined}
              onPress={() => setMarkSheet(true)}
            />
          </ListGroup>
        ) : null}

        {healthCard.visible ? (
          <HealthCard
            onStart={() => navigation.navigate('HealthIntro')}
            onDismiss={healthCard.dismiss}
          />
        ) : null}

        {/* items waiting on food values / a unit conversion */}
        {day.data && day.data.pendingCount > 0 ? (
          <Notice
            tone="warning"
            title={`${day.data.pendingCount} item${day.data.pendingCount === 1 ? '' : 's'} waiting for values`}
            action={{ label: 'Open Pending', onPress: () => navigation.navigate('Main', { screen: 'Uncached' }) }}
          >
            {where.pendingNotice}
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

        {pendingCallback.described ? (
          <CallbackCard
            clock={pendingCallback.described.clock}
            inWords={pendingCallback.described.inWords}
            onCancel={() => pendingCallback.cancel().catch(() => Alert.alert(strings.callback.cancelFailed))}
          />
        ) : null}

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
                  numbersHidden={health.numbersHidden}
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
        numbersHidden={health.numbersHidden}
      />
      {FEATURES.dayCompletion ? (
        <DayStatusSheet visible={markSheet} onClose={() => setMarkSheet(false)} current={day.data?.status ?? null} onChange={mark} />
      ) : null}
      <AddMenuSheet
        visible={addMenu}
        onClose={() => setAddMenu(false)}
        onVoice={() => navigation.navigate('VoiceCall', { kind: 'manual', autoStart: true })}
        onManual={() => navigation.navigate('AddItems', { date: shown })}
      />
    </>
  );
}
