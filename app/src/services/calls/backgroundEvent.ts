import notifee from '@notifee/react-native';
import { handleNotifeeEvent } from './ringEvents';
import { setPendingOpen } from './pendingOpen';

/**
 * Headless Notifee handler. Registered in index.js BEFORE registerComponent and outside any
 * try/catch, so a JS load failure can never orphan a ring.
 */
export function registerBackgroundEvent(): void {
  notifee.onBackgroundEvent(async (event) => {
    const pressed = await handleNotifeeEvent(event);
    if (pressed) await setPendingOpen(pressed);
  });
}
