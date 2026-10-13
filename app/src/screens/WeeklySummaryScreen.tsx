import React, { useCallback, useMemo, useState } from 'react';
import { BackHandler, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { SearchX } from 'lucide-react-native';
import { api } from '@/api/client';
import { Chip, EmptyState, ListGroup, LoadingState, Notice, SearchField, Segmented, Text } from '@/components/kit';
import { StackScreen } from '@/components/layout/StackScreen';
import { GoalSheet } from '@/components/report/GoalSheet';
import { NutrientDetail } from '@/components/report/NutrientDetail';
import { NutrientRow } from '@/components/report/NutrientRow';
import { ScoreCard } from '@/components/report/ScoreCard';
import { Toast } from '@/components/report/Toast';
import { deviceTimeZone } from '@/components/TimezoneField';
import { useAsync } from '@/hooks/useAsync';
import { useMeta } from '@/state/MetaContext';
import { space, useTheme } from '@/theme';
import type { Status } from '@/types/nutrition';
import { addDays, localDateIn, weekStart } from '@/utils/dates';
import { scoreOf, statusOf, weekRangeLabel } from '@/utils/nutrition';
import { buildWeeklyNutrients } from '@/utils/week';

type FilterValue = 'all' | Status;

const FILTERS: { key: FilterValue; label: string; dot?: 'good' | 'warn' | 'bad' }[] = [
  { key: 'all', label: 'All' },
  { key: 'good', label: 'On track', dot: 'good' },
  { key: 'warn', label: 'Close', dot: 'warn' },
  { key: 'bad', label: 'Off goal', dot: 'bad' },
];

/** Every nutrient for one Monday-first week: score, search, filters, day chart, goals. */
export default function WeeklySummaryScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
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

  // The nutrient detail replaces the list in place, so the system back button closes it first.
  useFocusEffect(
    useCallback(() => {
      if (!detailNutrient) return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setOpenId(null);
        return true;
      });
      return () => sub.remove();
    }, [detailNutrient]),
  );

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

  const overlays = (
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
        <NutrientDetail nutrient={detailNutrient} onBack={() => setOpenId(null)} onSetGoal={() => openGoal(detailNutrient.id)} />
        {overlays}
      </>
    );
  }

  return (
    <>
      <StackScreen
        title="Weekly breakdown"
        subtitle="Every nutrient, scored against your goals"
        refreshing={range.loading && !!range.data}
        onRefresh={range.reload}
        gap={space.lg}
      >
        {range.error ? <Notice tone="danger">{range.error}</Notice> : null}

        <ScoreCard
          weekLabel={weekRangeLabel(start)}
          weekIdx={weekIdx}
          onPrevWeek={() => setWeekIdx(w => w - 1)}
          onNextWeek={() => setWeekIdx(w => Math.min(0, w + 1))}
          score={summary.score}
          onTrack={summary.onTrack}
          tracked={summary.tracked}
          hitRate={summary.hitRate}
        />

        <SearchField value={query} onChangeText={setQuery} placeholder="Search vitamins, minerals, macros…" />

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {FILTERS.map(f => (
            <Chip
              key={f.key}
              label={f.label}
              count={counts[f.key]}
              selected={filter === f.key}
              dot={f.dot ? { good: colors.primary, warn: colors.warning, bad: colors.danger }[f.dot] : undefined}
              onPress={() => setFilter(f.key)}
            />
          ))}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="small" tone="muted">
            {filtered.length} {filtered.length === 1 ? 'nutrient' : 'nutrients'}
          </Text>
          <View style={{ width: 168 }}>
            <Segmented
              options={[
                { value: 'absolute', label: 'Amount' },
                { value: 'percent', label: '%' },
              ]}
              value={valueMode}
              onChange={setValueMode}
            />
          </View>
        </View>

        {range.loading && allNutrients.length === 0 ? (
          <LoadingState label="Loading nutrients…" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No matches"
            body={query ? 'Try a different search.' : 'No nutrients tracked for this week yet.'}
          />
        ) : (
          <ListGroup>
            {filtered.map(n => (
              <NutrientRow key={n.id} nutrient={n} valueMode={valueMode} onPress={() => setOpenId(n.id)} />
            ))}
          </ListGroup>
        )}
      </StackScreen>
      {overlays}
    </>
  );
}
