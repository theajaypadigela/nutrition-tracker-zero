import React from 'react';
import { View } from 'react-native';
import { Chip, Text } from '@/components/kit';
import { space } from '@/theme';

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** The zones offered: the default, the phone's zone and the current choice. */
export function timezoneOptions(value: string): string[] {
  return [...new Set([DEFAULT_TIMEZONE, deviceTimeZone(), value])];
}

/** The call rings at call time in this zone. */
export default function TimezoneField({ value, onChange }: { value: string; onChange: (tz: string) => void }) {
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {timezoneOptions(value).map(tz => (
          <Chip key={tz} label={tz} selected={tz === value} onPress={() => onChange(tz)} />
        ))}
      </View>
      <Text variant="caption" tone="muted">
        Your call rings at the call time in this time zone.
      </Text>
    </View>
  );
}
