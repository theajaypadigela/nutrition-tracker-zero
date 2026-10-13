import React from 'react';
import { View } from 'react-native';
import { Check, Minus } from 'lucide-react-native';
import { Icon, Text } from '@/components/kit';
import { createStyles, space, useTheme } from '@/theme';

/**
 * What one day of the week is: logged, looks incomplete, not logged, left out, in progress or not
 * here yet. Every state has its own mark as well as its own colour, so nothing depends on colour
 * alone (WEEKLY_BREAKDOWN_PLAN.md 5.8).
 */
export type DayCellState = 'logged' | 'partial' | 'empty' | 'skipped' | 'progress' | 'future';

export interface DayCell {
  /** Short label under the mark: "Mon". */
  label: string;
  state: DayCellState;
  /** For the screen reader: "Monday, logged". */
  description: string;
}

const CIRCLE = 28;

const useStyles = createStyles(() => ({
  row: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', gap: space.xs },
  circle: { width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, alignItems: 'center', justifyContent: 'center' },
}));

/** Seven days in a row, Monday first. */
export function DayStrip({ cells }: { cells: DayCell[] }) {
  const { colors } = useTheme();
  const styles = useStyles();

  const mark = (state: DayCellState) => {
    switch (state) {
      case 'logged':
        return { style: { backgroundColor: colors.primary }, glyph: <Icon as={Check} size={16} color={colors.onPrimary} strokeWidth={2.5} /> };
      case 'partial':
        return { style: { backgroundColor: colors.warningSoft }, glyph: <Icon as={Minus} size={16} color={colors.warningText} strokeWidth={2.5} /> };
      case 'skipped':
        return { style: { backgroundColor: colors.surfaceMuted }, glyph: <Icon as={Minus} size={16} tone="faint" strokeWidth={2.5} /> };
      case 'progress':
        return {
          style: { borderWidth: 2, borderColor: colors.primary },
          glyph: <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />,
        };
      case 'future':
        return { style: { borderWidth: 1, borderColor: colors.border }, glyph: null };
      default:
        return { style: { borderWidth: 1.5, borderColor: colors.borderStrong }, glyph: null };
    }
  };

  return (
    <View style={styles.row} accessibilityRole="list">
      {cells.map(cell => {
        const m = mark(cell.state);
        return (
          <View key={cell.label} style={styles.cell} accessible accessibilityLabel={cell.description}>
            <View style={[styles.circle, m.style]}>{m.glyph}</View>
            <Text variant="caption" tone={cell.state === 'future' ? 'faint' : 'muted'}>
              {cell.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
