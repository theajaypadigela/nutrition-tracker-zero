import React from 'react';
import { Pressable, Switch, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { fontFor, radius, size as sizes, space, useTheme } from '@/theme';
import { Icon } from './Icon';
import { Text } from './Text';
import { usePressed } from './usePressed';

/** The system switch, in the app's colours. */
export function Toggle({
  value,
  onValueChange,
  disabled,
  accessibilityLabel,
  testID,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  accessibilityLabel: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Switch
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: colors.borderStrong, true: colors.primary }}
      thumbColor={colors.thumb}
      ios_backgroundColor={colors.borderStrong}
    />
  );
}

/** The person's initials in a soft green circle. */
export function Avatar({ initials, size = 36 }: { initials: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.primarySoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        tone="primary"
        style={{ ...fontFor('semibold'), fontSize: Math.round(size * 0.38), lineHeight: Math.round(size * 0.48), letterSpacing: 0.2 }}
      >
        {initials || '?'}
      </Text>
    </View>
  );
}

/** The one floating action on a screen. Sits above the scroll content, bottom right. */
export function Fab({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  const { pressed, handlers } = usePressed();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      {...handlers}
      style={{
        position: 'absolute',
        right: sizes.gutter,
        bottom: space.xl,
        width: sizes.fab,
        height: sizes.fab,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.primaryPressed : colors.primary,
        shadowColor: colors.shadow,
        shadowOpacity: 0.18,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
      }}
    >
      <Icon as={icon} size="lg" color={colors.onPrimary} strokeWidth={2} />
    </Pressable>
  );
}

/**
 * A labelled group in a form or settings list: a small caps label above, an optional hint below.
 * The label is the only chrome; the group itself is whatever you put inside (a ListGroup, chips).
 */
export function FormGroup({ title, hint, children }: { title?: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      {title ? (
        <Text variant="overline" tone="muted" style={{ paddingHorizontal: space.xs }}>
          {title}
        </Text>
      ) : null}
      {children}
      {hint ? (
        <Text variant="caption" tone="muted" style={{ paddingHorizontal: space.xs }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** A section's title with an optional value or action on the right. */
export function SectionHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.md }}>
      <Text variant="title3" style={{ flexShrink: 1 }}>
        {title}
      </Text>
      {right}
    </View>
  );
}
