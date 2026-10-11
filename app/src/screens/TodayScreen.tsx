import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Platform, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertCircle, AlertTriangle, Mic, PhoneMissed, Plus } from 'lucide-react-native';
import { api, errorMessage } from '@/api/client';
import type { CallInfo, Item, Meal, Settings } from '@/api/types';
import { Text } from '@/components/ui/text';
import { FocusAwareStatusBar, LoadingState, Notice } from '@/components/common/Feedback';
import { initialsOf } from '@/components/common/AppBar';
import { FoodLogHeader } from '@/components/food-log/FoodLogHeader';
import { CheckinCard } from '@/components/food-log/CheckinCard';
import { MacrosCard } from '@/components/food-log/MacrosCard';
import { MealGroup } from '@/components/food-log/MealGroup';
import { EditFoodDrawer } from '@/components/food-log/EditFoodDrawer';
import { deviceTimeZone } from '@/components/TimezoneField';
import { useAsync } from '@/hooks/useAsync';
import { applySchedule } from '@/services/calls/schedule';
import { useMeta } from '@/state/MetaContext';
import { useProfile } from '@/state/ProfileContext';
import { tokens } from '@/theme/tokens';
import { addDays, formatDay, localDateIn } from '@/utils/dates';

const MEAL_ORDER: (Meal | null)[] = ['breakfast', 'lunch', 'snack', 'dinner', null];
const DEFAULT_TARGET_CALORIES = 2500;
/** Room for the floating tab bar under the last card. */
const TAB_BAR_CLEARANCE = 120;

/** "Today · Saturday, Oct 4" */
function formatDateLabel(date: string, today: string): string {
  const long = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const relative = formatDay(date, today);
  return relative === 'Today' || relative === 'Yesterday' ? `${relative} · ${long}` : long;
}

export default function TodayScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const meta = useMeta();
  const { profile } = useProfile();
  const settings = useAsync(() => api.getSettings(), []);
  const tz = settings.data?.timezone ?? deviceTimeZone();
  const today = localDateIn(tz);
  const [date, setDate] = useState<string | null>(null);
  const shown = date ?? today;
  const [expandedMeal, setExpandedMeal] = useState<string | null | undefined>(undefined);
  const [editing, setEditing] = useState<Item | null>(null);

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
      MEAL_ORDER.map(meal => ({ meal, key: meal ?? 'other', items: (day.data?.items ?? []).filter(i => i.meal === meal) })).filter(
        g => g.items.length > 0,
      ),
    [day.data],
  );
  // Like the old log, one meal is open at a time; until the user picks, open the first one.
  const openKey = expandedMeal === undefined ? groups[0]?.key ?? null : expandedMeal;

  const consumed = day.data?.totals.calories?.value ?? 0;
  const target = day.data?.goals.calories ?? DEFAULT_TARGET_CALORIES;
  const noList = day.data?.calls.filter(c => c.status === 'no_list') ?? [];
  const failed = day.data?.calls.filter(c => c.status === 'failed') ?? [];

  const goToDay = (next: string) => {
    setDate(next);
    setExpandedMeal(undefined);
  };

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

  return (
    <View style={styles.root}>
      <FocusAwareStatusBar barStyle="light-content" />
      {/* green gradient header */}
      <FoodLogHeader
        dateLabel={formatDateLabel(shown, today)}
        consumed={consumed}
        target={target}
        onPrevDay={() => goToDay(addDays(shown, -1))}
        onNextDay={() => goToDay(addDays(shown, 1))}
        nextDisabled={shown >= today}
        profileInitials={initialsOf(profile?.name)}
        onProfilePress={() => navigation.navigate('Settings')}
      />

      {/* content scrolls up over the header bottom */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: TAB_BAR_CLEARANCE + insets.bottom + 60 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={day.loading && !!day.data} onRefresh={day.reload} />}
      >
        {day.error ? <Notice tone="error">{day.error}</Notice> : null}

        {/* items waiting on food values / a unit conversion */}
        {day.data && day.data.pendingCount > 0 ? (
          <View style={styles.staleBanner}>
            <AlertCircle size={16} color={tokens.foodLog.staleIcon} strokeWidth={2} />
            <View style={{ flex: 1 }}>
              <Text style={styles.staleText}>
                <Text style={styles.staleStrong}>
                  {day.data.pendingCount} item{day.data.pendingCount === 1 ? ' is' : 's are'} waiting
                </Text>{' '}
                for food values or a unit conversion. Anyone can fill them in from Uncached, and they'll count here
                automatically.
              </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Main', { screen: 'Uncached' })} hitSlop={8}>
                <Text style={styles.staleLink}>Open Uncached ›</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {failed.map(c => (
          <View key={c.id} style={styles.failedBanner}>
            <AlertTriangle size={16} color={tokens.foodLog.low} strokeWidth={2} />
            <Text style={styles.failedText}>Call failed: {c.error ?? c.endedReason ?? 'unknown error'}</Text>
          </View>
        ))}

        {noList.map(c => (
          <NoListCall key={c.id} call={c} date={shown} />
        ))}

        {/* AI check-in card — the daily call's time + enable switch */}
        {settings.data ? (
          <CheckinCard
            callTime={settings.data.callTime}
            callEnabled={settings.data.callEnabled}
            timezone={settings.data.timezone}
            onSave={saveCallSettings}
          />
        ) : null}

        {/* macros card */}
        {day.data ? (
          <MacrosCard
            totals={day.data.totals}
            dailyGoals={day.data.goals}
            units={units}
            subtitle={shown === today ? 'Today vs goal' : 'Day vs goal'}
          />
        ) : null}

        {/* meals section header */}
        <View style={styles.mealsHeader}>
          <Text style={styles.mealsTitle}>{shown === today ? "Today's meals" : 'Meals'}</Text>
          <Text style={styles.mealsCal}>
            {Math.round(consumed)} / {target} cal
          </Text>
        </View>

        {!day.data && day.loading ? <LoadingState color={tokens.foodLog.green} /> : null}

        {day.data && groups.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Nothing logged yet</Text>
            <Text style={styles.emptyBody}>Your daily call will fill this in, or add food yourself.</Text>
          </View>
        ) : null}

        {/* meal groups */}
        <View style={styles.mealList}>
          {groups.map(g => (
            <MealGroup
              key={g.key}
              meal={g.meal}
              items={g.items}
              isExpanded={openKey === g.key}
              onToggleExpand={() => setExpandedMeal(openKey === g.key ? null : g.key)}
              onEdit={setEditing}
              onDelete={confirmDelete}
              onAdd={meal => navigation.navigate('AddItems', { date: shown, meal })}
            />
          ))}
        </View>
      </ScrollView>

      <EditFoodDrawer item={editing} isOpen={!!editing} onClose={() => setEditing(null)} onSaved={day.reload} />

      {/* voice FAB */}
      <TouchableOpacity
        testID="talk-now"
        accessibilityLabel="Talk now"
        onPress={() => navigation.navigate('VoiceCall', { kind: 'manual', autoStart: true })}
        style={[styles.voiceFab, { bottom: (Platform.OS === 'ios' ? 180 : 170) + insets.bottom }]}
        activeOpacity={0.85}
      >
        <Mic size={24} stroke="white" strokeWidth={2.5} />
      </TouchableOpacity>

      {/* add FAB */}
      <TouchableOpacity
        testID="add-food"
        accessibilityLabel="Add food"
        onPress={() => navigation.navigate('AddItems', { date: shown })}
        style={[styles.addFab, { bottom: (Platform.OS === 'ios' ? 110 : 100) + insets.bottom }]}
        activeOpacity={0.85}
      >
        <Plus size={26} stroke="white" strokeWidth={2.4} />
      </TouchableOpacity>
    </View>
  );
}

