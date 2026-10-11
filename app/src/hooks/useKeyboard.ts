import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  StatusBar,
  TextInput,
  type KeyboardEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native';

// Android only reports the "did" events.
const SHOW_EVENT = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
const HIDE_EVENT = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

/**
 * How much of the screen's bottom the open keyboard covers, or 0. Measured from its top
 * edge: on edge-to-edge Android the reported height leaves out the navigation bar strip
 * the keyboard also sits over.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(SHOW_EVENT, (e: KeyboardEvent) =>
      setHeight(Math.max(e.endCoordinates.height, Dimensions.get('screen').height - e.endCoordinates.screenY)),
    );
    const hide = Keyboard.addListener(HIDE_EVENT, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

/**
 * Keeps the focused field of a scrolling form above the keyboard. The app targets
 * Android 15+, where edge-to-edge is enforced and adjustResize no longer shrinks the
 * window, so KeyboardAvoidingView alone leaves low fields underneath the keyboard.
 *
 * Spread `scrollProps` onto the ScrollView and add `keyboardHeight` to its bottom padding.
 * `clearance` is the space to keep free above the keyboard, e.g. for a button under the
 * field or a bottom bar that rides on top of the keyboard.
 */
export function useKeyboardAwareScroll(clearance = 24) {
  const scrollRef = useRef<ScrollView>(null);
  const offsetY = useRef(0);
  const keyboardHeight = useKeyboardHeight();

  useEffect(() => {
    const sub = Keyboard.addListener(SHOW_EVENT, (e: KeyboardEvent) => {
      // A frame later, the keyboard padding is laid out and there is room to scroll into.
      requestAnimationFrame(() => {
        const input = TextInput.State.currentlyFocusedInput();
        const scroll = scrollRef.current;
        if (!input || !scroll) return;
        input.measureInWindow((_x, y, _w, h) => {
          // Android measures from below the status bar, but the keyboard's screenY is from the
          // top of the screen.
          const top = y + (Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0);
          const overlap = top + h + clearance - e.endCoordinates.screenY;
          if (overlap > 0) scroll.scrollTo({ y: offsetY.current + overlap, animated: true });
        });
      });
    });
    return () => sub.remove();
  }, [clearance]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetY.current = e.nativeEvent.contentOffset.y;
  }, []);

  return { keyboardHeight, scrollProps: { ref: scrollRef, onScroll, scrollEventThrottle: 16 } };
}
