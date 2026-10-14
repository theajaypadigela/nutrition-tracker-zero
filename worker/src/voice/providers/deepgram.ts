import { HttpError } from '../../http';
import { conversation } from '../conversation';
import type { VoiceProvider } from '../provider';
import { connectDeepgramProxy } from '../proxy';

export const deepgramProvider: VoiceProvider = {
  id: 'deepgram',
  connect: connectDeepgramProxy,
  // An on-device backend requests credentials from the hosted broker; it never stores a key.
  configured: env => (env.ON_DEVICE as string) === '1' || !!env.DEEPGRAM_API_KEY?.trim(),
  prepare(c) {
    const dialog = conversation(c);
    return {
      providerCallId: `deepgram:${crypto.randomUUID()}`,
      lifecycle: 'client',
      config: {
        url: 'wss://agent.deepgram.com/v1/agent/converse', maxDurationSeconds: 600,
        settings: {
          type: 'Settings', mip_opt_out: true,
          audio: { input: { encoding: 'linear16', sample_rate: 16000 },
            output: { encoding: 'linear16', sample_rate: 24000, container: 'none' } },
          agent: {
            greeting: dialog.greeting,
            listen: { provider: { type: 'deepgram', model: c.env.DEEPGRAM_STT_MODEL || 'nova-3',
              language: c.env.DEEPGRAM_STT_LANGUAGE || 'multi' } },
            think: { provider: { type: 'open_ai', model: c.env.DEEPGRAM_LLM_MODEL || 'gpt-4o-mini', temperature: 0.3 },
              prompt: dialog.prompt, functions: dialog.functions },
            speak: { provider: { type: 'deepgram', model: c.env.DEEPGRAM_TTS_MODEL || 'aura-2-thalia-en' } },
          },
        },
      },
    };
  },
  async credentials(env) {
    if ((env.ON_DEVICE as string) === '1' || !env.DEEPGRAM_API_KEY?.trim()) {
      throw new HttpError(503, 'voice_not_configured', 'Configure the Deepgram key on the hosted voice backend');
    }
    if (env.DEEPGRAM_AUTH_MODE === 'proxy') return { transport: 'proxy' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch('https://api.deepgram.com/v1/auth/grant', {
        method: 'POST', headers: { authorization: `Token ${env.DEEPGRAM_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ttl_seconds: 30 }), signal: controller.signal,
      });
      // Inference-only keys cannot mint JWTs. Keep them on the server and proxy audio instead.
      if (res.status === 403) return { transport: 'proxy' };
      if (!res.ok) throw new HttpError(502, 'voice_auth_failed', 'Deepgram could not authorize the call. Check the backend key and account credit');
      const body = await res.json<{ access_token?: string; expires_in?: number }>();
      if (!body.access_token || !body.expires_in) throw new HttpError(502, 'voice_auth_failed', 'Deepgram returned invalid credentials');
      return { transport: 'direct', accessToken: body.access_token, expiresIn: body.expires_in };
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(502, 'voice_auth_failed', 'Could not reach Deepgram to authorize the call');
    } finally { clearTimeout(timer); }
  },
};
