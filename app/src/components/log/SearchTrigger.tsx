import React from 'react';
import { Pressable } from 'react-native';
import { ChevronDown, Search } from 'lucide-react-native';
import { Icon, Text } from '@/components/kit';
import { usePressed } from '@/components/kit/usePressed';
import { createStyles, radius, space, useTheme } from '@/theme';

const useStyles = createStyles(({ colors }) => ({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 52,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
}));

/**
 * The foods dropdown, closed: it looks like the app's text fields and opens the picker sheet. It is a button, not an input, so the
 * keyboard stays down until the person chooses to type.
 */
export function SearchTrigger({ label, accessibilityLabel, onPress, testID }: { label: string; accessibilityLabel: string; onPress: () => void; testID?: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { pressed, handlers } = usePressed();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      {...handlers}
      style={[styles.box, { backgroundColor: pressed ? colors.surfaceMuted : colors.surface }]}
    >
      <Icon as={Search} size="md" tone="muted" />
      <Text variant="body" tone="muted" style={{ flex: 1 }} numberOfLines={1}>
        {label}
      </Text>
      <Icon as={ChevronDown} size="md" tone="muted" />
    </Pressable>
  );
}
