import React from 'react';
import { StyleSheet, Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { textStyleFor, typeScale, useTheme, type Palette, type TextVariant } from '@/theme';

export type TextTone = 'text' | 'secondary' | 'muted' | 'faint' | 'primary' | 'onPrimary' | 'danger' | 'warning';

/** A tone is a role, not a colour, so it follows the theme. */
export function toneColor(colors: Palette, tone: TextTone): string {
  switch (tone) {
    case 'secondary':
      return colors.textSecondary;
    case 'muted':
      return colors.textMuted;
    case 'faint':
      return colors.textFaint;
    case 'primary':
      return colors.primary;
    case 'onPrimary':
      return colors.onPrimary;
    case 'danger':
      return colors.dangerText;
    case 'warning':
      return colors.warningText;
    default:
      return colors.text;
  }
}

const variantStyles = StyleSheet.create(
  Object.fromEntries((Object.keys(typeScale) as TextVariant[]).map(v => [v, textStyleFor(v)])) as Record<
    TextVariant,
    TextStyle
  >,
);

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
  align?: TextStyle['textAlign'];
  /** Digits of equal width: for values that change or line up in a column. */
  tabular?: boolean;
}

/**
 * The only text component the app uses: a variant from the type scale, a tone from the palette.
 * Font scaling is capped so large system fonts enlarge text without breaking fixed layouts.
 */
export function Text({ variant = 'body', tone = 'text', align, tabular, style, ...rest }: TextProps) {
  const { colors } = useTheme();
  return (
    <RNText
      maxFontSizeMultiplier={1.3}
      {...rest}
      style={[
        variantStyles[variant],
        { color: toneColor(colors, tone), includeFontPadding: false },
        align ? { textAlign: align } : null,
        tabular ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
    />
  );
}
