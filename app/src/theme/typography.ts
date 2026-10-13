import { Platform, type TextStyle } from 'react-native';

/**
 * Type: Inter on Android (bundled in android/app/src/main/assets/fonts, SIL OFL), the system font
 * (SF Pro) on iOS. Android resolves a font by file name and cannot synthesise weights from one
 * family, so a weight is a family there; iOS takes `fontWeight`.
 */
export type Weight = 'regular' | 'medium' | 'semibold' | 'bold';

const ANDROID_FAMILY: Record<Weight, string> = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
};

const IOS_WEIGHT: Record<Weight, TextStyle['fontWeight']> = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};

/** The font part of a text style for a weight. Never combine its result with `fontWeight`. */
export function fontFor(weight: Weight): Pick<TextStyle, 'fontFamily' | 'fontWeight'> {
  return Platform.OS === 'android'
    ? { fontFamily: ANDROID_FAMILY[weight] }
    : { fontWeight: IOS_WEIGHT[weight] };
}

export type TextVariant =
  | 'display'
  | 'title1'
  | 'title2'
  | 'title3'
  | 'body'
  | 'bodyStrong'
  | 'small'
  | 'smallStrong'
  | 'caption'
  | 'overline'
  | 'micro'
  | 'button';

interface Spec {
  size: number;
  line: number;
  weight: Weight;
  tracking?: number;
  uppercase?: boolean;
}

/**
 * The scale. Sizes are the ones the app uses and nothing in between: 11 / 12 / 13 / 15 / 18 /
 * 22 / 28 / 36 (11 is the tab-bar label and the small uppercase label). Large sizes track
 * tighter; small uppercase labels track looser.
 */
export const typeScale: Record<TextVariant, Spec> = {
  display: { size: 36, line: 42, weight: 'bold', tracking: -1 },
  title1: { size: 28, line: 34, weight: 'bold', tracking: -0.6 },
  title2: { size: 22, line: 28, weight: 'semibold', tracking: -0.4 },
  title3: { size: 18, line: 24, weight: 'semibold', tracking: -0.2 },
  body: { size: 15, line: 22, weight: 'regular' },
  bodyStrong: { size: 15, line: 22, weight: 'semibold' },
  small: { size: 13, line: 18, weight: 'regular' },
  smallStrong: { size: 13, line: 18, weight: 'medium' },
  caption: { size: 12, line: 16, weight: 'medium', tracking: 0.1 },
  overline: { size: 11, line: 14, weight: 'semibold', tracking: 0.8, uppercase: true },
  micro: { size: 11, line: 14, weight: 'medium', tracking: 0.1 },
  button: { size: 15, line: 20, weight: 'semibold' },
};

export function textStyleFor(variant: TextVariant): TextStyle {
  const s = typeScale[variant];
  return {
    ...fontFor(s.weight),
    fontSize: s.size,
    lineHeight: s.line,
    letterSpacing: s.tracking ?? 0,
    ...(s.uppercase ? { textTransform: 'uppercase' as const } : null),
  };
}
