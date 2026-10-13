import React from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { radius, size as sizes, useTheme } from '@/theme';
import { Icon } from './Icon';
import type { TextTone } from './Text';
import { usePressed } from './usePressed';

export type IconButtonVariant = 'plain' | 'outline' | 'soft';

/** A round icon-only button. It always needs an accessibility label. */
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  variant = 'plain',
  size = 40,
  tone = 'text',
  disabled,
  testID,
  style,
}: {
  icon: LucideIcon;
  onPress?: () => void;
  accessibilityLabel: string;
  variant?: IconButtonVariant;
  size?: number;
  tone?: TextTone;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const { pressed, handlers } = usePressed();
  // The visible circle can be smaller than the touch target; hitSlop makes up the difference.
  const slop = Math.max(0, Math.ceil((sizes.hit - size) / 2));
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      hitSlop={slop}
      {...handlers}
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.4 : 1,
          backgroundColor:
            variant === 'soft'
              ? pressed
                ? colors.border
                : colors.surfaceMuted
              : pressed
                ? colors.surfaceMuted
                : 'transparent',
        },
        variant === 'outline' ? { borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.surfaceMuted : colors.surface } : null,
        style,
      ]}
    >
      <Icon as={icon} size="lg" tone={tone} />
    </Pressable>
  );
}
