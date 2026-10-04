import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { formatClock } from '@/utils/dates';

/** HH:MM picker backed by the native time picker. */
export default function TimeField({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [h, m] = (value ?? '20:00').split(':').map(Number);
  const date = new Date();
  date.setHours(h ?? 20, m ?? 0, 0, 0);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        className="rounded-xl border border-line bg-field px-3.5 py-3"
      >
        <Text className="text-base text-ink">{formatClock(value)}</Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={date}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, picked) => {
            setOpen(Platform.OS === 'ios');
            if (event.type === 'set' && picked) {
              onChange(`${String(picked.getHours()).padStart(2, '0')}:${String(picked.getMinutes()).padStart(2, '0')}`);
            }
          }}
        />
      ) : null}
    </View>
  );
}
