/**
 * Non-colour design values for the unified "call" experience — the incoming-call
 * banner, the full-screen incoming call, and the in-call voice session screen.
 *
 * Colours live in `@/theme/tokens` under `tokens.call.*`. This module used to
 * re-export them as `callColors`, which was a one-line alias, plus `callRadius`,
 * `callSpacing` and a `callTheme` bundle that no file imported.
 */

import { Platform } from 'react-native';

export const callFontFamily = Platform.select({
  ios: 'SF Pro Text',
  android: 'sans-serif',
});
