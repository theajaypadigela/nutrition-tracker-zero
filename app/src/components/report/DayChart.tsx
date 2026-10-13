import React, { useState } from 'react';
import { StyleSheet, TouchableWithoutFeedback, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { Card, Text, type ProgressTone } from '@/components/kit';
import { createStyles, radius, space, useTheme } from '@/theme';
import { fmtNum, weekDayLabels } from '@/utils/nutrition';

interface Props {
  /** Seven values, Monday first; null for a day that was not assessed (no bar, not a zero). */
  values: (number | null)[];
  dailyGoal: number;
  unit: string;
  tone: ProgressTone;
  /** What the dashed line is called: "Reference" for a general reference, "Target" for a person's own. */
  referenceLabel?: string;
  /** Draw without the card around it, for a chart inside a card. */
  bare?: boolean;
  /** Read by the screen reader in place of seven separate bars. */
  summary?: string;
}

const CHART_HEIGHT = 168;
const PADDING_TOP = 22;
const PADDING_BOTTOM = 26;

const useStyles = createStyles(({ colors }) => ({
  legend: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.lg, marginBottom: space.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  dashes: { flexDirection: 'row', alignItems: 'center', gap: 2, width: 16 },
  dash: { width: 4, height: 1.5, backgroundColor: colors.textMuted, borderRadius: 1 },
  chart: { height: CHART_HEIGHT },
  bars: { flexDirection: 'row', height: CHART_HEIGHT },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 3 },
  inner: { flex: 1, width: '58%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: radius.sm - 2 },
  empty: { opacity: 0.25 },
  label: { marginTop: 6 },
  tooltip: {
    position: 'absolute',
    top: -26,
    alignSelf: 'center',
    backgroundColor: colors.text,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    zIndex: 5,
  },
  goalTag: {
    position: 'absolute',
    right: 0,
    backgroundColor: colors.surface,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
}));

/** A week as seven bars against a dashed daily-goal line. Tap a bar for its value. */
export function DayChart({ values, dailyGoal, unit, tone, referenceLabel = 'Reference', bare, summary }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const labels = weekDayLabels();
  const color = tone === 'warning' ? colors.warning : tone === 'danger' ? colors.danger : tone === 'muted' ? colors.textFaint : colors.primary;
  const usable = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const max = Math.max(dailyGoal, ...values.map(v => v ?? 0), 1) * 1.1;
  const goalY = PADDING_TOP + usable * (1 - (dailyGoal > 0 ? dailyGoal / max : 0));

  const content = (
    <>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: color }]} />
          <Text variant="caption" tone="muted">
            Intake
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.dashes}>
            <View style={styles.dash} />
            <View style={styles.dash} />
            <View style={styles.dash} />
          </View>
          <Text variant="caption" tone="muted">
            {`Daily ${referenceLabel.toLowerCase()}`}
          </Text>
        </View>
      </View>

      <View style={styles.chart} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && dailyGoal > 0 ? (
          <Svg width={width} height={CHART_HEIGHT} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Line x1={0} x2={width} y1={goalY} y2={goalY} stroke={colors.textMuted} strokeWidth={1} strokeDasharray="4,4" opacity={0.6} />
          </Svg>
        ) : null}

        <View style={styles.bars}>
          {values.map((v, i) => {
            const barHeight = Math.max(0, Math.min(1, (v ?? 0) / max)) * usable;
            const isActive = active === i;
            return (
              <TouchableWithoutFeedback
                key={i}
                onPress={() => setActive(isActive ? null : i)}
                accessibilityLabel={v === null ? `${labels[i]}, no figure` : `${labels[i]}, ${fmtNum(v, unit)}`}
              >
                <View style={styles.slot}>
                  <View style={styles.inner}>
                    {isActive ? (
                      <View style={styles.tooltip}>
                        <Text variant="caption" style={{ color: colors.bg }} tabular>
                          {v === null ? 'No figure' : fmtNum(v, unit)}
                        </Text>
                      </View>
                    ) : null}
                    <View style={[styles.bar, !v ? styles.empty : null, { height: !v ? 3 : barHeight, backgroundColor: color }]} />
                  </View>
                  <Text
                    variant="caption"
                    tone={isActive ? 'text' : 'muted'}
                    style={styles.label}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {labels[i]}
                  </Text>
                </View>
              </TouchableWithoutFeedback>
            );
          })}
        </View>

        {dailyGoal > 0 ? (
          <View style={[styles.goalTag, { top: Math.max(2, goalY - 9) }]} pointerEvents="none">
            <Text variant="caption" tone="muted">
              {referenceLabel}
            </Text>
          </View>
        ) : null}
      </View>
    </>
  );
  if (bare) {
    return (
      <View accessible={!!summary} accessibilityLabel={summary}>
        {content}
      </View>
    );
  }
  return (
    <Card padding="lg" testID="day-chart">
      {content}
    </Card>
  );
}
