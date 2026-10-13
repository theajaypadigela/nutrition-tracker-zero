import React from 'react';
import { ActivityIndicator, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { createStyles, radius, space, useTheme } from '@/theme';
import { Icon } from './Icon';
import { Text, type TextTone } from './Text';
import { usePressed } from './usePressed';

export type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger' | 'dangerGhost';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  /** Stretch to the parent's width. Buttons are otherwise as wide as their label. */
  fullWidth?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const HEIGHT: Record<ButtonSize, number> = { sm: 36, md: 48, lg: 52 };

const useStyles = createStyles(() => ({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
  },
  sm: { height: HEIGHT.sm, paddingHorizontal: space.md, borderRadius: radius.sm + 2 },
  md: { height: HEIGHT.md },
  lg: { height: HEIGHT.lg },
  full: { alignSelf: 'stretch' },
}));

/** One button: five emphasis levels, three sizes. Everything else is the label. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading,
  disabled,
  fullWidth,
  testID,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { pressed, handlers } = usePressed();
  const off = !!disabled || !!loading;

  let bg: string = 'transparent';
  let border: string | undefined;
  let tone: TextTone = 'text';
  let spinner: string = colors.text;
  switch (variant) {
    case 'primary':
      bg = off ? colors.surfaceMuted : pressed ? colors.primaryPressed : colors.primary;
      tone = off ? 'faint' : 'onPrimary';
      spinner = colors.onPrimary;
      break;
    case 'secondary':
      bg = pressed && !off ? colors.surfaceMuted : colors.surface;
      border = colors.borderStrong;
      tone = off ? 'faint' : 'text';
      spinner = colors.text;
      break;
    case 'soft':
      bg = pressed && !off ? colors.border : colors.primarySoft;
      tone = off ? 'faint' : 'primary';
      spinner = colors.primary;
      break;
    case 'ghost':
      bg = pressed && !off ? colors.surfaceMuted : 'transparent';
      tone = off ? 'faint' : 'primary';
      spinner = colors.primary;
      break;
    case 'danger':
      bg = off ? colors.surfaceMuted : pressed ? colors.dangerPressed : colors.danger;
      tone = off ? 'faint' : 'onPrimary';
      spinner = colors.onDanger;
      break;
    case 'dangerGhost':
      bg = pressed && !off ? colors.dangerSoft : 'transparent';
      tone = off ? 'faint' : 'danger';
      spinner = colors.dangerText;
      break;
  }
  // The label sits on a red fill in the danger variant, whose on-colour differs from onPrimary.
  const labelColor = variant === 'danger' && !off ? colors.onDanger : undefined;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: off, busy: !!loading }}
      onPress={off ? undefined : onPress}
      disabled={off}
      // Small buttons are 36 tall to look light, 44 tall to touch.
      hitSlop={size === 'sm' ? { top: 4, bottom: 4 } : undefined}
      {...handlers}
      style={[
        styles.base,
        styles[size],
        { backgroundColor: bg },
        border ? { borderWidth: 1, borderColor: border } : null,
        fullWidth ? styles.full : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={spinner} />
      ) : icon ? (
        <Icon as={icon} size={size === 'sm' ? 'sm' : 'md'} tone={tone} color={labelColor} />
      ) : null}
      <Text
        variant={size === 'sm' ? 'smallStrong' : 'button'}
        tone={tone}
        align="center"
        style={[{ flexShrink: 1 }, labelColor ? { color: labelColor } : null]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
