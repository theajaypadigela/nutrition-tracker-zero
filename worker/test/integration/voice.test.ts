import { env } from 'cloudflare:test';
import { describe, expect, it, vi, afterEach } from 'vitest';
import worker from '../../src/index';
import { deepgramProvider } from '../../src/voice/providers/deepgram';
import { api, APP_TOKEN, BASE, createProfile } from '../helpers';

afterEach(() => vi.restoreAllMocks());
const start = (userId: string) => api('POST', '/voice/calls/start', { userId, body: { kind: 'manual' } });
const tool = (userId: string, id: number, toolId: string, items: unknown) => api('POST', `/voice/calls/${id}/tools`,
  { userId, body: { id: toolId, name: 'save_foods', arguments: { items } } });
const item = { name: 'idli', quantity: 2, unit: 'piece', meal: 'breakfast' };

describe('provider-neutral voice lifecycle', () => {
  it('defaults to Deepgram without requiring a Vapi key or exposing secrets', async () => {
    const userId = await createProfile();
    const config = await api('GET', '/voice/config', { userId });
    expect(config.body).toEqual({ provider: 'deepgram', configured: true });
    const session = await start(userId);
    expect(session.status).toBe(201);
    expect(session.body).toMatchObject({ provider: 'deepgram', lifecycle: 'client' });
    expect(session.body.providerCallId).toMatch(/^deepgram:/);
    expect(session.text).not.toContain('test-deepgram-key');
    expect(session.body.config.settings.agent.think.functions.map((f: { name: string }) => f.name)).toEqual(['save_foods', 'mark_day_complete', 'end_call']);
    expect(session.body.config.settings.agent.think.prompt).toContain('Is that right?');
    expect(session.body.config.settings.agent.think.prompt).toContain('Should I mark this day as complete?');
    expect(session.body.config.settings.agent.think.prompt).toContain('never say it was saved before success');
  });
  it('saves, deduplicates, corrects and settles confirmed meals with the existing nutrition pipeline', async () => {
    const userId = await createProfile();
    const { body: s } = await start(userId);
    expect((await api('POST', `/voice/calls/${s.callId}/started`, { userId, body: {} })).status).toBe(200);
    expect((await tool(userId, s.callId, 't1', [item])).body.result).toBe('Saved 1 items');
    await tool(userId, s.callId, 't1', [item]);
    await tool(userId, s.callId, 't2', [{ ...item, quantity: 3 }]);
    const day = (await api('GET', `/days/${s.localDate}`, { userId })).body;
    expect(day.items).toHaveLength(1);
    expect(day.items[0]).toMatchObject({ quantity: 3, source: 'call', callId: s.providerCallId });
    expect(day.calls[0]).toMatchObject({ provider: 'deepgram', providerCallId: s.providerCallId, vapiCallId: null, status: 'tool_saved' });
    const end = await api('POST', `/voice/calls/${s.callId}/ended`, { userId,
      body: { reason: 'assistant-ended-call', transcript: 'User: Three idli', durationSeconds: 15 } });
    expect(end.body.call).toMatchObject({ status: 'tool_saved', endedReason: 'assistant-ended-call', durationSeconds: 15 });
    expect((await tool(userId, s.callId, 'late', [item])).status).toBe(409);
    const again = await api('POST', `/voice/calls/${s.callId}/ended`, { userId, body: { reason: 'pipeline-error' } });
    expect(again.body.call.endedReason).toBe('assistant-ended-call');
  });
  it('marks the call date only with explicit confirmation and keeps manual changes on redelivery', async () => {
    const owner = await createProfile(), other = await createProfile();
    const { body: s } = await start(owner);
    const mark = (userId: string, id: string, confirmed: unknown) => api('POST', `/voice/calls/${s.callId}/tools`,
      { userId, body: { id, name: 'mark_day_complete', arguments: { confirmed } } });
    await tool(owner, s.callId, 'foods', [item]);
    expect((await api('GET', `/days/${s.localDate}`, { userId: owner })).body.status).toBeNull();
    for (const confirmed of [false, 'true', null]) expect((await mark(owner, 'invalid', confirmed)).body.error).toContain('explicit yes');
    expect((await mark(other, 'cross-profile', true)).status).toBe(404);
    expect((await api('GET', `/days/${s.localDate}`, { userId: owner })).body.status).toBeNull();
    // Calls that cross midnight still mark the day on which they started.
    await env.DB.prepare("UPDATE calls SET local_date = '2026-10-01' WHERE id = ?").bind(s.callId).run();
    const results = await Promise.all([mark(owner, 'mark', true), mark(owner, 'mark', true)]);
    expect(results.map(r => r.body.result)).toEqual(['Day marked complete', 'Day marked complete']);
    expect((await api('GET', '/days/2026-10-01', { userId: owner })).body.status).toBe('complete');
    expect((await api('GET', `/days/${s.localDate}`, { userId: owner })).body.status).toBeNull();
    await api('PUT', '/days/2026-10-01/status', { userId: owner, body: { status: 'partial' } });
    await mark(owner, 'mark', true);
    expect((await api('GET', '/days/2026-10-01', { userId: owner })).body.status).toBe('partial');
    await api('POST', `/voice/calls/${s.callId}/ended`, { userId: owner, body: { reason: 'assistant-ended-call' } });
    expect((await mark(owner, 'late', true)).status).toBe(409);
  });
  it('rejects cross-profile operations and malformed calls without losing the conversation', async () => {
    const owner = await createProfile(), other = await createProfile();
    const { body: s } = await start(owner);
    expect((await tool(other, s.callId, 'x', [item])).status).toBe(404);
    expect((await tool(owner, s.callId, 'bad', [{ ...item, quantity: -1 }])).body.error).toContain('retry');
    expect((await api('POST', '/voice/calls/start', { userId: owner, body: { kind: 'unknown' } })).status).toBe(400);
    expect((await api('POST', '/voice/calls/start', { token: null, body: {} })).status).toBe(401);
  });
  it('deduplicates simultaneous redelivery without overwriting a later correction', async () => {
    const userId = await createProfile();
    const { body: s } = await start(userId);
    const results = await Promise.all([tool(userId, s.callId, 'same', [item]), tool(userId, s.callId, 'same', [item])]);
    expect(results.map(r => r.status)).toEqual([200, 200]);
    const row = await env.DB.prepare('SELECT processed_tool_call_ids FROM calls WHERE id = ?').bind(s.callId).first<{ processed_tool_call_ids: string }>();
    expect(JSON.parse(row!.processed_tool_call_ids)).toHaveLength(1);
    await tool(userId, s.callId, 'correction', [{ ...item, quantity: 3 }]);
    await tool(userId, s.callId, 'same', [item]);
    const day = (await api('GET', `/days/${s.localDate}`, { userId })).body;
    expect(day.items).toHaveLength(1); expect(day.items[0].quantity).toBe(3);
  });
  it('marks empty calls and pipeline failures correctly', async () => {
    const userId = await createProfile();
    for (const [reason, status] of [['customer-ended-call', 'no_list'], ['pipeline-error', 'failed']]) {
      const { body: s } = await start(userId);
      const res = await api('POST', `/voice/calls/${s.callId}/ended`, { userId, body: { reason } });
      expect(res.body.call.status).toBe(status);
    }
  });
  it('switches to the preserved Vapi assistant by environment configuration', async () => {
    const userId = await createProfile();
    await api('PUT', '/me/settings', { userId, body: { vapiPublicKey: 'pk_preserved_test' } });
    const res = await worker.fetch(new Request(`${BASE}/voice/calls/start`, { method: 'POST',
      headers: { authorization: `Bearer ${APP_TOKEN}`, 'x-user-id': userId, 'content-type': 'application/json' }, body: '{"kind":"manual"}' }),
      { ...env, VOICE_PROVIDER: 'vapi' } as unknown as Env);
    const body = await res.json<any>();
    expect(body).toMatchObject({ provider: 'vapi', lifecycle: 'provider', config: { publicKey: 'pk_preserved_test' } });
    expect(body.config.assistant.voice).toEqual({ provider: 'vapi', voiceId: 'Neha' });
    expect(body.config.assistant.model.tools[0].function.name).toBe('save_foods');
    expect((await api('POST', '/calls/start', { userId, body: {} })).status).toBe(201);
  });
  it('fails clearly for unsupported providers and missing backend credentials', async () => {
    const userId = await createProfile();
    for (const vars of [{ VOICE_PROVIDER: 'missing' }, { DEEPGRAM_API_KEY: '' }]) {
      const res = await worker.fetch(new Request(`${BASE}/voice/calls/start`, { method: 'POST',
        headers: { authorization: `Bearer ${APP_TOKEN}`, 'x-user-id': userId, 'content-type': 'application/json' }, body: '{}' }),
        { ...env, ...vars } as unknown as Env);
      expect([409, 503]).toContain(res.status);
    }
  });
});

