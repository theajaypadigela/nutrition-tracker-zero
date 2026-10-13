import React from 'react';
import { Pressable, View } from 'react-native';
import { Badge, ProgressBar, Text } from '@/components/kit';
import { createStyles, space, useTheme } from '@/theme';
import type { WeeklyNutrient } from '@/types/nutrition';
import { fmtNum, helperText, statusLabel, statusOf, statusTone } from '@/utils/nutrition';

/** The bar's full width is 130% of the goal, so the goal tick sits at 100/130. */
const TICK = 100 / 130;

const useStyles = createStyles(() => ({
  row: { gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.lg },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.md },
  left: { flex: 1, minWidth: 0, gap: space.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  right: { alignItems: 'flex-end', gap: 2 },
}));

/** One nutrient in the weekly list: its verdict, the amount against the goal, and a bar with the goal marked. */
export function NutrientRow({
  nutrient,
  valueMode,
  onPress,
}: {
  nutrient: WeeklyNutrient;
  valueMode: 'absolute' | 'percent';
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  // Most vitamins and minerals have no default goal: show what was eaten, without a verdict.
  const hasGoal = nutrient.goal > 0;
  const status = statusOf(nutrient);
  const pct = hasGoal ? nutrient.amount / nutrient.goal : 0;
  const pctRounded = Math.round(pct * 100);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${nutrient.name}, ${fmtNum(nutrient.amount, nutrient.unit)}`}
      android_ripple={{ color: colors.ripple }}
      style={styles.row}
    >
      <View style={styles.top}>
        <View style={styles.left}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {nutrient.name}
          </Text>
          <View style={styles.meta}>
            {hasGoal ? (
              <Badge label={statusLabel(nutrient)} tone={statusTone[status]} />
            ) : (
              <Badge label="No goal" tone="neutral" />
            )}
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {hasGoal ? helperText(nutrient.dir) : 'Set a goal to track it'}
            </Text>
          </View>
        </View>
        <View style={styles.right}>
          <Text variant="bodyStrong" tabular>
            {valueMode === 'absolute' || !hasGoal ? fmtNum(nutrient.amount, nutrient.unit) : `${pctRounded}%`}
          </Text>
          <Text variant="caption" tone="muted" tabular>
            {!hasGoal ? 'no goal set' : valueMode === 'absolute' ? `of ${fmtNum(nutrient.goal, nutrient.unit)}` : 'of goal'}
          </Text>
        </View>
      </View>
      <ProgressBar
        value={Math.min(pct, 1.3) / 1.3}
        tone={hasGoal ? (statusTone[status] === 'success' ? 'primary' : statusTone[status]) : 'muted'}
        marker={hasGoal ? TICK : undefined}
      />
    </Pressable>
  );
}
