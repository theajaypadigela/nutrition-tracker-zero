import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';

/**
 * The status bar is translucent (the app draws edge to edge), so content that scrolls up under
 * it would collide with the clock and icons. This paints the page colour behind them, above the
 * scrolling content. Render it as the last child of a screen's root view.
 */
export function StatusBarScrim() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: colors.bg }}
    />
  );
}
