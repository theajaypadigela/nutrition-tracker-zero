import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../ui/text';
import { Drumstick, Apple, Droplets, Cookie, Wheat, Salad } from 'lucide-react-native';
import type { Totals } from '@/api/types';
import { tokens } from '@/theme/tokens';

const T = tokens.foodLog;

type MacroStatus = 'good' | 'warn' | 'low';

function macroStatus(
  value: number,
  target: number,
  kind: 'goal' | 'limit',
): MacroStatus {
  const pct = value / target;
  if (kind === 'goal') {
    if (pct >= 0.9) return 'good';
    if (pct >= 0.6) return 'warn';
    return 'low';
  }
  if (pct <= 0.9) return 'good';
  if (pct <= 1.0) return 'warn';
  return 'low';
}

function fmtG(v: number): string {
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return (Math.round(v * 10) / 10).toString().replace(/\.0$/, '');
  return (Math.round(v * 10) / 10).toString();
}

const STATUS_COLORS: Record<MacroStatus, [string, string, string]> = {
  good: [T.good, T.goodSoft, 'GOOD'],
  warn: [T.warn, T.warnSoft, 'CLOSE'],
  low: [T.low, T.lowSoft, 'LOW'],
};

interface MacroDef {
  key: string;
  label: string;
  kind: 'goal' | 'limit';
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
}

// The old card's four rows, plus fiber and sodium, which Today has always shown.
const MACROS: MacroDef[] = [
  { key: 'protein', label: 'Protein', kind: 'goal', Icon: Drumstick },
  { key: 'carbs', label: 'Carbs', kind: 'goal', Icon: Apple },
  { key: 'fat', label: 'Fats', kind: 'limit', Icon: Droplets },
  { key: 'sugar', label: 'Sugar', kind: 'limit', Icon: Cookie },
  { key: 'fiber', label: 'Fiber', kind: 'goal', Icon: Wheat },
  { key: 'sodium', label: 'Sodium', kind: 'limit', Icon: Salad },
];

interface MacrosCardProps {
  totals: Totals;
  dailyGoals: Record<string, number | null>;
  /** Unit per nutrient key, from /meta. */
  units: Record<string, string>;
  subtitle: string;
}

export const MacrosCard: React.FC<MacrosCardProps> = ({ totals, dailyGoals, units, subtitle }) => {
  const missing = totals.calories?.missingItems ?? 0;
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Macros &amp; nutrients</Text>
        <Text style={styles.cardSub}>{subtitle}</Text>
      </View>

      {MACROS.map((m, i) => {
        const val = totals[m.key]?.value ?? 0;
        const tgt = dailyGoals[m.key] ?? 0;
        const unit = units[m.key] ?? 'g';
        const status: MacroStatus | null = tgt > 0 ? macroStatus(val, tgt, m.kind) : null;
        const [col, soft, txt] = status ? STATUS_COLORS[status] : [T.inkMuted, T.lineSoft, 'NO GOAL'];
        const pct = tgt > 0 ? Math.min(1, val / tgt) : 0;

        return (
          <View
            key={m.key}
            style={[
              styles.macroRow,
              i > 0 && { borderTopWidth: 1, borderTopColor: T.lineSoft },
            ]}
          >
            <View style={styles.macroTop}>
              <View style={[styles.iconBox, { backgroundColor: soft }]}>
                <m.Icon size={16} color={col} strokeWidth={2} />
              </View>
              <Text style={styles.macroLabel}>{m.label}</Text>
              <Text style={styles.macroVal}>
                {fmtG(val)}
                <Text style={styles.macroTarget}>
                  {tgt > 0 ? ` / ${fmtG(tgt)}${unit}` : ` ${unit}`}
                </Text>
              </Text>
            </View>
            <View style={styles.barRow}>
              <View style={styles.barBg}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${pct * 100}%`, backgroundColor: col },
                  ]}
                />
              </View>
              <View style={[styles.badge, { backgroundColor: soft }]}>
                <Text style={[styles.badgeText, { color: col }]}>{txt}</Text>
              </View>
            </View>
          </View>
        );
      })}

      {missing > 0 ? (
        <Text style={styles.footnote}>
          {missing} item{missing === 1 ? '' : 's'} not counted yet (no food values).
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: T.surface,
    borderRadius: 20,
    padding: 16,
    paddingBottom: 6,
    borderWidth: 1,
    borderColor: T.line,
    shadowColor: T.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: T.ink,
    letterSpacing: -0.2,
  },
  cardSub: {
    fontSize: 11.5,
    color: T.inkMuted,
    fontWeight: '600',
  },
  macroRow: {
    paddingVertical: 13,
  },
  macroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  macroLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: T.ink,
    flex: 1,
  },
  macroVal: {
    fontSize: 13.5,
    fontWeight: '800',
    color: T.ink,
  },
  macroTarget: {
    fontSize: 13.5,
    fontWeight: '600',
    color: T.inkMuted,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 9,
  },
  barBg: {
    flex: 1,
    height: 7,
    backgroundColor: T.lineSoft,
    borderRadius: 999,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    flexShrink: 0,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  footnote: {
    fontSize: 11.5,
    color: T.inkMuted,
    fontWeight: '600',
    paddingTop: 2,
    paddingBottom: 10,
  },
});
