import notifee from '@notifee/react-native';
import { handleNotifeeEvent } from './ringEvents';
import { setPendingOpen } from './pendingOpen';

/**
 * Legacy Notifee notification interactions. Daily/test scheduling now delivers natively;
 * this handler is retained for notification taps and old notifications during migration.
 */
export function registerBackgroundEvent(): void {
  notifee.onBackgroundEvent(async (event) => {
    const pressed = await handleNotifeeEvent(event);
    if (pressed) await setPendingOpen(pressed);
  });
}
