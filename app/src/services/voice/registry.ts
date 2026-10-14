import type { VoiceStart } from '../../../../shared/voice';
import type { VoiceCallbacks, VoiceProvider, VoiceSession } from './types';

// Lazy factories ensure inactive SDKs are never initialized in the active call flow.
const providers = new Map<string, () => VoiceProvider>([
  ['deepgram', () => require('./providers/deepgram').deepgramProvider],
  ['vapi', () => require('./providers/vapi').vapiProvider],
]);
export function registerVoiceProvider(id: string, factory: () => VoiceProvider): void { providers.set(id, factory); }
export function createVoiceSession(start: VoiceStart, callbacks: VoiceCallbacks): VoiceSession {
  const factory = providers.get(start.provider);
  if (!factory) throw new Error(`Voice provider ${start.provider} is not supported by this app`);
  return factory().create(start, callbacks);
}
