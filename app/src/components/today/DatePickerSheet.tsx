import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { api } from '@/api/client';
import { Button, IconButton, Sheet, Text } from '@/components/kit';
import { space } from '@/theme';
import { addMonths, monthBounds, monthLabel, monthOf } from '@/utils/dates';
import { CalendarGrid, type DayMark } from './CalendarGrid';

/**
 * Pick the day Today shows: a month calendar in a bottom sheet. Choosing a day selects it at once
 * (no confirm step). Days that have entries carry a dot, loaded a month at a time; if that request
 * fails the calendar still works, it just shows no dots.
 */
export function DatePickerSheet({
  visible,
  onClose,
  selected,
  today,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  /** The day being shown now, 'YYYY-MM-DD'. */
  selected: string;
  today: string;
  onSelect: (date: string) => void;
}) {
  const [month, setMonth] = useState(monthOf(selected));
  const [marks, setMarks] = useState<Record<string, DayMark>>({});

  // Each time the sheet opens it starts on the month of the day being shown.
  useEffect(() => {
    if (visible) setMonth(monthOf(selected));
  }, [visible, selected]);

  // Entries for the month on screen. Refreshed on every open, so a day just logged shows its dot.
  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;
    const { from, to } = monthBounds(month);
    api
      .getDays(from, to)
      .then(range => {
        if (cancelled) return;
        setMarks(prev => ({
          ...prev,
          ...Object.fromEntries(range.days.map(d => [d.date, { count: d.itemCount, pending: d.pendingCount }])),
        }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [visible, month]);

  const atLatestMonth = month >= monthOf(today);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Choose a day"
      testID="date-picker"
      footer={
        selected !== today ? (
          <Button label="Go to today" variant="secondary" size="lg" fullWidth onPress={() => onSelect(today)} />
        ) : undefined
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -space.xs }}>
        <IconButton
          icon={ChevronLeft}
          accessibilityLabel="Previous month"
          variant="outline"
          onPress={() => setMonth(addMonths(month, -1))}
        />
        <Text variant="bodyStrong" accessibilityRole="header" testID="calendar-month">
          {monthLabel(month)}
        </Text>
        <IconButton
          icon={ChevronRight}
          accessibilityLabel="Next month"
          variant="outline"
          disabled={atLatestMonth}
          onPress={() => setMonth(addMonths(month, 1))}
        />
      </View>
      <CalendarGrid month={month} selected={selected} today={today} marks={marks} onSelect={onSelect} />
    </Sheet>
  );
}
