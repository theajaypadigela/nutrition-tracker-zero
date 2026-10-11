import React, { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/api/client';
import { FocusAwareStatusBar, Notice } from '@/components/common/Feedback';
import HeaderCard from '@/components/nutrition-report/weekly-summary/HeaderCard';
import NutrientRow from '@/components/nutrition-report/weekly-summary/NutrientRow';
import NutrientDetail from '@/components/nutrition-report/weekly-summary/NutrientDetail';
import GoalSheet from '@/components/nutrition-report/weekly-summary/GoalSheet';
import Toast from '@/components/nutrition-report/weekly-summary/Toast';
import {
  NutrientSearchBar,
  FilterChips,
  ValueModeToggle,
} from '@/components/nutrition-report/weekly-summary/FilterControls';
import { scoreOf, statusOf, weekRangeLabel } from '@/components/nutrition-report/weekly-summary/tokens';
import { deviceTimeZone } from '@/components/TimezoneField';
import { Text } from '@/components/ui/text';
import { useAsync } from '@/hooks/useAsync';
import { useMeta } from '@/state/MetaContext';
import { tokens } from '@/theme/tokens';
import type { Status } from '@/types/nutrition';
import { addDays, localDateIn, weekStart } from '@/utils/dates';
import { buildWeeklyNutrients } from '@/utils/week';

type FilterValue = 'all' | Status;

/** Every nutrient for one Monday-first week: score, search, filters, day chart, goals. */
export default function WeeklySummaryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const meta = useMeta();
  const today = localDateIn(deviceTimeZone());
  const thisWeek = weekStart(today);
  const [weekIdx, setWeekIdx] = useState(0);
  const start = addDays(thisWeek, weekIdx * 7);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterValue>('all');
  const [valueMode, setValueMode] = useState<'absolute' | 'percent'>('absolute');
  const [openId, setOpenId] = useState<string | null>(null);
  const [goalSheetId, setGoalSheetId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const range = useAsync(() => api.getDays(start, addDays(start, 6)), [start]);

  const allNutrients = useMemo(
    () => (range.data ? buildWeeklyNutrients(range.data, start, today, meta.nutrients) : []),
    [range.data, start, today, meta.nutrients],
  );
  // Only nutrients with a goal get a verdict, so only they count toward the score and filters.
  const withGoal = useMemo(() => allNutrients.filter(n => n.goal > 0), [allNutrients]);

  const summary = useMemo(() => {
    const onTrack = withGoal.filter(n => statusOf(n) === 'good').length;
    return {
      score: scoreOf(withGoal),
      onTrack,
      tracked: allNutrients.filter(n => n.amount > 0).length,
      hitRate: withGoal.length ? Math.round((onTrack / withGoal.length) * 100) : 0,
    };
  }, [allNutrients, withGoal]);

  const counts = useMemo(() => {
    const acc = { all: allNutrients.length, good: 0, warn: 0, bad: 0 };
    withGoal.forEach(n => {
      acc[statusOf(n)]++;
    });
    return acc;
  }, [allNutrients, withGoal]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allNutrients.filter(n => {
      const matchesQuery = q === '' || n.name.toLowerCase().includes(q);
      const matchesFilter = filter === 'all' || (n.goal > 0 && statusOf(n) === filter);
      return matchesQuery && matchesFilter;
    });
  }, [allNutrients, query, filter]);

  const detailNutrient = allNutrients.find(n => n.id === openId) ?? null;
  const goalSheetNutrient = allNutrients.find(n => n.id === goalSheetId) ?? null;

  const handleSaveGoal = async (newWeeklyGoal: number) => {
    if (!goalSheetNutrient) return;
    const { id, name } = goalSheetNutrient;
    setGoalSheetId(null);
    try {
      await api.updateGoals({ [id]: Number((newWeeklyGoal / 7).toFixed(2)) });
      setToast(`Goal updated for ${name}`);
      range.reload();
    } catch {
      setToast(`Could not update the goal for ${name}`);
    }
  };

  const openGoal = (id: string) => {
    // A nutrient without a goal has nothing for the slider to scale; set it on the goals screen.
    if (allNutrients.find(n => n.id === id)?.dailyGoal) setGoalSheetId(id);
    else navigation.navigate('Goals');
  };

  const sheets = (
    <>
      <GoalSheet
        visible={!!goalSheetNutrient}
        nutrient={goalSheetNutrient}
        baseGoal={(goalSheetNutrient?.dailyGoal ?? 0) * 7}
        onClose={() => setGoalSheetId(null)}
        onSave={handleSaveGoal}
      />
      <Toast message={toast} onHide={() => setToast(null)} />
    </>
  );

  if (detailNutrient) {
    return (
      <>
        <FocusAwareStatusBar barStyle="light-content" />
        <View style={styles.root}>
          <NutrientDetail
            nutrient={detailNutrient}
            statusBarInset={insets.top}
            onBack={() => setOpenId(null)}
            onSetGoal={() => openGoal(detailNutrient.id)}
          />
        </View>
        {sheets}
      </>
    );
  }

  return (
    <View style={styles.root}>
      <FocusAwareStatusBar barStyle="light-content" />
      <ScrollView
        style={styles.fill}
        contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={range.loading && !!range.data} onRefresh={range.reload} />}
      >
        <HeaderCard
          statusBarInset={insets.top}
          weekLabel={weekRangeLabel(start)}
          weekIdx={weekIdx}
          onPrevWeek={() => setWeekIdx(w => w - 1)}
          onNextWeek={() => setWeekIdx(w => Math.min(0, w + 1))}
          onBack={() => navigation.goBack()}
          score={summary.score}
          onTrack={summary.onTrack}
          tracked={summary.tracked}
          hitRate={summary.hitRate}
        />

        <View style={styles.body}>
          {range.error ? <Notice tone="error">{range.error}</Notice> : null}
          <NutrientSearchBar value={query} onChange={setQuery} />

          <View style={styles.chipsRow}>
            <FilterChips value={filter} counts={counts} onChange={setFilter} />
          </View>

          <ValueModeToggle count={filtered.length} mode={valueMode} onChange={setValueMode} />

          {range.loading && allNutrients.length === 0 ? (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color={tokens.report.primary} />
              <Text style={styles.loadingText}>Loading nutrients…</Text>
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No matches</Text>
              <Text style={styles.emptySub}>
                {query ? 'Try a different search.' : 'No nutrients tracked for this week yet.'}
              </Text>
            </View>
          ) : (
            <View style={styles.list}>
              {filtered.map(n => (
                <NutrientRow key={n.id} nutrient={n} valueMode={valueMode} onPress={() => setOpenId(n.id)} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
      {sheets}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.report.bg,
  },
  fill: {
    flex: 1,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  chipsRow: {
    marginHorizontal: -16,
    paddingLeft: 16,
  },
  list: {
    gap: 10,
    marginTop: 4,
  },
  loading: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: tokens.report.inkSoft,
    fontSize: 13,
    fontWeight: '500',
  },
  empty: {
    paddingVertical: 40,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: tokens.report.line,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: tokens.report.surface,
    marginTop: 6,
  },
  emptyTitle: {
    color: tokens.report.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  emptySub: {
    color: tokens.report.inkMuted,
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
});
