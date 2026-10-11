import React from 'react';
import { tokens } from '@/theme/tokens';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/text';
import { WeeklyNutrient } from '@/types/nutrition';
import {
  statusOf,
  statusLabel,
  statusColorMap,
  helperText,
  fmtNum,
} from './tokens';

interface Props {
  nutrient: WeeklyNutrient;
  valueMode: 'absolute' | 'percent';
  onPress: () => void;
}

const TICK_FRACTION = 100 / 130;

const NO_GOAL_COLORS = { fg: tokens.report.inkMuted, bg: tokens.report.lineSoft };

const NutrientRow: React.FC<Props> = ({ nutrient, valueMode, onPress }) => {
  // Most vitamins and minerals have no default goal: show what was eaten, without a verdict.
  const hasGoal = nutrient.goal > 0;
  const status = statusOf(nutrient);
  const colors = hasGoal ? statusColorMap[status] : NO_GOAL_COLORS;
  const pct = hasGoal ? nutrient.amount / nutrient.goal : 0;
  const fillFraction = Math.min(pct, 1.3) / 1.3;
  const pctRounded = Math.round(pct * 100);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.topRow}>
        <View style={styles.left}>
          <Text style={styles.name} numberOfLines={1}>
            {nutrient.name}
          </Text>
          <View style={styles.metaRow}>
            <View
              style={[styles.statusPill, { backgroundColor: colors.bg }]}
            >
              <Text style={[styles.statusText, { color: colors.fg }]}>
                {hasGoal ? statusLabel(nutrient) : 'NO GOAL'}
              </Text>
            </View>
            <Text style={styles.helper} numberOfLines={1}>
              {hasGoal ? helperText(nutrient.dir) : 'Set a goal to track it'}
            </Text>
          </View>
        </View>
        <View style={styles.right}>
          <Text style={styles.bigValue}>
            {valueMode === 'absolute' || !hasGoal
              ? fmtNum(nutrient.amount, nutrient.unit)
              : `${pctRounded}%`}
          </Text>
          <Text style={styles.subValue}>
            {!hasGoal
              ? 'no goal set'
              : valueMode === 'absolute'
              ? `of ${fmtNum(nutrient.goal, nutrient.unit)}`
              : 'of goal'}
          </Text>
        </View>
      </View>

      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            {
              width: `${fillFraction * 100}%`,
              backgroundColor: colors.fg,
            },
          ]}
        />
        {hasGoal ? (
          <View
            style={[styles.tick, { left: `${TICK_FRACTION * 100}%` }]}
            pointerEvents="none"
          />
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.report.surface,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: tokens.report.shadowSoft,
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 0,
    elevation: 1,
    borderWidth: 1,
    borderColor: tokens.report.lineSoft,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  left: {
    flex: 1,
    paddingRight: 12,
  },
  name: {
    color: tokens.report.ink,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  helper: {
    color: tokens.report.inkMuted,
    fontSize: 11,
    fontWeight: '500',
    flexShrink: 1,
  },
  right: {
    alignItems: 'flex-end',
  },
  bigValue: {
    color: tokens.report.ink,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subValue: {
    color: tokens.report.inkMuted,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  barTrack: {
    height: 8,
    backgroundColor: tokens.report.lineSoft,
    borderRadius: 999,
    overflow: 'hidden',
    position: 'relative',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
  },
  tick: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    backgroundColor: tokens.report.ink,
    opacity: 0.55,
  },
});

export default NutrientRow;
