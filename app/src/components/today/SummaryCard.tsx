import React from 'react';
import { View } from 'react-native';
import type { NutrientKind, Totals } from '@/api/types';
import { Card, Divider, ProgressBar, ProgressRing, Text, type ProgressTone } from '@/components/kit';
import { createStyles, space } from '@/theme';
import { formatAmount, formatNumber } from '@/utils/format';

/** The six nutrients on a day. What each one's target MEANS comes from the catalogue (`kinds`), not from here. */
const METRICS: { key: string; label: string }[] = [
  { key: 'protein', label: 'Protein' },
  { key: 'carbs', label: 'Carbs' },
  { key: 'fat', label: 'Fat' },
  { key: 'fiber', label: 'Fiber' },
  { key: 'sugar', label: 'Sugar' },
  { key: 'sodium', label: 'Sodium' },
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

/** Only a limit warms up, and only to amber: eating more or less than a reference is not a warning (plan 5.4, 5.8). */
function toneFor(kind: NutrientKind | undefined, value: number, target: number): ProgressTone {
  if (kind !== 'limit' || target <= 0) return 'primary';
  return value / target > 1 ? 'warning' : 'primary';
}

/**
 * The day at a glance: calories as a ring with what is left, then six nutrients as one compact
 * grid. Colour only appears when a limit has been passed. A target the person never typed is the
 * general reference for an adult, and says so. With no target at all (a profile without personal
 * targets) there is no ring: amounts only.
 */
export function SummaryCard({
  consumed,
  target,
  targetIsReference,
  totals,
  goals,
  units,
  kinds,
}: {
  consumed: number;
  /** The calorie target, or null when there is none: then only amounts are shown. */
  target: number | null;
  /** True when `target` is the general reference rather than the person's own. */
  targetIsReference: boolean;
  totals: Totals;
  goals: Record<string, number | null>;
  /** Unit per nutrient key, from /meta. */
  units: Record<string, string>;
  /** What each nutrient's target means, from /meta. */
  kinds: Record<string, NutrientKind>;
}) {
  const styles = useStyles();
  const hasTarget = target !== null && target > 0;
  const left = hasTarget ? Math.round(target - consumed) : 0;
  const over = left < 0;
  const rows = Array.from({ length: Math.ceil(METRICS.length / COLUMNS) }, (_, i) =>
    METRICS.slice(i * COLUMNS, (i + 1) * COLUMNS),
  );

  return (
    <Card padding="xl" testID="summary-card">
      <View style={styles.top}>
        {hasTarget ? (
          <ProgressRing progress={consumed / target} tone="primary" size={112} stroke={9}>
            <View style={styles.ringValue}>
              <Text variant="title2" tabular>
                {formatNumber(consumed)}
              </Text>
              <Text variant="caption" tone="muted">
                kcal eaten
              </Text>
            </View>
          </ProgressRing>
        ) : null}

        <View style={styles.stats}>
          <Text variant="small" tone="muted">
            {hasTarget ? (over ? 'Over by' : 'Remaining') : 'Logged today'}
          </Text>
          <View style={styles.valueRow}>
            <Text variant="display" tabular>
              {formatNumber(hasTarget ? Math.abs(left) : consumed)}
            </Text>
            <Text variant="small" tone="muted">
              kcal
            </Text>
          </View>
          {hasTarget ? (
            <Text variant="small" tone="muted" tabular>
              {targetIsReference ? 'General reference' : 'Your target'} {formatNumber(target)} kcal
            </Text>
          ) : null}
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
                    {goal > 0 ? `of ${formatAmount(goal)} ${unit}` : 'No reference'}
                  </Text>
                  <ProgressBar value={goal > 0 ? value / goal : 0} tone={toneFor(kinds[m.key], value, goal)} height={4} />
                </View>
              );
            })}
          </View>
        ))}
      </View>

    </Card>
  );
}
