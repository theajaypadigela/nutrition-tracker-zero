import React, { useEffect, useRef } from 'react';
import { tokens } from '@/theme/tokens';
import { Animated, StyleSheet, Easing } from 'react-native';
import { Text } from '@/components/ui/text';

interface Props {
  message: string | null;
  onHide: () => void;
}

const Toast: React.FC<Props> = ({ message, onHide }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (message) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      const t = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 20,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start(() => onHide());
      }, 2200);
      return () => clearTimeout(t);
    }
  }, [message, opacity, translateY, onHide]);

  if (!message) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.toast, { opacity, transform: [{ translateY }] }]}
    >
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 90,
    alignSelf: 'center',
    backgroundColor: tokens.report.ink,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    shadowColor: tokens.report.shadow,
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    elevation: 8,
    maxWidth: '80%',
  },
  text: {
    color: tokens.report.surface,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default Toast;
