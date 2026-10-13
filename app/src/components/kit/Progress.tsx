import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { radius, useTheme } from '@/theme';

export type ProgressTone = 'primary' | 'warning' | 'danger' | 'muted';

function useToneColor(tone: ProgressTone): string {
  const { colors } = useTheme();
  return tone === 'warning' ? colors.warning : tone === 'danger' ? colors.danger : tone === 'muted' ? colors.textFaint : colors.primary;
}

/**
 * A thin bar. `value` is 0–1 (clamped). `marker` draws a tick at that fraction, for a target
 * the bar can run past.
 */
export function ProgressBar({
  value,
  tone = 'primary',
  height = 6,
  marker,
}: {
  value: number;
  tone?: ProgressTone;
  height?: number;
  marker?: number;
}) {
  const { colors } = useTheme();
  const fill = useToneColor(tone);
  const v = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  return (
    <View style={{ height, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden' }}>
      <View style={{ width: `${v > 0 ? Math.max(v * 100, 2) : 0}%`, height, borderRadius: radius.pill, backgroundColor: fill }} />
      {marker !== undefined ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${Math.max(0, Math.min(1, marker)) * 100}%`,
            width: 2,
            marginLeft: -1,
            backgroundColor: colors.text,
            opacity: 0.4,
          }}
        />
      ) : null}
    </View>
  );
}

/** A ring with its content centred inside. */
export function ProgressRing({
  progress,
  size = 104,
  stroke = 8,
  tone = 'primary',
  children,
}: {
  progress: number;
  size?: number;
  stroke?: number;
  tone?: ProgressTone;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const color = useToneColor(tone);
  const p = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={c} cy={c} r={r} stroke={colors.surfaceMuted} strokeWidth={stroke} fill="none" />
        {p > 0 ? (
          <Circle
            cx={c}
            cy={c}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference * p} ${circumference}`}
            rotation={-90}
            origin={`${c}, ${c}`}
            fill="none"
          />
        ) : null}
      </Svg>
      {children}
    </View>
  );
}
