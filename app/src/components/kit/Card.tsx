import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { createStyles, hairline, radius, space, useTheme } from '@/theme';
import { usePressed } from './usePressed';

type Padding = 'none' | 'md' | 'lg' | 'xl';
const PADDING: Record<Padding, number> = { none: 0, md: space.md, lg: space.lg, xl: space.xl };

const useStyles = createStyles(({ colors }) => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.border,
  },
  clip: { overflow: 'hidden' },
}));

/**
 * The surface everything sits on: white, a hairline outline, no shadow. Give it `onPress` and
 * the whole card is the touch target.
 */
export function Card({
  children,
  padding = 'lg',
  onPress,
  accessibilityLabel,
  testID,
  style,
}: {
  children: React.ReactNode;
  padding?: Padding;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { pressed, handlers } = usePressed();
  const base = [styles.card, styles.clip, { padding: PADDING[padding] }, style];
  if (!onPress) return <View testID={testID} style={base}>{children}</View>;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      {...handlers}
      style={[base, pressed ? { backgroundColor: colors.surfaceMuted } : null]}
    >
      {children}
    </Pressable>
  );
}
