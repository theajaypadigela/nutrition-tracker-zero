import React from 'react';
import { View } from 'react-native';
import type { Totals } from '@/api/types';
import { Card, Divider, ProgressBar, ProgressRing, Text, type ProgressTone } from '@/components/kit';
import { createStyles, space } from '@/theme';
import { formatAmount, formatNumber } from '@/utils/format';

/** `limit`: more is worse (a bar past its target warms up). `goal`: more is better. */
const METRICS: { key: string; label: string; kind: 'goal' | 'limit' }[] = [
  { key: 'protein', label: 'Protein', kind: 'goal' },
  { key: 'carbs', label: 'Carbs', kind: 'goal' },
  { key: 'fat', label: 'Fat', kind: 'limit' },
  { key: 'fiber', label: 'Fiber', kind: 'goal' },
  { key: 'sugar', label: 'Sugar', kind: 'limit' },
  { key: 'sodium', label: 'Sodium', kind: 'limit' },
];
const COLUMNS = 3;

const useStyles = createStyles(() => ({
  top: { flexDirection: 'row', alignItems: 'center', gap: space.xl },
  ringValue: { alignItems: 'center' },
  stats: { flex: 1, gap: space.xs },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  grid: { gap: space.xl },
  gridRow: { flexDirection: 'row', gap: space.md },
  metric: { flex: 1, gap: 3 },
  metricValue: { flexDirection: 'row', alignItems: 'baseline' },
}));

function toneFor(kind: 'goal' | 'limit', value: number, target: number): ProgressTone {
  if (kind === 'goal' || target <= 0) return 'primary';
  const ratio = value / target;
  return ratio > 1.15 ? 'danger' : ratio > 1 ? 'warning' : 'primary';
}

/**
 * The day at a glance: calories as a ring with what is left, then six nutrients as one compact
 * grid. Colour only appears when a limit has been passed.
 */
export function SummaryCard({
  consumed,
  target,
  totals,
  goals,
  units,
}: {
  consumed: number;
  target: number;
  totals: Totals;
  goals: Record<string, number | null>;
  /** Unit per nutrient key, from /meta. */
  units: Record<string, string>;
}) {
  const styles = useStyles();
  const left = Math.round(target - consumed);
  const over = left < 0;
  const rows = Array.from({ length: Math.ceil(METRICS.length / COLUMNS) }, (_, i) =>
    METRICS.slice(i * COLUMNS, (i + 1) * COLUMNS),
  );

  return (
    <Card padding="xl" testID="summary-card">
      <View style={styles.top}>
        <ProgressRing progress={target > 0 ? consumed / target : 0} tone={over ? 'warning' : 'primary'} size={112} stroke={9}>
          <View style={styles.ringValue}>
            <Text variant="title2" tabular>
              {formatNumber(consumed)}
            </Text>
            <Text variant="caption" tone="muted">
              kcal eaten
            </Text>
          </View>
        </ProgressRing>

        <View style={styles.stats}>
          <Text variant="small" tone="muted">
            {over ? 'Over by' : 'Remaining'}
          </Text>
          <View style={styles.valueRow}>
            <Text variant="display" tabular tone={over ? 'warning' : 'text'}>
              {formatNumber(Math.abs(left))}
            </Text>
            <Text variant="small" tone="muted">
              kcal
            </Text>
          </View>
          <Text variant="small" tone="muted" tabular>
            Goal {formatNumber(target)} kcal
          </Text>
        </View>
      </View>

      <View style={{ marginVertical: space.xl }}>
        <Divider />
      </View>

      <View style={styles.grid}>
        {rows.map((row, r) => (
          <View key={r} style={styles.gridRow}>
            {row.map(m => {
              const value = totals[m.key]?.value ?? 0;
              const goal = goals[m.key] ?? 0;
              const unit = units[m.key] ?? 'g';
              return (
                <View key={m.key} style={styles.metric}>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {m.label}
                  </Text>
                  <View style={styles.metricValue}>
                    <Text variant="bodyStrong" tabular numberOfLines={1}>
                      {formatAmount(value)}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {` ${unit}`}
                    </Text>
                  </View>
                  {/* Two lines, not "23.1 / 180 g": the target must never be what gets cut off. */}
                  <Text variant="caption" tone="muted" tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                    {goal > 0 ? `of ${formatAmount(goal)} ${unit}` : 'No goal'}
                  </Text>
                  <ProgressBar value={goal > 0 ? value / goal : 0} tone={toneFor(m.kind, value, goal)} height={4} />
                </View>
              );
            })}
          </View>
        ))}
      </View>

    </Card>
  );
}