describe('backend-only Deepgram credentials', () => {
  it('mints a short-lived JWT and never returns the API key', async () => {
    const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ access_token: 'short-jwt', expires_in: 30 })));
    const result = await deepgramProvider.credentials!({ ...env, DEEPGRAM_API_KEY: 'private-canary' } as unknown as Env);
    expect(result).toEqual({ transport: 'direct', accessToken: 'short-jwt', expiresIn: 30 });
    expect(mock.mock.calls[0]?.[1]).toMatchObject({ headers: { authorization: 'Token private-canary' }, body: '{"ttl_seconds":30}' });
    expect(JSON.stringify(result)).not.toContain('private-canary');
  });
  it('requires authentication on the broker', async () => {
    expect((await api('POST', '/voice/credentials', { token: null, body: {} })).status).toBe(401);
  });
  it('uses a backend proxy for inference-only keys without returning error bodies or secrets', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('secret error body', { status: 403 }));
    await expect(deepgramProvider.credentials!({ ...env, DEEPGRAM_API_KEY: 'private-canary' } as unknown as Env))
      .resolves.toEqual({ transport: 'proxy' });
  });
  it('never puts backend keys into an on-device credential path', async () => {
    await expect(deepgramProvider.credentials!({ ...env, ON_DEVICE: '1' } as unknown as Env)).rejects.toThrow('hosted voice backend');
  });
});
