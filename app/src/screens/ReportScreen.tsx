import React, { useCallback, useMemo } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { BarChart3, Target } from 'lucide-react-native';
import { api } from '@/api/client';
import { Card, FormGroup, ListGroup, ListRow, Notice, ProgressBar, SectionHeader, Text, type BadgeTone } from '@/components/kit';
import { TabScreen } from '@/components/layout/TabScreen';
import { WeekNutrientRow } from '@/components/report/WeekNutrientRow';
import { deviceTimeZone } from '@/components/TimezoneField';
import { useAsync } from '@/hooks/useAsync';
import { useMeta } from '@/state/MetaContext';
import { space } from '@/theme';
import type { NutrientData } from '@/types/nutrition';
import { addDays, localDateIn, weekStart } from '@/utils/dates';
import { formatNumber } from '@/utils/format';
import { weekRangeLabel } from '@/utils/nutrition';
import { buildWeeklyNutrients, daysElapsed } from '@/utils/week';

/** A limit (sugar, sodium) is good under its goal; a target (fiber) is good once it is met. */
function microStatus(n: NutrientData, kind: 'limit' | 'target'): { label: string; tone: BadgeTone } {
  if (!(n.goal > 0)) return { label: 'No goal', tone: 'neutral' };
  const pct = n.current / n.goal;
  if (kind === 'limit') {
    return pct <= 1 ? { label: 'Good', tone: 'success' } : pct <= 1.15 ? { label: 'Moderate', tone: 'warning' } : { label: 'High', tone: 'danger' };
  }
  return pct >= 1 ? { label: 'Good', tone: 'success' } : pct >= 0.8 ? { label: 'Moderate', tone: 'warning' } : { label: 'Low', tone: 'warning' };
}

/**
 * This week so far vs goals, computed from D1 (no AI, PLAN.md §12). Other weeks and every
 * nutrient live in the weekly view.
 */
export default function ReportScreen() {
  const navigation = useNavigation();
  const meta = useMeta();
  const today = localDateIn(deviceTimeZone());
  const start = weekStart(today);
  const range = useAsync(() => api.getDays(start, addDays(start, 6)), [start]);
  useFocusEffect(
    useCallback(() => {
      range.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [start]),
  );

  const elapsed = daysElapsed(start, today);
  const byKey = useMemo(() => {
    const list = range.data ? buildWeeklyNutrients(range.data, start, today, meta.nutrients) : [];
    return Object.fromEntries(list.map(n => [n.id, n]));
  }, [range.data, start, today, meta.nutrients]);

  const pick = (key: string): NutrientData => {
    const n = byKey[key];
    return {
      current: Math.round(n?.amount ?? 0),
      goal: Math.round(n?.goal ?? 0),
      weeklyGoal: n?.dailyGoal ? Math.round(n.dailyGoal * 7) : undefined,
    };
  };

  const calories = pick('calories');
  const loggedDays = byKey.calories?.loggedDays ?? 0;
  const pending = range.data?.days.reduce((s, d) => s + d.pendingCount, 0) ?? 0;
  const calRatio = calories.goal > 0 ? calories.current / calories.goal : 0;
  const weekComplete = !!calories.weeklyGoal && calories.weeklyGoal === calories.goal;

  const macros = [
    { label: 'Protein', key: 'protein', kind: 'goal' as const },
    { label: 'Carbs', key: 'carbs', kind: 'goal' as const },
    { label: 'Fat', key: 'fat', kind: 'limit' as const },
  ];
  const others = [
    { label: 'Fiber', key: 'fiber', kind: 'target' as const },
    { label: 'Sugar', key: 'sugar', kind: 'limit' as const },
    { label: 'Sodium', key: 'sodium', kind: 'limit' as const },
  ];

  return (
    <TabScreen
      title="Report"
      subtitle={`This week · ${weekRangeLabel(start)}`}
      refreshing={range.loading && !!range.data}
      onRefresh={range.reload}
    >
      {range.error ? <Notice tone="danger">{range.error}</Notice> : null}

      <Card padding="xl">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="small" tone="muted">
            Calories this week
          </Text>
          <Text variant="small" tone="muted">
            Day {elapsed} of 7
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.xs, marginTop: space.sm }}>
          <Text variant="display" tabular>
            {formatNumber(calories.current)}
          </Text>
          <Text variant="body" tone="muted">
            kcal
          </Text>
        </View>
        <View style={{ marginTop: space.lg, gap: space.sm }}>
          <ProgressBar value={calRatio} tone={calRatio > 1.1 ? 'warning' : 'primary'} height={8} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="caption" tone="muted" tabular>
              {Math.round(calRatio * 100)}% of {formatNumber(calories.goal)} kcal{weekComplete ? '' : ' so far'}
            </Text>
            {!weekComplete ? (
              <Text variant="caption" tone="muted" tabular>
                Weekly {formatNumber(calories.weeklyGoal ?? 0)} kcal
              </Text>
            ) : null}
          </View>
        </View>
        <Text variant="caption" tone="muted" style={{ marginTop: space.lg }}>
          {loggedDays} of 7 days logged
        </Text>
      </Card>

      {pending > 0 ? (
        <Notice
          tone="warning"
          action={{ label: 'Open Pending', onPress: () => navigation.navigate('Main', { screen: 'Uncached' }) }}
        >
          {pending} item{pending === 1 ? ' is' : 's are'} still unknown and not counted.
        </Notice>
      ) : null}

      <View style={{ gap: space.md }}>
        <SectionHeader
          title="Macros"
          right={
            <Text variant="small" tone="muted">
              Week so far
            </Text>
          }
        />
        <ListGroup>
          {macros.map(m => {
            const n = pick(m.key);
            return <WeekNutrientRow key={m.key} label={m.label} current={n.current} goal={n.goal} weeklyGoal={n.weeklyGoal} unit="g" kind={m.kind} />;
          })}
        </ListGroup>
      </View>

      <View style={{ gap: space.md }}>
        <SectionHeader title="Other nutrients" />
        <ListGroup>
          {others.map(m => {
            const n = pick(m.key);
            const unit = meta.nutrients.find(x => x.key === m.key)?.unit ?? 'g';
            return (
              <WeekNutrientRow
                key={m.key}
                label={m.label}
                current={n.current}
                goal={n.goal}
                weeklyGoal={n.weeklyGoal}
                unit={unit}
                kind={m.kind === 'target' ? 'goal' : 'limit'}
                badge={microStatus(n, m.kind)}
              />
            );
          })}
        </ListGroup>
      </View>

      <FormGroup>
        <ListGroup>
          <ListRow
            icon={BarChart3}
            title="Weekly breakdown"
            subtitle="Score, every nutrient, day-by-day chart"
            onPress={() => navigation.navigate('WeeklySummary')}
          />
          <ListRow
            icon={Target}
            title="Daily goals"
            subtitle="Set the targets every report compares against"
            onPress={() => navigation.navigate('Goals')}
          />
        </ListGroup>
      </FormGroup>
    </TabScreen>
  );
}
