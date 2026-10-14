/** Provider-neutral wire contract. Provider options are interpreted only by adapters. */
export interface VoiceStart {
  callId: number;
  localDate: string;
  provider: string;
  providerCallId: string | null;
  lifecycle: 'client' | 'provider';
  config: Record<string, unknown>;
}

export interface VoiceConfiguration {
  provider: string;
  configured: boolean;
}

export interface VoiceTranscript {
  role: 'assistant' | 'user';
  text: string;
}

export interface VoiceFunction {
  id: string;
  name: string;
  arguments: unknown;
}

export type VoiceEndReason = 'customer-ended-call' | 'assistant-ended-call' | 'pipeline-error' | 'max-duration';
