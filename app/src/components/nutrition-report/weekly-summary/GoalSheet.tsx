import React, { useEffect, useRef, useState } from 'react';
import { tokens } from '@/theme/tokens';
import {
  View,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Animated,
  PanResponder,
  StyleSheet,
  Pressable,
  Easing,
} from 'react-native';
import { X, Plus, Minus } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { WeeklyNutrient } from '@/types/nutrition';
import { fmtNum } from './tokens';

interface Props {
  visible: boolean;
  nutrient: WeeklyNutrient | null;
  baseGoal: number;
  onClose: () => void;
  onSave: (newGoal: number) => void;
}

const PRESETS = [
  { label: 'Low', factor: 0.6 },
  { label: 'Default', factor: 1 },
  { label: 'High', factor: 1.4 },
];

const stepFor = (goal: number) => {
  if (goal >= 1000) return 50;
  if (goal >= 100) return 5;
  if (goal >= 10) return 0.5;
  return 0.1;
};

const TRACK_HEIGHT = 6;
const KNOB_SIZE = 22;

const GoalSheet: React.FC<Props> = ({
  visible,
  nutrient,
  baseGoal,
  onClose,
  onSave,
}) => {
  const [value, setValue] = useState(baseGoal);
  const [trackWidth, setTrackWidth] = useState(0);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const min = baseGoal * 0.25;
  const max = baseGoal * 2.5;
  const step = stepFor(baseGoal);

  useEffect(() => {
    if (visible) {
      setValue(baseGoal);
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, baseGoal, slideAnim, fadeAnim]);

  const setClampedValue = (v: number) => {
    const clamped = Math.max(min, Math.min(max, v));
    const snapped = Math.round(clamped / step) * step;
    setValue(snapped);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {},
      onPanResponderMove: () => {},
      onPanResponderRelease: () => {},
    }),
  ).current;

  const onTrackLayout = (e: any) => setTrackWidth(e.nativeEvent.layout.width);

  const handleTrackTouch = (locationX: number) => {
    if (trackWidth <= 0) return;
    const inset = KNOB_SIZE / 2;
    const usable = Math.max(1, trackWidth - KNOB_SIZE);
    const r = Math.max(0, Math.min(1, (locationX - inset) / usable));
    const v = min + (max - min) * r;
    setClampedValue(v);
  };

  const trackPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: e => handleTrackTouch(e.nativeEvent.locationX),
      onPanResponderMove: e => handleTrackTouch(e.nativeEvent.locationX),
    }),
  ).current;

  if (!nutrient) return null;

  const safeRange = max - min || 1;
  const ratio = Math.max(0, Math.min(1, (value - min) / safeRange));
  const knobInset = KNOB_SIZE / 2;
  const knobTravel = Math.max(0, trackWidth - KNOB_SIZE);
  const knobLeft = trackWidth > 0 ? ratio * knobTravel : 0;
  const fillW =
    trackWidth > 0 ? Math.min(trackWidth, knobLeft + knobInset) : 0;
  const dailyEquiv = value / 7;

  const helper =
    nutrient.dir === 'higher'
      ? 'Aim to reach at least this amount each week.'
      : nutrient.dir === 'lower'
      ? 'Try to stay under this amount each week.'
      : 'Try to stay close to this amount each week.';

  const sheetTransform = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [600, 0],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View
            style={[styles.backdrop, { opacity: fadeAnim }]}
          />
        </TouchableWithoutFeedback>
        <Animated.View
          style={[
            styles.sheet,
            { transform: [{ translateY: sheetTransform }] },
          ]}
          {...panResponder.panHandlers}
        >
          <View style={styles.grabber} />

          <View style={styles.headerRow}>
            <View style={styles.headerTextCol}>
              <Text style={styles.eyebrow}>WEEKLY GOAL</Text>
              <Text style={styles.titleText}>{nutrient.name}</Text>
              <Text style={styles.helperText}>{helper}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={16} color={tokens.report.ink} strokeWidth={2.4} />
            </TouchableOpacity>
          </View>

          <View style={styles.valueCard}>
            <View style={styles.valueRow}>
              <Text style={styles.bigValue}>{fmtNum(value)}</Text>
              <Text style={styles.bigUnit}>{nutrient.unit}</Text>
            </View>
            <Text style={styles.dailyText}>
              ≈ {fmtNum(dailyEquiv, nutrient.unit)} per day
            </Text>
          </View>

          <View style={styles.sliderRow}>
            <TouchableOpacity
              onPress={() => setClampedValue(value - step)}
              style={styles.stepBtn}
            >
              <Minus size={16} color={tokens.report.ink} strokeWidth={2.4} />
            </TouchableOpacity>

            <View
              style={styles.trackWrapper}
              onLayout={onTrackLayout}
              {...trackPanResponder.panHandlers}
            >
              <View style={styles.track}>
                <View style={[styles.trackFill, { width: fillW }]} />
              </View>
              <View style={[styles.knob, { left: knobLeft }]} />
            </View>

            <TouchableOpacity
              onPress={() => setClampedValue(value + step)}
              style={styles.stepBtn}
            >
              <Plus size={16} color={tokens.report.ink} strokeWidth={2.4} />
            </TouchableOpacity>
          </View>

          <View style={styles.presetRow}>
            {PRESETS.map(p => {
              const presetVal = baseGoal * p.factor;
              const isActive = Math.abs(value - presetVal) < step / 2;
              return (
                <Pressable
                  key={p.label}
                  onPress={() => setClampedValue(presetVal)}
                  style={[
                    styles.presetChip,
                    isActive && styles.presetChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.presetText,
                      isActive && styles.presetTextActive,
                    ]}
                  >
                    {p.label}
                  </Text>
                  <Text
                    style={[
                      styles.presetSub,
                      isActive && styles.presetSubActive,
                    ]}
                  >
                    {Math.round(p.factor * 100)}%
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.saveBtn}
            onPress={() => onSave(value)}
            activeOpacity={0.85}
          >
            <Text style={styles.saveText}>Save goal</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,20,32,0.45)',
  },
  sheet: {
    backgroundColor: tokens.report.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 28,
    shadowColor: tokens.report.shadow,
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: -8 },
    shadowRadius: 30,
    elevation: 12,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.report.line,
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerTextCol: {
    flex: 1,
  },
  eyebrow: {
    color: tokens.report.inkMuted,
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  titleText: {
    color: tokens.report.ink,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginTop: 2,
  },
  helperText: {
    color: tokens.report.inkSoft,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
    paddingRight: 12,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: tokens.report.lineSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueCard: {
    backgroundColor: tokens.report.greenSoft,
    borderWidth: 1,
    borderColor: 'rgba(14,155,109,0.18)',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 18,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  bigValue: {
    color: tokens.report.greenDeep,
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 42,
  },
  bigUnit: {
    color: tokens.report.greenDeep,
    fontSize: 16,
    fontWeight: '700',
    paddingBottom: 6,
  },
  dailyText: {
    color: tokens.report.greenDeep,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
    opacity: 0.85,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.report.lineSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackWrapper: {
    flex: 1,
    height: KNOB_SIZE,
    justifyContent: 'center',
    position: 'relative',
  },
  track: {
    height: TRACK_HEIGHT,
    backgroundColor: tokens.report.lineSoft,
    borderRadius: 999,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    backgroundColor: tokens.report.green,
  },
  knob: {
    position: 'absolute',
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: KNOB_SIZE / 2,
    backgroundColor: tokens.report.surface,
    borderWidth: 2,
    borderColor: tokens.report.green,
    top: 0,
    shadowColor: tokens.report.green,
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 3,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  presetChip: {
    flex: 1,
    backgroundColor: tokens.report.surface,
    borderWidth: 1,
    borderColor: tokens.report.line,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  presetChipActive: {
    backgroundColor: tokens.report.greenSoft,
    borderColor: tokens.report.green,
  },
  presetText: {
    color: tokens.report.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  presetTextActive: {
    color: tokens.report.greenDeep,
  },
  presetSub: {
    color: tokens.report.inkMuted,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  presetSubActive: {
    color: tokens.report.greenDeep,
    opacity: 0.8,
  },
  saveBtn: {
    backgroundColor: tokens.report.green,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: tokens.report.green,
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 14,
    elevation: 6,
  },
  saveText: {
    color: tokens.report.surface,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

export default GoalSheet;
