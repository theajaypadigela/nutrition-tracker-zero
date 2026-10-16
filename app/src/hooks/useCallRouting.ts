import { useEffect } from 'react';
import { AppState } from 'react-native';
import notifee, { EventType } from '@notifee/react-native';
import { openVoiceCall } from '@/navigation/ref';
import { reminderLog } from '@/services/calls/logger';
import {
  cancelAutoRetry,
  consumePendingAnswer,
  consumePendingMissedAction,
  subscribeToNativeCallEvents,
} from '@/services/calls/native';
import { takePendingOpen } from '@/services/calls/pendingOpen';
import { reconcile } from '@/services/calls/reconcile';
import { handleNotifeeEvent } from '@/services/calls/ringEvents';
import { recordRing } from '@/services/calls/scheduleStore';

/**
 * Wires rings to the UI while a profile is selected: answered rings and "Log now" open the call
 * screen, and every cold start / resume runs reconciliation. `signedIn` is null until the stored
 * profile has loaded; nothing runs then, so a cold start never looks like a sign-out.
 */
export function useCallRouting(signedIn: boolean | null, profileId?: string) {
  useEffect(() => {
    if (signedIn === null) return;
    if (!signedIn) {
      cancelAutoRetry();
      reconcile('signed-out', { signedIn: false }).catch(() => {});
      return;
    }
    let queue: Promise<unknown> = Promise.resolve();
    const consume = async () => {
      const answered = await consumePendingAnswer();
      if (answered) {
        await recordRing({ result: 'answered', callKind: answered.callKind, at: Date.now() });
        openVoiceCall(answered.callKind, true);
        return;
      }
      const logNow = await consumePendingMissedAction();
      if (logNow) {
        openVoiceCall('manual', true);
        return;
      }
      const pressed = await takePendingOpen();
      if (pressed) openVoiceCall(pressed.callKind, true);
    };
    const run = (reason: string) => {
      const next = queue.then(async () => {
        await consume();
        await reconcile(reason, { signedIn: true, profileId });
      });
      queue = next.catch((e) => reminderLog.warn('routing.failed', String(e)));
    };

    run('cold-start');
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') run('resume');
    });
    const unsubscribeNative = subscribeToNativeCallEvents((e) => {
      if (e === 'answered') run('native-answer');
    });
    const unsubscribeForeground = notifee.onForegroundEvent((event) => {
      handleNotifeeEvent(event)
        .then((pressed) => pressed && openVoiceCall(pressed.callKind, true))
        .catch(() => {});
    });
    notifee
      .getInitialNotification()
      .then((initial) => {
        if (!initial) return;
        return handleNotifeeEvent({ type: EventType.PRESS, detail: { notification: initial.notification } }).then(
          (pressed) => pressed && openVoiceCall(pressed.callKind, true),
        );
      })
      .catch(() => {});

    return () => {
      appState.remove();
      unsubscribeNative();
      unsubscribeForeground();
    };
  }, [signedIn, profileId]);
}
