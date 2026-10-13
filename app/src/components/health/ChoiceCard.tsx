import React from 'react';
import { Pressable, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Icon, Text } from '@/components/kit';
import { hairline, radius, space, useTheme } from '@/theme';

/**
 * A selectable card: a title, a line of explanation, and a mark when chosen. `multi` draws a square tick (several
 * can be chosen), otherwise a round one. Selected is the accent outline and tint; every choice has a text label and
 * a tick, never colour alone (WEEKLY_BREAKDOWN_PLAN.md 5.8).
 */
export function ChoiceCard({
  title,
  body,
  selected,
  onPress,
  multi,
  disabled,
  testID,
}: {
  title: string;
  body?: string;
  selected: boolean;
  onPress: () => void;
  multi?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      accessibilityLabel={body ? `${title}. ${body}` : title}
      onPress={disabled ? undefined : onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space.md,
        padding: space.lg,
        borderRadius: radius.lg,
        borderWidth: selected ? 2 : hairline,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.primarySoft : colors.surface,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          marginTop: 1,
          borderRadius: multi ? 6 : 11,
          borderWidth: selected ? 0 : 1.5,
          borderColor: colors.borderStrong,
          backgroundColor: selected ? colors.primary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? <Icon as={Check} size={14} color={colors.onPrimary} strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{title}</Text>
        {body ? (
          <Text variant="small" tone="secondary">
            {body}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
