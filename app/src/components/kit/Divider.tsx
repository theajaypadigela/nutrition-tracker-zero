import React from 'react';
import { View } from 'react-native';
import { hairline, useTheme } from '@/theme';

/** A hairline. `inset` starts it after the row's side padding, like a grouped list. */
export function Divider({ inset = 0 }: { inset?: number }) {
  const { colors } = useTheme();
  return <View style={{ height: hairline, backgroundColor: colors.border, marginLeft: inset }} />;
}
