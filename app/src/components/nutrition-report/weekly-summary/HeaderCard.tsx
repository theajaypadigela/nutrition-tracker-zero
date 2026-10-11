import React from 'react';
import { tokens } from '@/theme/tokens';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import GradeRing from './GradeRing';
import {
  headerGradientLocations,
  verdictOf,
  gradeOf,
} from './tokens';

interface Props {
  title?: string;
  weekLabel: string;
  weekIdx: number;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onBack?: () => void;
  score: number;
  onTrack: number;
  tracked: number;
  hitRate: number;
  statusBarInset?: number;
}

const DotGrid: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  const dots = [];
  const spacing = 16;
  for (let y = spacing / 2; y < height; y += spacing) {
    for (let x = spacing / 2; x < width; x += spacing) {
      dots.push(<Circle key={`${x}-${y}`} cx={x} cy={y} r={1} fill="rgba(255,255,255,0.07)" />);
    }
  }
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      {dots}
    </Svg>
  );
};

const Orb: React.FC = () => (
  <Svg width={220} height={220} style={styles.orb}>
    <Defs>
      <RadialGradient id="orbGrad" cx="50%" cy="50%" r="50%">
        <Stop offset="0%" stopColor={tokens.report.green} stopOpacity={0.4} />
        <Stop offset="100%" stopColor={tokens.report.green} stopOpacity={0} />
      </RadialGradient>
    </Defs>
    <Circle cx={110} cy={110} r={110} fill="url(#orbGrad)" />
  </Svg>
);

const MiniStat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.miniStat}>
    <Text style={styles.miniStatValue}>{value}</Text>
    <Text style={styles.miniStatLabel}>{label}</Text>
  </View>
);

const HeaderCard: React.FC<Props> = ({
  title = 'Nutrition',
  weekLabel,
  weekIdx,
  onPrevWeek,
  onNextWeek,
  onBack,
  score,
  onTrack,
  tracked,
  hitRate,
  statusBarInset = 0,
}) => {
  const verdict = verdictOf(score);
  const grade = gradeOf(score);
  const isCurrentWeek = weekIdx === 0;
  const weekLabelText = weekIdx === 0 ? 'THIS WEEK' : weekIdx === -1 ? 'LAST WEEK' : `WEEK ${weekIdx}`;

  return (
    <LinearGradient
      colors={[...tokens.report.headerGradient]}
      locations={[...headerGradientLocations]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, { paddingTop: statusBarInset + 12 }]}
    >
      <View style={styles.dotGridWrap} pointerEvents="none">
        <DotGrid width={500} height={300} />
      </View>
      <View style={styles.orbWrap} pointerEvents="none">
        <Orb />
      </View>

      <View style={styles.topRow}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.iconBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevronLeft size={20} color={tokens.report.surface} strokeWidth={2.4} />
        </TouchableOpacity>
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <View style={styles.topRowSpacer} />
      </View>

      <View style={styles.weekNav}>
        <TouchableOpacity onPress={onPrevWeek} style={styles.weekChevron} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ChevronLeft size={18} color={tokens.report.surface} strokeWidth={2.4} />
        </TouchableOpacity>
        <View style={styles.weekLabelStack}>
          <Text style={styles.weekEyebrow}>{weekLabelText}</Text>
          <Text style={styles.weekRange}>{weekLabel}</Text>
        </View>
        <TouchableOpacity
          disabled={isCurrentWeek}
          onPress={onNextWeek}
          style={[styles.weekChevron, isCurrentWeek && styles.weekChevronDisabled]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevronRight size={18} color={tokens.report.surface} strokeWidth={2.4} />
        </TouchableOpacity>
      </View>

      <View style={styles.scoreRow}>
        <GradeRing score={score} grade={grade} />
        <View style={styles.scoreText}>
          <Text style={styles.eyebrow}>WEEKLY SCORE</Text>
          <Text style={styles.verdict}>{verdict}</Text>
          <View style={styles.miniStatStrip}>
            <MiniStat label="On track" value={`${onTrack}`} />
            <View style={styles.miniDivider} />
            <MiniStat label="Tracked" value={`${tracked}`} />
            <View style={styles.miniDivider} />
            <MiniStat label="Hit rate" value={`${hitRate}%`} />
          </View>
        </View>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: 12,
    paddingHorizontal: 18,
    paddingBottom: 22,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  dotGridWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  orbWrap: {
    position: 'absolute',
    top: -60,
    right: -60,
  },
  orb: {
    opacity: 0.9,
  },
  topRow: {
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
  titleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  topRowSpacer: {
    width: 38,
    height: 38,
  },
  title: {
    color: tokens.report.surface,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 6,
    marginTop: 10,
  },
  weekChevron: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekChevronDisabled: {
    opacity: 0.35,
  },
  weekLabelStack: {
    flex: 1,
    alignItems: 'center',
  },
  weekEyebrow: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  weekRange: {
    color: tokens.report.surface,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
    letterSpacing: 0.1,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    gap: 18,
  },
  scoreText: {
    flex: 1,
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  verdict: {
    color: tokens.report.surface,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 4,
  },
  miniStatStrip: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 14,
  },
  miniStat: {
    flex: 1,
    minWidth: 0,
  },
  miniStatValue: {
    color: tokens.report.surface,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  miniStatLabel: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
    letterSpacing: 0.3,
  },
  miniDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginHorizontal: 8,
  },
});

export default HeaderCard;
