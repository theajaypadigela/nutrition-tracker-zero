import React from 'react';
import { Text, View } from 'react-native';
import { Chip } from './ui';

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** The call rings at call time in this zone. Offers the default and the phone's zone. */
export default function TimezoneField({ value, onChange }: { value: string; onChange: (tz: string) => void }) {
  const options = [...new Set([DEFAULT_TIMEZONE, deviceTimeZone(), value])];
  return (
    <View>
      <View className="flex-row flex-wrap">
        {options.map((tz) => (
          <Chip key={tz} label={tz} selected={tz === value} onPress={() => onChange(tz)} />
        ))}
      </View>
      <Text className="text-xs text-ink-muted">Your call rings at the call time in this time zone.</Text>
    </View>
  );
}
