import type { VoiceFunction, VoiceStart, VoiceTranscript, VoiceEndReason } from '../../../../shared/voice';
import type { AudioRoute, CallAudioState } from '@/services/calls/audioRoute';

export type VoiceStatus = 'idle' | 'connecting' | 'active' | 'ended' | 'error';
export type TranscriptLine = VoiceTranscript;
export interface VoiceCallbacks {
  onStarted(providerCallId: string): Promise<void>;
  onEnded(reason: VoiceEndReason): Promise<void>;
  onError(message: string): void;
  onTranscript(line: VoiceTranscript): void;
  onSpeaking(speaking: boolean): void;
  onAudio(state: CallAudioState | null): void;
  onFunction(call: VoiceFunction): Promise<Record<string, unknown>>;
}
/** All SDK, transport, audio and provider message details stay inside an adapter. */
export interface VoiceSession {
  start(): Promise<void>;
  stop(reason?: VoiceEndReason): Promise<void>;
  setMuted(muted: boolean): void;
  setAudioRoute(route: AudioRoute): void;
  dispose(): void;
}
export interface VoiceProvider {
  readonly id: string;
  create(start: VoiceStart, callbacks: VoiceCallbacks): VoiceSession;
}
