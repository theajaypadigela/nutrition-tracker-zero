import React from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/kit';
import { createStyles, space, useTheme } from '@/theme';
import { fullDayLabel, monthWeeks } from '@/utils/dates';

/** What the calendar knows about a day: how many items were logged, and how many of them still await values. */
export interface DayMark {
  count: number;
  pending: number;
}

/** Monday first, like the weeks everywhere else in the app. */
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const CELL = 48;
const CIRCLE = 40;

const useStyles = createStyles(() => ({
  row: { flexDirection: 'row' },
  head: { flex: 1, alignItems: 'center', paddingBottom: space.sm },
  cell: { flex: 1, height: CELL, alignItems: 'center', justifyContent: 'center' },
  circle: { width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', bottom: 5, width: 4, height: 4, borderRadius: 2 },
}));

/**
 * One month as a grid of days. The chosen day is a filled green circle, today is outlined, days
 * with entries carry a dot, and days after today cannot be chosen (nothing can be logged for them).
 */
export function CalendarGrid({
  month,
  selected,
  today,
  marks,
  onSelect,
}: {
  /** 'YYYY-MM' */
  month: string;
  /** 'YYYY-MM-DD' */
  selected: string;
  today: string;
  marks: Record<string, DayMark | undefined>;
  onSelect: (date: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const weeks = monthWeeks(month);

  return (
    <View testID="calendar-grid" accessibilityLabel="Calendar">
      <View style={styles.row} importantForAccessibility="no-hide-descendants">
        {WEEKDAYS.map((letter, i) => (
          <View key={WEEKDAY_NAMES[i]} style={styles.head}>
            <Text variant="caption" tone="muted">
              {letter}
            </Text>
          </View>
        ))}
      </View>

      {weeks.map((week, w) => (
        <View key={w} style={styles.row}>
          {week.map((date, d) => {
            if (!date) return <View key={`blank-${d}`} style={styles.cell} />;
            const isSelected = date === selected;
            const isToday = date === today;
            const future = date > today;
            const mark = marks[date];
            const hasEntries = !!mark && mark.count > 0;
            const label =
              `${fullDayLabel(date)}${isToday ? ', today' : ''}` +
              (mark ? (hasEntries ? `, ${mark.count} item${mark.count === 1 ? '' : 's'} logged` : ', nothing logged') : '');
            return (
              <Pressable
                key={date}
                testID={`calendar-day-${date}`}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: isSelected, disabled: future }}
                disabled={future}
                onPress={() => onSelect(date)}
                android_ripple={{ color: colors.ripple, borderless: true, radius: CIRCLE / 2 }}
                style={styles.cell}
              >
                <View
                  style={[
                    styles.circle,
                    isSelected ? { backgroundColor: colors.primary } : isToday ? { borderWidth: 1.5, borderColor: colors.primary } : null,
                  ]}
                >
                  <Text
                    variant={isSelected || isToday ? 'bodyStrong' : 'body'}
                    tone={isSelected ? 'onPrimary' : future ? 'faint' : isToday ? 'primary' : 'text'}
                    tabular
                  >
                    {Number(date.slice(8))}
                  </Text>
                  {hasEntries ? (
                    <View style={[styles.dot, { backgroundColor: isSelected ? colors.onPrimary : colors.primary }]} />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
