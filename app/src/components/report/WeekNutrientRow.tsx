import React from 'react';
import { View } from 'react-native';
import { Badge, ProgressBar, Text, type BadgeTone, type ProgressTone } from '@/components/kit';
import { createStyles, space } from '@/theme';
import { formatNumber } from '@/utils/format';

const useStyles = createStyles(() => ({
  row: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.lg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  value: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
}));

/**
 * One nutrient's week so far: what was eaten, how far along the prorated goal that is, and the
 * weekly target. `limit` nutrients warm up once they pass their goal.
 */
export function WeekNutrientRow({
  label,
  current,
  goal,
  weeklyGoal,
  unit,
  kind = 'goal',
  badge,
}: {
  label: string;
  current: number;
  /** The goal for the days elapsed so far. */
  goal: number;
  weeklyGoal?: number;
  unit: string;
  kind?: 'goal' | 'limit';
  badge?: { label: string; tone: BadgeTone };
}) {
  const styles = useStyles();
  const ratio = goal > 0 ? current / goal : 0;
  // On the last day of the week the goal so far is the weekly goal; say it once.
  const complete = !!weeklyGoal && weeklyGoal === goal;
  const tone: ProgressTone = kind === 'limit' && ratio > 1.15 ? 'danger' : kind === 'limit' && ratio > 1 ? 'warning' : 'primary';
  return (
    <View style={styles.row}>
      <View style={styles.top}>
        <View style={[styles.value, { flex: 1 }]}>
          <Text variant="bodyStrong">{label}</Text>
          {badge ? <Badge label={badge.label} tone={badge.tone} /> : null}
        </View>
        <View style={styles.value}>
          <Text variant="bodyStrong" tabular>
            {formatNumber(current)}
          </Text>
          <Text variant="small" tone="muted">
            {unit}
          </Text>
        </View>
      </View>
      <ProgressBar value={ratio} tone={tone} />
      <View style={styles.bottom}>
        <Text variant="caption" tone="muted" tabular>
          {goal > 0 ? `${Math.round(ratio * 100)}% of ${formatNumber(goal)} ${unit}${complete ? '' : ' so far'}` : 'No goal set'}
        </Text>
        {weeklyGoal && !complete ? (
          <Text variant="caption" tone="muted" tabular>
            Weekly {formatNumber(weeklyGoal)} {unit}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
