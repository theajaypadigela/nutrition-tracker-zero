import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { QuickPill } from './common/Form';

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
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-2">
        {timezoneOptions(value).map(tz => (
          <QuickPill key={tz} label={tz} selected={tz === value} onPress={() => onChange(tz)} />
        ))}
      </View>
      <Text size="xs" className="text-gray-500">
        Your call rings at the call time in this time zone.
      </Text>
    </View>
  );
}
