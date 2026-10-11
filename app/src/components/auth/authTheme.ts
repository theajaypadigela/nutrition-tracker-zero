/**
 * Nourish auth/onboarding non-colour design values — the React Native port of the
 * Claude Design `auth-data.jsx` `AUTH_TOKENS` scale. Plain values (not NativeWind)
 * because the design relies on precise gradients, focus rings, and radii.
 *
 * Colours are NOT re-exported here. They live in `@/theme/tokens` under
 * `tokens.auth.*`; this module used to mirror them as `T`, which meant every colour
 * had two names. Import `tokens` directly.
 */

/** Corner radii, mirroring the design's `--r-*` scale (base 16). */
export const R = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;
