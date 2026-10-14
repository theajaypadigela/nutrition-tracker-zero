import { HttpError } from '../http';
import type { VoiceProvider } from './provider';
import { deepgramProvider } from './providers/deepgram';
import { vapiProvider } from './providers/vapi';

const providers = new Map<string, VoiceProvider>([deepgramProvider, vapiProvider].map(p => [p.id, p]));
export function registerVoiceProvider(provider: VoiceProvider): void { providers.set(provider.id, provider); }
export function voiceProvider(env: Env): VoiceProvider {
  const id = env.VOICE_PROVIDER?.trim().toLowerCase() || 'deepgram';
  const provider = providers.get(id);
  if (!provider) throw new HttpError(503, 'unknown_voice_provider', `Voice provider ${id} is not registered`);
  return provider;
}
