import React from 'react';
import { Pressable } from 'react-native';
import { Card, Notice, Text } from '@/components/kit';
import { space, useTheme } from '@/theme';

/**
 * One thing that stood out this week, in a sentence. A safety message (priority 1) or a gap in the log (2) is a notice;
 * the rest are plain cards, and none of them tells anyone what to eat (plan 5.6, 5.8).
 */
export function InsightCard({
  text,
  priority,
  action,
  testID,
}: {
  text: string;
  priority: 1 | 2 | 3 | 4 | 5;
  action?: { label: string; onPress: () => void } | null;
  testID?: string;
}) {
  const { colors } = useTheme();
  if (priority <= 2) {
    return (
      <Notice tone={priority === 1 ? 'warning' : 'info'} action={action ?? undefined} testID={testID}>
        {text}
      </Notice>
    );
  }
  return (
    <Card padding="lg" testID={testID}>
      <Text variant="body">{text}</Text>
      {action ? (
        <Pressable
          onPress={action.onPress}
          hitSlop={8}
          accessibilityRole="button"
          style={{ alignSelf: 'flex-start', marginTop: space.sm }}
        >
          <Text variant="smallStrong" style={{ color: colors.primary, textDecorationLine: 'underline' }}>
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );
}
