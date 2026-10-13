import { StyleSheet } from 'react-native';

/** Spacing, on a 4-point grid. */
export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

/** Corner radii. Cards are 14, controls (buttons, inputs) 12, anything small or round is a pill. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 20,
  sheet: 24,
  pill: 999,
} as const;

/** Fixed dimensions shared across screens. */
export const size = {
  /** Side padding of every screen. */
  gutter: 20,
  /** Minimum touch target. */
  hit: 44,
  control: 48,
  controlSm: 36,
  tabBar: 56,
  header: 56,
  fab: 56,
  icon: { sm: 16, md: 20, lg: 24 },
} as const;

/** The thinnest line the display can draw: card outlines and dividers. */
export const hairline = StyleSheet.hairlineWidth;
