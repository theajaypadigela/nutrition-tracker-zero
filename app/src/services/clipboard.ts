import { Clipboard } from 'react-native';

/**
 * The clipboard, in one place. React Native 0.83 still ships it (deprecated: it warns once in a development build and works in a
 * release one). When the project moves to a React Native that no longer has it, install `@react-native-clipboard/clipboard` and
 * change the two calls below; nothing else in the app touches the clipboard.
 */

/** Copies `text`; false when the platform refuses, so the caller can say so. */
export function copyText(text: string): boolean {
  try {
    Clipboard.setString(text);
    return true;
  } catch {
    return false;
  }
}

/** What is on the clipboard, or '' when it is empty or cannot be read. */
export async function pasteText(): Promise<string> {
  try {
    return await Clipboard.getString();
  } catch {
    return '';
  }
}
