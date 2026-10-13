import { useCallback, useState } from 'react';

/**
 * Pressed state for a Pressable, as plain state rather than a function-form `style` (NativeWind's
 * wrapper around Pressable drops those). Spread `handlers` onto the Pressable.
 */
export function usePressed() {
  const [pressed, setPressed] = useState(false);
  const onPressIn = useCallback(() => setPressed(true), []);
  const onPressOut = useCallback(() => setPressed(false), []);
  return { pressed, handlers: { onPressIn, onPressOut } };
}
