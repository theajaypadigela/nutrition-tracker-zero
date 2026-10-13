import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/theme';

/** The brand leaf; the same glyph is the launcher icon and the native ring-screen avatar. */
export const LEAF_PATH =
  'M20 4C11 4 4.5 8.5 4.5 16.5c0 1.4.3 2.6.8 3.7C7 14 11.5 10.5 18 9.5c-5 2-9 5.6-10.6 11 1 .4 2.2.6 3.5.6C19 21 21 12 20 4Z';

/** The leaf on a rounded green tile. */
export function BrandMark({ size = 48 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Nutrition Zero"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24">
        <Path d={LEAF_PATH} fill={colors.onPrimary} />
      </Svg>
    </View>
  );
}
