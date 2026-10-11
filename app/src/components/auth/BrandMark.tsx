import React from 'react';
import { tokens } from '@/theme/tokens';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { R } from './authTheme';

/**
 * The Nourish brand glyph — a bold leaf whose midrib doubles as a soundwave
 * (call + nutrition). Ported from the design's `AIcon.leaf`.
 */
export function Leaf({ size = 26, color = tokens.auth.white }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 4C11 4 4.5 8.5 4.5 16.5c0 1.4.3 2.6.8 3.7C7 14 11.5 10.5 18 9.5c-5 2-9 5.6-10.6 11 1 .4 2.2.6 3.5.6C19 21 21 12 20 4Z"
        fill={color}
      />
    </Svg>
  );
}

/** Rounded brand tile holding the leaf — gradient on light surfaces, translucent on dark. */
export function BrandMark({
  size = 56,
  on = 'light',
  style,
}: {
  size?: number;
  on?: 'light' | 'dark';
  style?: ViewStyle;
}) {
  const radius = size * (R.lg / 56);
  const inner = (
    <>
      <Leaf size={size * 0.52} color={tokens.auth.white} />
    </>
  );
  if (on === 'dark') {
    return (
      <View
        style={[
          styles.markBase,
          {
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor: 'rgba(255,255,255,0.16)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.18)',
          },
          style,
        ]}
      >
        {inner}
      </View>
    );
  }
  return (
    <LinearGradient
      colors={[tokens.auth.greenMid, tokens.auth.green, tokens.auth.greenDeep]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[
        styles.markBase,
        styles.markShadow,
        { width: size, height: size, borderRadius: radius },
        style,
      ]}
    >
      {inner}
    </LinearGradient>
  );
}

/** The app's name in the brand type. This build ships as "Nutrition Zero". */
export function Wordmark({
  color = tokens.auth.ink,
  size = 22,
  children = 'Nutrition Zero',
}: {
  color?: string;
  size?: number;
  children?: string;
}) {
  return (
    <Text
      style={{
        fontWeight: '800',
        fontSize: size,
        letterSpacing: -0.4,
        color,
      }}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  markBase: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markShadow: {
    shadowColor: tokens.auth.green,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
});
