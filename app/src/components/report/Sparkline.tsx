import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { useTheme } from '@/theme';

const PAD = 6;

/**
 * A small line over a few weeks. A missing value (a week with too few logged days) is a gap in the line, never a zero
 * (plan 5.7). Every chart has a text summary for the screen reader (plan 11.6).
 */
export function Sparkline({
  values,
  accessibilityLabel,
  height = 44,
  reference,
}: {
  values: (number | null)[];
  accessibilityLabel: string;
  height?: number;
  /** A dashed reference line, drawn at this value (a target). */
  reference?: number;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const known = values.filter((v): v is number => v !== null);
  const all = reference !== undefined ? [...known, reference] : known;
  const lo = all.length ? Math.min(...all) : 0;
  const hi = all.length ? Math.max(...all) : 1;
  const span = hi - lo || 1;
  const usableW = Math.max(0, width - PAD * 2);
  const x = (i: number) => (values.length > 1 ? PAD + (usableW * i) / (values.length - 1) : width / 2);
  const y = (v: number) => (hi === lo ? height / 2 : PAD + (height - PAD * 2) * (1 - (v - lo) / span));

  // Runs of known values, so a gap breaks the line.
  const runs: { i: number; v: number }[][] = [];
  values.forEach((v, i) => {
    if (v === null) return;
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1]!.i === i - 1) last.push({ i, v });
    else runs.push([{ i, v }]);
  });
  const lastKnown = values.reduce<number>((a, v, i) => (v === null ? a : i), -1);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={{ height }}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 ? (
        <Svg width={width} height={height}>
          {reference !== undefined ? (
            <Line
              x1={PAD}
              x2={width - PAD}
              y1={y(reference)}
              y2={y(reference)}
              stroke={colors.textMuted}
              strokeWidth={1}
              strokeDasharray="4,4"
              opacity={0.6}
            />
          ) : null}
          {runs.map((run, r) =>
            run.length > 1 ? (
              <Polyline
                key={r}
                points={run.map(p => `${x(p.i)},${y(p.v)}`).join(' ')}
                fill="none"
                stroke={colors.primary}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null,
          )}
          {values.map((v, i) =>
            v === null ? null : (
              <Circle
                key={i}
                cx={x(i)}
                cy={y(v)}
                r={i === lastKnown ? 4 : 2.5}
                fill={i === lastKnown ? colors.primary : colors.surface}
                stroke={colors.primary}
                strokeWidth={1.5}
              />
            ),
          )}
        </Svg>
      ) : null}
    </View>
  );
}

/** "Last eight weeks: 70, 74, no data, 80": the text of a sparkline, for the screen reader. */
export function sparklineSummary(title: string, values: (number | null)[], unit = ''): string {
  return `${title}: ${values.map(v => (v === null ? 'no data' : `${v}${unit}`)).join(', ')}`;
}
