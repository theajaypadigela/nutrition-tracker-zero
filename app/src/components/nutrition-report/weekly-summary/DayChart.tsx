import React, { useState } from 'react';
import { tokens } from '@/theme/tokens';
import { View, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { Text } from '@/components/ui/text';
import { weekDayLabels, fmtNum } from './tokens';

interface Props {
  values: number[]; // length 7, Mon..Sun
  dailyGoal: number;
  unit: string;
  color: string;
}

const CHART_HEIGHT = 160;
const PADDING_TOP = 18;
const PADDING_BOTTOM = 24;

const DayChart: React.FC<Props> = ({ values, dailyGoal, unit, color }) => {
  const [chartWidth, setChartWidth] = useState(0);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const labels = weekDayLabels();
  const usableHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const maxVal = Math.max(dailyGoal, ...values, 1) * 1.1;
  const goalRatio = dailyGoal > 0 ? dailyGoal / maxVal : 0;
  const goalY = PADDING_TOP + usableHeight * (1 - goalRatio);

  return (
    <View style={styles.card}>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSquare, { backgroundColor: color }]} />
          <Text style={styles.legendText}>intake</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.legendDashWrap}>
            <View style={styles.legendDash} />
            <View style={styles.legendDash} />
            <View style={styles.legendDash} />
          </View>
          <Text style={styles.legendText}>daily goal</Text>
        </View>
      </View>

      <View
        style={styles.chartArea}
        onLayout={e => setChartWidth(e.nativeEvent.layout.width)}
      >
        {chartWidth > 0 && dailyGoal > 0 && (
          <Svg
            width={chartWidth}
            height={CHART_HEIGHT}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          >
            <Line
              x1={0}
              x2={chartWidth}
              y1={goalY}
              y2={goalY}
              stroke={tokens.report.inkMuted}
              strokeWidth={1}
              strokeDasharray="4,4"
              opacity={0.55}
            />
          </Svg>
        )}

        <View style={styles.barsRow}>
          {values.map((v, i) => {
            const ratio = Math.max(0, Math.min(1, v / maxVal));
            const barH = ratio * usableHeight;
            const isActive = activeIdx === i;
            return (
              <TouchableWithoutFeedback
                key={i}
                onPress={() => setActiveIdx(isActive ? null : i)}
              >
                <View style={styles.barSlot}>
                  <View style={styles.barInner}>
                    {isActive && (
                      <View style={styles.tooltip}>
                        <Text style={styles.tooltipText}>
                          {fmtNum(v, unit)}
                        </Text>
                      </View>
                    )}
                    <View
                      style={[
                        styles.bar,
                        v === 0 && styles.barEmpty,
                        {
                          height: barH,
                          backgroundColor: color,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.dayLabel}>{labels[i]}</Text>
                </View>
              </TouchableWithoutFeedback>
            );
          })}
        </View>

        {dailyGoal > 0 && (
          <View
            style={[
              styles.goalBadge,
              { top: Math.max(2, goalY - 9) },
            ]}
            pointerEvents="none"
          >
            <Text style={styles.goalBadgeText}>Goal</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.report.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: tokens.report.lineSoft,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 14,
    marginBottom: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendSquare: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendDashWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1.5,
    width: 14,
  },
  legendDash: {
    width: 3,
    height: 1.5,
    backgroundColor: tokens.report.inkMuted,
    borderRadius: 1,
  },
  legendText: {
    color: tokens.report.inkMuted,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  barsRow: {
    flexDirection: 'row',
    height: CHART_HEIGHT,
    paddingHorizontal: 0,
  },
  barSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 2,
    paddingBottom: 4,
  },
  barInner: {
    flex: 1,
    width: '55%',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  bar: {
    width: '100%',
    borderRadius: 4,
  },
  barEmpty: {
    opacity: 0.25,
  },
  chartArea: {
    height: CHART_HEIGHT,
    position: 'relative',
  },
  dayLabel: {
    color: tokens.report.inkMuted,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 6,
  },
  tooltip: {
    position: 'absolute',
    top: -28,
    alignSelf: 'center',
    backgroundColor: tokens.report.ink,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    zIndex: 5,
  },
  tooltipText: {
    color: tokens.report.surface,
    fontSize: 10,
    fontWeight: '700',
  },
  goalBadge: {
    position: 'absolute',
    right: 0,
    backgroundColor: tokens.report.surface,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: tokens.report.lineSoft,
  },
  goalBadgeText: {
    color: tokens.report.inkMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});

export default DayChart;
