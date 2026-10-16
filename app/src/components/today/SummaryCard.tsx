import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronDown, ChevronRight, ChevronUp } from 'lucide-react-native';
import type { NutrientInfo, NutrientKind, Totals } from '@/api/types';
import { Card, Divider, Icon, ProgressBar, ProgressRing, Text, type ProgressTone } from '@/components/kit';
import { fill } from '@/i18n/fill';
import { strings } from '@/i18n/strings';
import { createStyles, space, useTheme } from '@/theme';
import { formatAmount, formatNumber } from '@/utils/format';

const t = strings.breakdown;

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
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingTop: space.lg },
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  moreBody: { flex: 1, minWidth: 0, gap: 1 },
}));

/** Only a limit warms up, and only to amber: eating more or less than a reference is not a warning (plan 5.4, 5.8). */
function toneFor(kind: NutrientKind | undefined, value: number, target: number): ProgressTone {
  if (kind !== 'limit' || target <= 0) return 'primary';
  return value / target > 1 ? 'warning' : 'primary';
}

/**
 * The day at a glance: calories as a ring with what is left, then six nutrients as one compact
 * grid, then every other nutrient behind "All nutrients". Colour only appears when a limit has been
 * passed. A target the person never typed is the general reference for an adult, and says so. With no
 * target at all (a profile without personal targets) there is no ring: amounts only. Every figure is a
 * button: it opens the foods that add up to it, for the day shown (`onOpenNutrient`).
 */