/** A call that ended without saving a food list: transcript plus a manual add. */
function NoListCall({ call, date }: { call: CallInfo; date: string }) {
  const navigation = useNavigation();
  const [open, setOpen] = useState(false);
  const time = new Date(call.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <View style={styles.callCard}>
      <View style={styles.callHead}>
        <View style={styles.callIcon}>
          <PhoneMissed size={18} color={tokens.foodLog.amber} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.callTitle}>Call at {time} ended without a food list</Text>
          <Text style={styles.callSub}>Nothing was saved from this call. You can add what you ate yourself.</Text>
        </View>
      </View>
      {call.transcript ? (
        <TouchableOpacity onPress={() => setOpen(!open)} style={styles.transcriptToggle}>
          <Text style={styles.transcriptLink}>{open ? 'Hide transcript' : 'Show transcript'}</Text>
          {open ? <Text style={styles.transcriptText}>{call.transcript}</Text> : null}
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        onPress={() => navigation.navigate('AddItems', { date, callId: call.id })}
        style={styles.addBtn}
        activeOpacity={0.7}
      >
        <Plus size={15} color={tokens.foodLog.green} strokeWidth={2.4} />
        <Text style={styles.addBtnText}>Add items</Text>
      </TouchableOpacity>
    </View>
  );
}

const T = tokens.foodLog;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: T.bg,
  },
  scroll: {
    flex: 1,
    marginTop: -44,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 14,
  },
  staleBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: T.staleBg,
    borderWidth: 1,
    borderColor: T.staleLine,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  staleText: {
    fontSize: 13,
    color: T.staleInk,
    lineHeight: 18,
  },
  staleStrong: {
    fontWeight: '700',
    color: T.staleInkSoft,
  },
  staleLink: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '800',
    color: T.staleInkSoft,
  },
  failedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: T.lowSoft,
    borderWidth: 1,
    borderColor: '#f7c9bd',
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  failedText: {
    flex: 1,
    fontSize: 13,
    color: T.low,
    lineHeight: 18,
  },
  callCard: {
    backgroundColor: T.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: T.line,
    shadowColor: T.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  callHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  callIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: T.amberSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: T.ink,
    letterSpacing: -0.2,
  },
  callSub: {
    fontSize: 12,
    color: T.inkSoft,
    fontWeight: '600',
    marginTop: 2,
  },
  transcriptToggle: {
    marginTop: 12,
  },
  transcriptLink: {
    fontSize: 13,
    fontWeight: '700',
    color: T.green,
  },
  transcriptText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: T.inkSoft,
    backgroundColor: T.lineSoft,
    borderRadius: 12,
    padding: 12,
  },
  addBtn: {
    marginTop: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: T.line,
    borderRadius: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: T.green,
  },
  mealsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    paddingTop: 2,
  },
  mealsTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: T.ink,
    letterSpacing: -0.1,
  },
  mealsCal: {
    fontSize: 12,
    color: T.inkMuted,
    fontWeight: '700',
  },
  mealList: {
    gap: 11,
  },
  emptyCard: {
    backgroundColor: T.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: T.line,
    padding: 18,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: T.ink,
  },
  emptyBody: {
    fontSize: 12.5,
    color: T.inkSoft,
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
  },
  voiceFab: {
    position: 'absolute',
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: T.purple,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: T.purple,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 22,
    elevation: 8,
  },
  addFab: {
    position: 'absolute',
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: T.green,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: T.green,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.42,
    shadowRadius: 22,
    elevation: 8,
  },
});
