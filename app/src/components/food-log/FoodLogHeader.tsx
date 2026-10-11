import React from 'react';
import { tokens } from '@/theme/tokens';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from '../ui/text';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { ChevronLeft, ChevronRight, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface FoodLogHeaderProps {
  dateLabel: string;
  consumed: number;
  target: number;
  onPrevDay: () => void;
  onNextDay: () => void;
  nextDisabled: boolean;
  profileInitials: string;
  onProfilePress: () => void;
}

/**
 * The old Food Log's gradient header. Today is a tab root, so the back arrow became
 * previous/next-day buttons around the date, and the AppBar's avatar shortcut moved in here.
 */
export const FoodLogHeader: React.FC<FoodLogHeaderProps> = ({
  dateLabel,
  consumed,
  target,
  onPrevDay,
  onNextDay,
  nextDisabled,
  profileInitials,
  onProfilePress,
}) => {
  const insets = useSafeAreaInsets();
  const remaining = Math.max(0, Math.round(target - consumed));
  const pct = target > 0 ? Math.min(1, consumed / target) : 0;

  const size = 132;
  const stroke = 11;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;

  return (
    <LinearGradient
      colors={[tokens.foodLog.greenBright, tokens.foodLog.green, tokens.foodLog.greenDeep]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[styles.container, { paddingTop: Math.max(insets.top, 8) }]}
    >
      {/* decorative ring */}
      <View style={styles.decorRing} pointerEvents="none" />

      {/* top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={onPrevDay}
          style={styles.iconBtn}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Previous day"
        >
          <ChevronLeft size={20} color={tokens.foodLog.surface} strokeWidth={2.2} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.screenTitle}>Food log</Text>
          <Text style={styles.dateText} numberOfLines={1}>
            {dateLabel}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onNextDay}
          disabled={nextDisabled}
          style={[styles.iconBtn, nextDisabled && styles.iconBtnDisabled]}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Next day"
        >
          <ChevronRight size={20} color={tokens.foodLog.surface} strokeWidth={2.2} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onProfilePress}
          style={styles.iconBtn}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
        >
          {profileInitials ? (
            <Text style={styles.initials}>{profileInitials}</Text>
          ) : (
            <User size={18} color={tokens.foodLog.surface} strokeWidth={2.3} />
          )}
        </TouchableOpacity>
      </View>

      {/* calorie hero */}
      <View style={styles.hero}>
        {/* circular progress ring */}
        <View style={styles.ringWrap}>
          <Svg
            width={size}
            height={size}
            style={{ transform: [{ rotate: '-90deg' }] }}
          >
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke="rgba(255,255,255,0.18)"
              strokeWidth={stroke}
              fill="none"
            />
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={tokens.foodLog.surface}
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${circ * pct} ${circ}`}
            />
          </Svg>
          <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
            <View style={styles.ringCenter}>
              <Text style={styles.consumedVal}>{Math.round(consumed).toLocaleString()}</Text>
              <Text style={styles.kcalLabel}>kcal eaten</Text>
            </View>
          </View>
        </View>

        {/* right stats */}
        <View style={{ flex: 1 }}>
          <View>
            <Text style={styles.statLabel}>REMAINING</Text>
            <View style={styles.statValRow}>
              <Text style={styles.statValueBig}>{remaining.toLocaleString()}</Text>
              <Text style={styles.statUnit}>kcal</Text>
            </View>
          </View>
          <View style={styles.statDivider} />
          <View>
            <Text style={styles.statLabel}>DAILY TARGET</Text>
            <View style={styles.statValRow}>
              <Text style={styles.statValue}>{target.toLocaleString()}</Text>
              <Text style={styles.statUnit}>kcal</Text>
            </View>
          </View>
        </View>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 18,
    paddingBottom: 64,
    overflow: 'hidden',
  },
  decorRing: {
    position: 'absolute',
    right: -70,
    top: -50,
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 30,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnDisabled: {
    opacity: 0.35,
  },
  initials: {
    fontSize: 13,
    fontWeight: '800',
    color: tokens.foodLog.surface,
    letterSpacing: 0.3,
  },
  screenTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: tokens.foodLog.surface,
    letterSpacing: -0.2,
  },
  dateText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.82)',
    fontWeight: '500',
    marginTop: 1,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    gap: 20,
  },
  ringWrap: {
    width: 132,
    height: 132,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  consumedVal: {
    fontSize: 34,
    fontWeight: '800',
    color: tokens.foodLog.surface,
    letterSpacing: -1,
    lineHeight: 38,
  },
  kcalLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  statValRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
    marginTop: 3,
  },
  statLabel: {
    fontSize: 10.5,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  statValueBig: {
    fontSize: 26,
    fontWeight: '800',
    color: tokens.foodLog.surface,
    letterSpacing: -0.5,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: tokens.foodLog.surface,
    letterSpacing: -0.3,
  },
  statUnit: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
  },
  statDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginVertical: 12,
  },
});
