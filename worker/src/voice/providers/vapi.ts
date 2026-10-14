import { buildAssistant } from '../../vapi/assistant';
import type { VoiceProvider } from '../provider';

/** Compatibility adapter over the preserved Vapi implementation. */
export const vapiProvider: VoiceProvider = {
  id: 'vapi',
  configured: (_env, user) => !!user.vapi_public_key,
  prepare({ env, url, user, callId, localDate, localTime, alreadyLogged }) {
    const base = (env.PUBLIC_BASE_URL?.trim() || url.origin).replace(/\/+$/, '');
    return {
      providerCallId: null,
      lifecycle: 'provider',
      config: {
        publicKey: user.vapi_public_key,
        assistant: buildAssistant({
          userId: user.id, name: user.name, callRowId: callId, localDate, localTime, alreadyLogged,
          webhookUrl: (env.ON_DEVICE as string) === '1' ? null : `${base}/vapi/webhook/${user.webhook_token}`,
        }),
      },
    };
  },
};
