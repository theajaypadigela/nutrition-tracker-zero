import React from 'react';
import { tokens } from '@/theme/tokens';
import { View, StyleSheet, ViewStyle } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

/**
 * The rich green gradient hero band used at the top of Login/Register. A subtle
 * radial-ish highlight is faked with a translucent circle in the top-right corner.
 */
export function Hero({
  children,
  paddingTop = 24,
  style,
}: {
  children: React.ReactNode;
  paddingTop?: number;
  style?: ViewStyle;
}) {
  return (
    <LinearGradient
      colors={[tokens.auth.greenMid, tokens.auth.green, tokens.auth.greenDeep]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={[styles.hero, { paddingTop }, style]}
    >
      <View pointerEvents="none" style={styles.glow} />
      <View>{children}</View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: 26,
    paddingBottom: 70,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    right: -70,
    top: -70,
    width: 230,
    height: 230,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
});
