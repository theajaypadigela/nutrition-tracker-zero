import React from 'react';
import type { LucideIcon } from 'lucide-react-native';
import { size as sizes, useTheme } from '@/theme';
import { toneColor, type TextTone } from './Text';

export type IconSize = keyof typeof sizes.icon | number;

/** Line icons share one stroke weight so they read as a set. */
const STROKE = 1.75;

/**
 * `<Icon as={Plus} size="md" tone="muted" />`. A tone follows the theme; pass `color` for the
 * few places that need an exact colour (an icon on a coloured button).
 */
export function Icon({
  as: Glyph,
  size = 'md',
  tone = 'secondary',
  color,
  strokeWidth = STROKE,
}: {
  as: LucideIcon;
  size?: IconSize;
  tone?: TextTone;
  color?: string;
  strokeWidth?: number;
}) {
  const { colors } = useTheme();
  const px = typeof size === 'number' ? size : sizes.icon[size];
  return <Glyph size={px} color={color ?? toneColor(colors, tone)} strokeWidth={strokeWidth} />;
}
