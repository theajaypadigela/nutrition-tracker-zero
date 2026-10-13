import React from 'react';
import { View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { Button, Card, Notice, Text, type NoticeTone } from '@/components/kit';
import { StackScreen } from '@/components/layout/StackScreen';
import { createStyles, space } from '@/theme';
import type { WeeklyNutrient } from '@/types/nutrition';
import { fmtNum, statusOf, statusTone, weekDayLabels } from '@/utils/nutrition';
import { DayChart } from './DayChart';

interface Props {
  nutrient: WeeklyNutrient;
  onBack: () => void;
  onSetGoal: () => void;
}

const verdictText = (n: WeeklyNutrient): string => {
  if (!(n.goal > 0)) {
    return `No goal set for ${n.name.toLowerCase()}. Set one to see how this week compares.`;
  }
  const status = statusOf(n);
  const pct = n.goal > 0 ? n.amount / n.goal : 0;
  const overPct = Math.round(Math.max(0, pct - 1) * 100);
  const underPct = Math.round(Math.max(0, 1 - pct) * 100);
  if (n.dir === 'higher') {
    if (status === 'good') return `You hit your weekly ${n.name.toLowerCase()} target.`;
    if (status === 'warn') return `${underPct}% short of your ${n.name.toLowerCase()} goal — almost there.`;
    return `${underPct}% below your ${n.name.toLowerCase()} goal this week.`;
  }
  if (n.dir === 'lower') {
    if (status === 'good') return `You stayed within your weekly ${n.name.toLowerCase()} limit.`;
    if (status === 'warn') return `Slightly over your ${n.name.toLowerCase()} limit — keep an eye on it.`;
    return `${overPct}% over your ${n.name.toLowerCase()} limit.`;
  }
  if (status === 'good') return `Your ${n.name.toLowerCase()} stayed in range this week.`;
  if (status === 'warn') return `Your ${n.name.toLowerCase()} is close to the edge of its target range.`;
  return `Your ${n.name.toLowerCase()} is outside its target range.`;
};

const useStyles = createStyles(() => ({
  hero: { gap: space.xs },
  value: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  stat: { flexBasis: '47%', flexGrow: 1, gap: 2 },
}));

/** One nutrient for the week: the total, a verdict in words, the daily bars, and four numbers. */
export function NutrientDetail({ nutrient, onBack, onSetGoal }: Props) {
  const styles = useStyles();
  const hasGoal = nutrient.goal > 0;
  const status = statusOf(nutrient);
  const labels = weekDayLabels();
  const dailyGoal = nutrient.dailyGoal ?? 0;
  const trend = nutrient.trend.length === 7 ? nutrient.trend : Array(7).fill(0);
  // Averaged over the days something was logged, so an unlogged day doesn't read as zero intake.
  const dailyAvg = trend.reduce((a, b) => a + b, 0) / Math.max(1, nutrient.loggedDays);
  const maxIdx = trend.reduce((best, v, i) => (v > trend[best] ? i : best), 0);
  const minIdx = trend.reduce((best, v, i) => (v < trend[best] ? i : best), 0);
  const noticeTone: NoticeTone = hasGoal ? (statusTone[status] as NoticeTone) : 'info';
  const barTone = hasGoal ? (statusTone[status] === 'success' ? 'primary' : statusTone[status]) : 'muted';

  const stats: { label: string; value: string; sub?: string }[] = [
    { label: 'Daily average', value: fmtNum(dailyAvg, nutrient.unit), sub: `on ${nutrient.loggedDays} logged day${nutrient.loggedDays === 1 ? '' : 's'}` },
    { label: 'Daily goal', value: dailyGoal > 0 ? fmtNum(dailyGoal, nutrient.unit) : '—' },
    { label: 'Highest day', value: fmtNum(trend[maxIdx], nutrient.unit), sub: labels[maxIdx] },
    { label: 'Lowest day', value: fmtNum(trend[minIdx], nutrient.unit), sub: labels[minIdx] },
  ];

  return (
    <StackScreen
      title={nutrient.name}
      subtitle="This week"
      onBack={onBack}
      right={<Button label="Set goal" icon={Plus} variant="soft" size="sm" onPress={onSetGoal} />}
    >
      <View style={styles.hero}>
        <Text variant="small" tone="muted">
          Total this week
        </Text>
        <View style={styles.value}>
          <Text variant="display" tabular>
            {fmtNum(nutrient.amount)}
          </Text>
          <Text variant="title3" tone="muted">
            {nutrient.unit}
          </Text>
        </View>
      </View>

      <Notice tone={noticeTone}>{verdictText(nutrient)}</Notice>

      <DayChart values={trend} dailyGoal={dailyGoal} unit={nutrient.unit} tone={barTone} />

      <View style={styles.grid}>
        {stats.map(s => (
          <Card key={s.label} style={styles.stat}>
            <Text variant="caption" tone="muted">
              {s.label}
            </Text>
            <Text variant="title3" tabular style={{ marginTop: space.xs }}>
              {s.value}
            </Text>
            {s.sub ? (
              <Text variant="caption" tone="muted">
                {s.sub}
              </Text>
            ) : null}
          </Card>
        ))}
      </View>
    </StackScreen>
  );
}
