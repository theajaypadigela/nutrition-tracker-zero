import React, { useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, View } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { Button, Icon, Segmented, Sheet, Text } from '@/components/kit';
import { createStyles, radius, space } from '@/theme';
import type { WeeklyNutrient } from '@/types/nutrition';
import { fmtNum } from '@/utils/nutrition';

interface Props {
  visible: boolean;
  nutrient: WeeklyNutrient | null;
  /** The current weekly goal: the slider's centre. */
  baseGoal: number;
  onClose: () => void;
  onSave: (newGoal: number) => void;
}

const PRESETS = [
  { value: 'low', label: 'Low', factor: 0.6 },
  { value: 'default', label: 'Default', factor: 1 },
  { value: 'high', label: 'High', factor: 1.4 },
] as const;

const stepFor = (goal: number) => {
  if (goal >= 1000) return 50;
  if (goal >= 100) return 5;
  if (goal >= 10) return 0.5;
  return 0.1;
};

const TRACK_HEIGHT = 6;
const KNOB = 24;

const useStyles = createStyles(({ colors }) => ({
  value: {
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
  },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  step: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackWrap: { flex: 1, height: 40, justifyContent: 'center' },
  track: { height: TRACK_HEIGHT, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  fill: { height: TRACK_HEIGHT, backgroundColor: colors.primary },
  knob: {
    position: 'absolute',
    top: (40 - KNOB) / 2,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
  },
}));

/** Change a nutrient's weekly goal: a big number, a slider with steppers, and three presets. */
export function GoalSheet({ visible, nutrient, baseGoal, onClose, onSave }: Props) {
  const styles = useStyles();
  const [value, setValue] = useState(baseGoal);
  const [trackWidth, setTrackWidth] = useState(0);

  const min = baseGoal * 0.25;
  const max = baseGoal * 2.5;
  const step = stepFor(baseGoal);

  useEffect(() => {
    if (visible) setValue(baseGoal);
  }, [visible, baseGoal]);

  const clamp = (v: number) => Math.round(Math.max(min, Math.min(max, v)) / step) * step;

  // The PanResponder is created once, so it reads the live numbers through a ref.
  const live = useRef({ trackWidth, min, max, step });
  live.current = { trackWidth, min, max, step };
  const setFromTouch = useRef((locationX: number) => {
    const { trackWidth: w, min: lo, max: hi, step: s } = live.current;
    if (w <= KNOB) return;
    const ratio = Math.max(0, Math.min(1, (locationX - KNOB / 2) / (w - KNOB)));
    setValue(Math.round(Math.max(lo, Math.min(hi, lo + (hi - lo) * ratio)) / s) * s);
  }).current;
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: e => setFromTouch(e.nativeEvent.locationX),
      onPanResponderMove: e => setFromTouch(e.nativeEvent.locationX),
    }),
  ).current;

  if (!nutrient) return null;

  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  const knobLeft = trackWidth > KNOB ? ratio * (trackWidth - KNOB) : 0;
  const helper =
    nutrient.dir === 'higher'
      ? 'Aim to reach at least this amount each week.'
      : nutrient.dir === 'lower'
        ? 'Try to stay under this amount each week.'
        : 'Try to stay close to this amount each week.';
  const activePreset = PRESETS.find(p => Math.abs(value - baseGoal * p.factor) < step / 2)?.value ?? ('' as (typeof PRESETS)[number]['value']);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={`${nutrient.name} goal`}
      subtitle={helper}
      footer={<Button label="Save goal" size="lg" fullWidth onPress={() => onSave(value)} />}
    >
      <View style={styles.value}>
        <View style={styles.valueRow}>
          <Text variant="display" tone="primary" tabular>
            {fmtNum(value)}
          </Text>
          <Text variant="title3" tone="primary">
            {nutrient.unit}
          </Text>
        </View>
        <Text variant="small" tone="muted" tabular>
          ≈ {fmtNum(value / 7, nutrient.unit)} per day
        </Text>
      </View>

      <View style={styles.sliderRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Decrease" onPress={() => setValue(clamp(value - step))} style={styles.step}>
          <Icon as={Minus} size="md" tone="text" />
        </Pressable>
        <View
          style={styles.trackWrap}
          onLayout={e => setTrackWidth(e.nativeEvent.layout.width)}
          accessibilityRole="adjustable"
          accessibilityLabel={`${nutrient.name} weekly goal`}
          accessibilityValue={{ text: fmtNum(value, nutrient.unit) }}
          {...pan.panHandlers}
        >
          <View style={styles.track} pointerEvents="none">
            <View style={[styles.fill, { width: trackWidth > KNOB ? knobLeft + KNOB / 2 : 0 }]} />
          </View>
          <View style={[styles.knob, { left: knobLeft }]} pointerEvents="none" />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Increase" onPress={() => setValue(clamp(value + step))} style={styles.step}>
          <Icon as={Plus} size="md" tone="text" />
        </Pressable>
      </View>

      <Segmented
        options={PRESETS.map(p => ({ value: p.value, label: `${p.label} · ${Math.round(p.factor * 100)}%` }))}
        value={activePreset}
        onChange={v => setValue(clamp(baseGoal * (PRESETS.find(p => p.value === v)?.factor ?? 1)))}
      />
    </Sheet>
  );
}
