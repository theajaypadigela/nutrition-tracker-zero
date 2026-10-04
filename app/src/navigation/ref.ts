import { createNavigationContainerRef } from '@react-navigation/native';
import type { CallKind } from '@/api/types';
import type { RootStackParamList } from './types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/** Polls until the navigator is ready: an answered call can cold-start the whole app. */
function whenReady(run: () => void, attempts = 0) {
  if (navigationRef.isReady()) run();
  else if (attempts < 200) setTimeout(() => whenReady(run, attempts + 1), 150);
}

export function openVoiceCall(kind: CallKind, autoStart: boolean) {
  whenReady(() => {
    const current = navigationRef.getCurrentRoute();
    if (current?.name === 'VoiceCall') return;
    navigationRef.navigate('VoiceCall', { kind, autoStart });
  });
}