export function SummaryCard({
  consumed,
  target,
  targetIsReference,
  totals,
  itemCount,
  goals,
  units,
  kinds,
  nutrients,
  onOpenNutrient,
}: {
  consumed: number;
  /** The calorie target, or null when there is none: then only amounts are shown. */
  target: number | null;
  /** True when `target` is the general reference rather than the person's own. */
  targetIsReference: boolean;
  totals: Totals;
  itemCount: number;
  goals: Record<string, number | null>;
  /** Unit per nutrient key, from /meta. */
  units: Record<string, string>;
  /** What each nutrient's target means, from /meta. */
  kinds: Record<string, NutrientKind>;
  /** The catalogue, for the nutrients behind "All nutrients" (vitamins, minerals, saturated fat, added sugars). */
  nutrients?: NutrientInfo[];
  /** A nutrient's figure was tapped: show what adds up to it. */
  onOpenNutrient?: (key: string) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const hasTarget = target !== null && target > 0;
  const missingCalories = totals.calories?.missingItems ?? 0;
  const unknownCalories = itemCount > 0 && missingCalories >= itemCount;
  const calorieText = unknownCalories ? 'Unknown' : `${missingCalories > 0 ? '≥ ' : ''}${formatNumber(consumed)}`;
  const left = hasTarget ? Math.round(target - consumed) : 0;
  const over = left < 0;
  const rows = Array.from({ length: Math.ceil(METRICS.length / COLUMNS) }, (_, i) =>
    METRICS.slice(i * COLUMNS, (i + 1) * COLUMNS),
  );
  // Everything else the catalogue knows, in its own order: saturated fat, added sugars, the vitamins and the minerals.
  const others = (nutrients ?? []).filter(n => n.key !== 'calories' && !METRICS.some(m => m.key === n.key));

  return (
    <Card padding="xl" testID="summary-card">
      <Pressable
        testID="summary-metric-calories"
        disabled={!onOpenNutrient}
        onPress={() => onOpenNutrient?.('calories')}
        accessibilityRole={onOpenNutrient ? 'button' : undefined}
        accessibilityLabel={`Calories, ${unknownCalories ? 'unknown' : calorieText} kcal eaten. ${t.openHint}`}
        style={styles.top}
      >
        {hasTarget ? (
          <ProgressRing progress={consumed / target} tone="primary" size={112} stroke={9}>
            <View style={styles.ringValue}>
              <Text variant="title2" tabular>
                {calorieText}
              </Text>
              <Text variant="caption" tone="muted">
                kcal eaten
              </Text>
            </View>
          </ProgressRing>
        ) : null}

        <View style={styles.stats}>
          <Text variant="small" tone="muted">
            {unknownCalories ? 'Logged today' : hasTarget ? (missingCalories > 0 ? (over ? 'Over by at least' : 'Remaining at most') : over ? 'Over by' : 'Remaining') : 'Logged today'}
          </Text>
          <View style={styles.valueRow}>
            <Text variant="display" tabular>
              {unknownCalories ? 'Unknown' : hasTarget ? formatNumber(Math.abs(left)) : calorieText}
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
      </Pressable>

      <View style={{ marginVertical: space.xl }}>
        <Divider />
      </View>

      <View style={styles.grid}>
        {rows.map((row, r) => (
          <View key={r} style={styles.gridRow}>
            {row.map(m => {
              const value = totals[m.key]?.value ?? 0;
              const missing = totals[m.key]?.missingItems ?? 0;
              const unknown = itemCount > 0 && missing >= itemCount;
              const goal = goals[m.key] ?? 0;
              const unit = units[m.key] ?? 'g';
              const figureText = unknown ? 'unknown' : `${missing > 0 ? 'at least ' : ''}${formatAmount(value)} ${unit}`;
              return (
                <Pressable
                  key={m.key}
                  testID={`summary-metric-${m.key}`}
                  disabled={!onOpenNutrient}
                  onPress={() => onOpenNutrient?.(m.key)}
                  accessibilityRole={onOpenNutrient ? 'button' : undefined}
                  accessibilityLabel={`${m.label}, ${figureText}${goal > 0 ? `, of ${formatAmount(goal)} ${unit}` : ''}. ${t.openHint}`}
                  style={styles.metric}
                >
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {m.label}
                  </Text>
                  <View style={styles.metricValue}>
                    <Text variant="bodyStrong" tabular numberOfLines={1}>
                      {unknown ? '—' : `${missing > 0 ? '≥ ' : ''}${formatAmount(value)}`}
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
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      {onOpenNutrient && others.length > 0 ? (
        <>
          <Pressable
            testID="summary-all-nutrients"
            onPress={() => setExpanded(v => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={expanded ? t.fewerNutrients : t.allNutrients}
            style={styles.more}
          >
            <Text variant="smallStrong" tone="primary">
              {expanded ? t.fewerNutrients : t.allNutrients}
            </Text>
            <Icon as={expanded ? ChevronUp : ChevronDown} size="sm" tone="primary" />
          </Pressable>
          {expanded ? (
            <View style={{ marginTop: space.md }} testID="summary-more-list">
              {others.map((n, i) => {
                const value = totals[n.key]?.value ?? 0;
                const missing = totals[n.key]?.missingItems ?? 0;
                const unknown = itemCount > 0 && missing >= itemCount;
                const goal = goals[n.key] ?? 0;
                const figure = unknown ? '—' : `${missing > 0 ? '≥ ' : ''}${formatAmount(value)}`;
                return (
                  <React.Fragment key={n.key}>
                    {i > 0 ? <Divider /> : null}
                    <Pressable
                      testID={`summary-metric-${n.key}`}
                      onPress={() => onOpenNutrient(n.key)}
                      accessibilityRole="button"
                      accessibilityLabel={`${n.label}, ${unknown ? 'unknown' : `${missing > 0 ? 'at least ' : ''}${formatAmount(value)} ${n.unit}`}${goal > 0 ? `, of ${formatAmount(goal)} ${n.unit}` : ''}. ${t.openHint}`}
                      android_ripple={{ color: colors.ripple }}
                      style={styles.moreRow}
                    >
                      <View style={styles.moreBody}>
                        <Text variant="body">{n.label}</Text>
                        <Text variant="caption" tone="muted" tabular>
                          {goal > 0 ? fill(t.of, { value: `${formatAmount(goal)} ${n.unit}` }) : t.noReference}
                        </Text>
                      </View>
                      <Text variant="bodyStrong" tabular>
                        {figure}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {unknown ? '' : n.unit}
                      </Text>
                      <Icon as={ChevronRight} size="sm" tone="faint" />
                    </Pressable>
                  </React.Fragment>
                );
              })}
            </View>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
