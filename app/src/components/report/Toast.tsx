import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/kit';
import { radius, space, useTheme } from '@/theme';

/** A short confirmation that fades in at the bottom, holds for two seconds, and goes. */
export function Toast({ message, onHide }: { message: string | null; onHide: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    if (!message) return;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 16, duration: 200, useNativeDriver: true }),
      ]).start(() => onHide());
    }, 2200);
    return () => clearTimeout(t);
  }, [message, opacity, translateY, onHide]);

  if (!message) return null;
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        bottom: insets.bottom + space.xl,
        alignSelf: 'center',
        maxWidth: '86%',
        backgroundColor: colors.text,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        borderRadius: radius.md,
        opacity,
        transform: [{ translateY }],
      }}
    >
      <Text variant="smallStrong" align="center" style={{ color: colors.bg }}>
        {message}
      </Text>
    </Animated.View>
  );
}
