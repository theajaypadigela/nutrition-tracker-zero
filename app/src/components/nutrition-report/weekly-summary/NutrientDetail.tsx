import React from 'react';
import { tokens } from '@/theme/tokens';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { ChevronLeft, Plus, Check, AlertTriangle } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { WeeklyNutrient } from '@/types/nutrition';
import {
  statusOf,
  statusColorMap,
  weekDayLabels,
  fmtNum,
  headerGradientLocations,
} from './tokens';
import DayChart from './DayChart';

interface Props {
  nutrient: WeeklyNutrient;
  onBack: () => void;
  onSetGoal: () => void;
  statusBarInset?: number;
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
    if (status === 'good')
      return `You hit your weekly ${n.name.toLowerCase()} target.`;
    if (status === 'warn')
      return `${underPct}% short of your ${n.name.toLowerCase()} goal — almost there.`;
    return `${underPct}% below your ${n.name.toLowerCase()} goal this week.`;
  }
  if (n.dir === 'lower') {
    if (status === 'good')
      return `You stayed within your weekly ${n.name.toLowerCase()} limit.`;
    if (status === 'warn')
      return `Slightly over your ${n.name.toLowerCase()} limit — keep an eye on it.`;
    return `${overPct}% over your ${n.name.toLowerCase()} limit.`;
  }
  if (status === 'good')
    return `Your ${n.name.toLowerCase()} stayed in range this week.`;
  if (status === 'warn')
    return `Your ${n.name.toLowerCase()} is close to the edge of its target range.`;
  return `Your ${n.name.toLowerCase()} is outside its target range.`;
};

const NutrientDetail: React.FC<Props> = ({
  nutrient,
  onBack,
  onSetGoal,
  statusBarInset = 0,
}) => {
  const hasGoal = nutrient.goal > 0;
  const status = statusOf(nutrient);
  const colors = hasGoal
    ? statusColorMap[status]
    : { fg: tokens.report.inkSoft, bg: tokens.report.lineSoft };
  const labels = weekDayLabels();
  const dailyGoal = nutrient.dailyGoal ?? 0;
  const trend = nutrient.trend.length === 7 ? nutrient.trend : Array(7).fill(0);
  // Averaged over the days something was logged, so an unlogged day doesn't read as zero intake.
  const dailyAvg =
    trend.reduce((a, b) => a + b, 0) / Math.max(1, nutrient.loggedDays);
  const maxIdx = trend.reduce(
    (best, v, i) => (v > trend[best] ? i : best),
    0,
  );
  const minIdx = trend.reduce(
    (best, v, i) => (v < trend[best] ? i : best),
    0,
  );

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[...tokens.report.headerGradient]}
        locations={[...headerGradientLocations]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: statusBarInset + 12 }]}
      >
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={onBack} style={styles.iconBtn}>
            <ChevronLeft size={20} color={tokens.report.surface} strokeWidth={2.4} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Nutrient detail</Text>
          <TouchableOpacity onPress={onSetGoal} style={styles.setGoalBtn}>
            <Plus size={14} color={tokens.report.surface} strokeWidth={2.6} />
            <Text style={styles.setGoalText}>Set goal</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.headerBody}>
          <Text style={styles.eyebrow}>THIS WEEK</Text>
          <Text style={styles.nutrientName}>{nutrient.name}</Text>
          <View style={styles.valueRow}>
            <Text style={styles.bigValue}>{fmtNum(nutrient.amount)}</Text>
            <Text style={styles.bigUnit}>{nutrient.unit}</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.verdictCard, { backgroundColor: colors.bg }]}>
          <View
            style={[styles.verdictBadge, { backgroundColor: colors.fg }]}
          >
            {hasGoal && status === 'good' ? (
              <Check size={14} color={tokens.report.surface} strokeWidth={3} />
            ) : (
              <AlertTriangle size={14} color={tokens.report.surface} strokeWidth={2.6} />
            )}
          </View>
          <Text style={[styles.verdictText, { color: colors.fg }]}>
            {verdictText(nutrient)}
          </Text>
        </View>

        <DayChart
          values={trend}
          dailyGoal={dailyGoal}
          unit={nutrient.unit}
          color={colors.fg}
        />

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>DAILY AVG</Text>
            <Text style={styles.statValue}>
              {fmtNum(dailyAvg, nutrient.unit)}
            </Text>
            <Text style={styles.statSub}>
              on {nutrient.loggedDays} logged day{nutrient.loggedDays === 1 ? '' : 's'}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>DAILY GOAL</Text>
            <Text style={styles.statValue}>
              {dailyGoal > 0 ? fmtNum(dailyGoal, nutrient.unit) : '—'}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>BEST DAY</Text>
            <Text style={styles.statValue}>
              {fmtNum(trend[maxIdx], nutrient.unit)}
            </Text>
            <Text style={styles.statSub}>{labels[maxIdx]}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>LOWEST DAY</Text>
            <Text style={styles.statValue}>
              {fmtNum(trend[minIdx], nutrient.unit)}
            </Text>
            <Text style={styles.statSub}>{labels[minIdx]}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.report.bg,
  },
  header: {
    paddingTop: 12,
    paddingBottom: 22,
    paddingHorizontal: 18,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: tokens.report.surface,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  setGoalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  setGoalText: {
    color: tokens.report.surface,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  headerBody: {
    marginTop: 18,
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  nutrientName: {
    color: tokens.report.surface,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 4,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginTop: 6,
  },
  bigValue: {
    color: tokens.report.surface,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 36,
  },
  bigUnit: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    fontWeight: '700',
    paddingBottom: 4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 40,
    gap: 14,
  },
  verdictCard: {
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  verdictBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verdictText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: tokens.report.surface,
    borderWidth: 1,
    borderColor: tokens.report.lineSoft,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statLabel: {
    color: tokens.report.inkMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  statValue: {
    color: tokens.report.ink,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginTop: 4,
  },
  statSub: {
    color: tokens.report.inkSoft,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
});

export default NutrientDetail;
