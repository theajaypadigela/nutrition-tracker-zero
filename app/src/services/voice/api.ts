import { ApiError, isAllowedBaseUrl, request } from '@/api/client';
import { API_BASE_URL, APP_TOKEN, ON_DEVICE } from '@/config/local';
import type { CallKind } from '@/api/types';
import type { VoiceConfiguration, VoiceEndReason, VoiceFunction, VoiceStart } from '../../../../shared/voice';

export const voiceApi = {
  configuration: () => request<VoiceConfiguration>('GET', '/voice/config'),
  start: (kind: CallKind) => request<VoiceStart>('POST', '/voice/calls/start', { kind }),
  started: (id: number) => request('POST', `/voice/calls/${id}/started`, {}),
  tool: (id: number, call: VoiceFunction) => request<Record<string, unknown>>('POST', `/voice/calls/${id}/tools`, call),
  ended: (id: number, reason: VoiceEndReason, transcript: string, durationSeconds: number) =>
    request('POST', `/voice/calls/${id}/ended`, { reason, transcript, durationSeconds }),
};

/** Never call the embedded Worker for secrets. Local meals stay on the phone; only this broker request goes online. */
export interface VoiceCredentials { transport: 'direct' | 'proxy'; accessToken?: string; expiresIn?: number }
export function voiceProxyConnection(): { url: string; headers: Record<string, string> } {
  if (!isAllowedBaseUrl(API_BASE_URL)) throw new Error('The voice backend address must use https://');
  return { url: `${API_BASE_URL.replace(/^http/, 'ws')}/voice/connect`, headers: { Authorization: `Bearer ${APP_TOKEN}` } };
}
export async function voiceCredentials(): Promise<VoiceCredentials> {
  if (!ON_DEVICE) return request('POST', '/voice/credentials', {});
  if (!isAllowedBaseUrl(API_BASE_URL)) throw new Error('The voice backend address must use https://');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${API_BASE_URL}/voice/credentials`, { method: 'POST',
      headers: { authorization: `Bearer ${APP_TOKEN}`, 'content-type': 'application/json' },
      body: '{}', signal: controller.signal });
    const body = await res.json();
    if (!res.ok) throw new ApiError(res.status, body.error?.code ?? 'voice_auth_failed', body.error?.message ?? 'Could not authorize the voice call');
    if (body.transport !== 'proxy' && !body.accessToken) throw new Error('The voice backend returned invalid credentials');
    return body;
  } finally { clearTimeout(timer); }
}
