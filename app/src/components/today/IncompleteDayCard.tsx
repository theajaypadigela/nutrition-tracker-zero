import React from 'react';
import { View } from 'react-native';
import { Button, Card, Text } from '@/components/kit';
import { fill } from '@/i18n/fill';
import { strings } from '@/i18n/strings';
import { space } from '@/theme';

const t = strings.day.incomplete;

/**
 * A past day the weekly figures leave out because very little is logged (plan 7.2, 7.8): unknown is not zero, so a half-logged
 * day is not averaged in, and a day that really was light (a fast, an illness) counts once the person says so. Both answers are
 * one tap; adding the missing food answers it too. With numbers hidden it says how much was logged in words only.
 */
export function IncompleteDayCard({
  kcal,
  numbersHidden,
  onComplete,
  onLeaveOut,
}: {
  kcal: number;
  numbersHidden: boolean;
  onComplete: () => void;
  onLeaveOut: () => void;
}) {
  return (
    <Card padding="xl" testID="incomplete-day">
      <View style={{ gap: space.md }}>
        <Text variant="bodyStrong">{t.title}</Text>
        <Text variant="small" tone="secondary">
          {numbersHidden ? strings.lowPressure.dayIncomplete : fill(t.low, { kcal: Math.round(kcal / 10) * 10 })}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          <Button testID="incomplete-complete" label={t.complete} variant="soft" size="sm" onPress={onComplete} />
          <Button testID="incomplete-skip" label={t.leaveOut} variant="ghost" size="sm" onPress={onLeaveOut} />
        </View>
      </View>
    </Card>
  );
}
