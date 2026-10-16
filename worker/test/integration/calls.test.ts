// Phase 3: call lifecycle, webhook replay scenarios (PLAN.md §9), and the key-leak check.
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import saveFixture from '../fixtures/vapi/tool-calls.save.json';
import correctionFixture from '../fixtures/vapi/tool-calls.correction.json';
import reportFixture from '../fixtures/vapi/end-of-call-report.json';
import noListFixture from '../fixtures/vapi/end-of-call-report.no-list.json';
import { api, createProfile, fillFixture, postWebhook, webhookToken } from '../helpers';
import { localDateIn } from '../../src/domain/time';
import { withDayCompletion } from '../features';

const KEY = 'pk-LEAKCHECK-5f0c2e7a-91b3';

async function profileWithKey() {
  const userId = await createProfile();
  await api('PUT', '/me/settings', { userId, body: { vapiPublicKey: KEY } });
  return { userId, token: await webhookToken(userId) };
}

async function startCall(userId: string, kind = 'scheduled') {
  const res = await api('POST', '/calls/start', { userId, body: { kind } });
  expect(res.status).toBe(201);
  return res.body;
}

const vapiId = () => `vapi-${crypto.randomUUID()}`;
const today = () => localDateIn('Asia/Kolkata');

async function callItems(userId: string) {
  const d = (await api('GET', `/days/${today()}`, { userId })).body;
  return d.items.filter((i: any) => i.source === 'call');
}

describe('POST /calls/start', () => {
  it('needs a configured Vapi key', async () => {
    const userId = await createProfile();
    const res = await api('POST', '/calls/start', { userId, body: { kind: 'test' } });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('vapi_not_configured');
  });

  it('records a queued call and returns the key and an inline assistant aimed at the webhook', async () => {
    const { userId, token } = await profileWithKey();
    const start = await startCall(userId, 'test');
    expect(start.publicKey).toBe(KEY);
    expect(start.localDate).toBe(today());
    expect(start.assistant.server.url).toBe(`https://zero.example/vapi/webhook/${token}`);
    expect(start.assistant.model.tools[0].server.url).toBe(`https://zero.example/vapi/webhook/${token}`);
    expect(start.assistant.metadata).toEqual({ userId, localDate: today(), callRowId: start.callId });
    const latest = await api('GET', '/calls/latest', { userId });
    expect(latest.body.call).toMatchObject({ id: start.callId, kind: 'test', status: 'queued' });
    expect((await api('POST', '/calls/start', { userId, body: { kind: 'bogus' } })).status).toBe(400);
  });

  it('tells the assistant what is already logged today', async () => {
    const { userId } = await profileWithKey();
    await api('POST', `/days/${today()}/items`, { userId, body: { items: [{ name: 'poha', quantity: 1, unit: 'plate', meal: 'breakfast' }] } });
    const start = await startCall(userId);
    expect(start.assistant.model.messages[0].content).toContain('1 plate poha (breakfast)');
    expect(start.assistant.firstMessage).toContain('I already have your breakfast.');
  });
});

describe('webhook replay scenarios', () => {
  it('save → items; duplicate → nothing new; correction → replaced; report keeps tool_saved', async () => {
    const { userId, token } = await profileWithKey();
    const start = await startCall(userId);
    const callId = vapiId();
    const started = await api('POST', `/calls/${start.callId}/started`, { userId, body: { vapiCallId: callId } });
    expect(started.body.call.status).toBe('called');

    const save = fillFixture(saveFixture, { CALL_ID: callId, TOOL_CALL_ID: 'tc-1' });
    const first = await postWebhook(token, save);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ results: [{ name: 'save_foods', toolCallId: 'tc-1', result: 'Saved 5 items' }] });
    let items = await callItems(userId);
    expect(items).toHaveLength(5);
    expect(items.map((i: any) => i.normalizedName).sort()).toEqual(['dal', 'idli', 'rice', 'sambar', 'tea']);
    expect(items.every((i: any) => i.callId === callId)).toBe(true);

    const dup = await postWebhook(token, save);
    expect(dup.body.results[0].result).toBe('Saved 5 items');
    expect(await callItems(userId)).toHaveLength(5);

    const correction = await postWebhook(token, fillFixture(correctionFixture, { CALL_ID: callId, TOOL_CALL_ID: 'tc-2' }));
    expect(correction.body.results[0].result).toBe('Saved 4 items');
    items = await callItems(userId);
    expect(items).toHaveLength(4);
    expect(items.find((i: any) => i.normalizedName === 'idli').quantity).toBe(4);

    // A late redelivery of the first save must not undo the correction.
    await postWebhook(token, save);
    expect(await callItems(userId)).toHaveLength(4);

    const report = await postWebhook(token, fillFixture(reportFixture, { CALL_ID: callId }));
    expect(report.status).toBe(200);
    const call = (await api('GET', '/calls/latest', { userId })).body.call;
    expect(call).toMatchObject({ id: start.callId, status: 'tool_saved', endedReason: 'assistant-ended-call', durationSeconds: 150 });
  });

  it('marks completion through the Vapi webhook only after a yes, without disturbing saved foods', withDayCompletion(async () => {
    const { userId, token } = await profileWithKey();
    const start = await startCall(userId);
    const callId = vapiId();
    await api('POST', `/calls/${start.callId}/started`, { userId, body: { vapiCallId: callId } });
    await postWebhook(token, fillFixture(saveFixture, { CALL_ID: callId, TOOL_CALL_ID: 'foods' }));
    const mark = (confirmed: unknown) => JSON.stringify({ message: { type: 'tool-calls', call: { id: callId },
      toolCallList: [{ id: 'mark', function: { name: 'mark_day_complete', arguments: { confirmed } } }] } });
    expect((await postWebhook(token, mark(false))).body.results[0].error).toContain('explicit yes');
    expect((await api('GET', `/days/${start.localDate}`, { userId })).body.status).toBeNull();
    expect((await postWebhook(token, mark(true))).body.results[0].result).toBe('Day marked complete');
    expect((await api('GET', `/days/${start.localDate}`, { userId })).body.status).toBe('complete');
    expect(await callItems(userId)).toHaveLength(5);
    await api('PUT', `/days/${start.localDate}/status`, { userId, body: { status: 'partial' } });
    await postWebhook(token, mark(true));
    expect((await api('GET', `/days/${start.localDate}`, { userId })).body.status).toBe('partial');
  }));

  it('answers schedule_callback over the webhook with the time to say back, and does not mark a day while the feature is off', async () => {
    const { userId, token } = await profileWithKey();
    const start = await startCall(userId);
    const callId = vapiId();
    await api('POST', `/calls/${start.callId}/started`, { userId, body: { vapiCallId: callId } });
    const tool = (name: string, id: string, args: unknown) => postWebhook(token, JSON.stringify({ message: { type: 'tool-calls', call: { id: callId }, toolCallList: [{ id, function: { name, arguments: args } }] } }));
    const ok = (await tool('schedule_callback', 'cb1', { minutes: 20 })).body.results[0];
    expect(ok).toMatchObject({ name: 'schedule_callback', toolCallId: 'cb1' });
    expect(ok.result).toMatch(/call them again in 20 minutes, at \d{1,2}:\d{2} (am|pm)/);
    // arguments arrive as a JSON string from some providers
    expect((await tool('schedule_callback', 'cb2', JSON.stringify({ minutes: 60 }))).body.results[0].result).toContain('1 hour');
    expect((await tool('schedule_callback', 'cb3', { minutes: 5000 })).body.results[0].error).toContain('within 12 hours');
    expect((await tool('schedule_callback', 'cb4', {})).body.results[0].error).toContain('how many minutes');
    // the call is not affected: nothing saved, nothing marked
    expect((await tool('mark_day_complete', 'mark', { confirmed: true })).body.results[0].error).toContain('not available');
    expect((await api('GET', `/days/${start.localDate}`, { userId })).body.status).toBeNull();
    expect(await callItems(userId)).toHaveLength(0);
  });

  it('a call that ends without save_foods becomes no_list with its transcript', async () => {
    const { userId, token } = await profileWithKey();
    const start = await startCall(userId);
    const callId = vapiId();
    await api('POST', `/calls/${start.callId}/started`, { userId, body: { vapiCallId: callId } });
    await postWebhook(token, fillFixture(noListFixture, { CALL_ID: callId }));

    const d = (await api('GET', `/days/${today()}`, { userId })).body;
    const call = d.calls.find((c: any) => c.id === start.callId);
    expect(call).toMatchObject({ status: 'no_list', endedReason: 'customer-ended-call', durationSeconds: 42 });
    expect(call.transcript).toContain("I'll log it later");

    // Manual add attached to the no_list call.
    const add = await api('POST', `/days/${today()}/items`, { userId, body: { callId: start.callId, items: [{ name: 'dosa', quantity: 2, unit: 'piece' }] } });
    expect(add.body.items[0]).toMatchObject({ source: 'manual', callId });
  });

  it('start errors become failed', async () => {
    const { userId, token } = await profileWithKey();
    const start = await startCall(userId);
    const callId = vapiId();
    await api('POST', `/calls/${start.callId}/started`, { userId, body: { vapiCallId: callId } });
    const payload = JSON.parse(fillFixture(noListFixture, { CALL_ID: callId }));
    payload.message.endedReason = 'customer-did-not-give-microphone-permission';
    await postWebhook(token, JSON.stringify(payload));
    expect((await api('GET', '/calls/latest', { userId })).body.call).toMatchObject({
      status: 'failed',
      error: 'customer-did-not-give-microphone-permission',
    });
  });

  it('falls back to metadata.callRowId when /started never arrived', async () => {
    const { userId, token } = await profileWithKey();
    const start = await startCall(userId);
    const callId = vapiId();
    const payload = JSON.parse(fillFixture(saveFixture, { CALL_ID: callId, TOOL_CALL_ID: 'tc-m' }));
    payload.message.call.assistant = { metadata: start.assistant.metadata };
    const res = await postWebhook(token, JSON.stringify(payload));
    expect(res.body.results[0].result).toBe('Saved 5 items');
    const call = (await api('GET', '/calls/latest', { userId })).body.call;
    expect(call).toMatchObject({ id: start.callId, vapiCallId: callId, status: 'tool_saved', kind: 'scheduled' });
  });

  it('records an unknown call, and /started later merges into it', async () => {
    const { userId, token } = await profileWithKey();
    const start = await startCall(userId, 'test');
    const callId = vapiId();
    await postWebhook(token, fillFixture(saveFixture, { CALL_ID: callId, TOOL_CALL_ID: 'tc-u' }));
    const unknown = await env.DB.prepare('SELECT id, kind, status FROM calls WHERE vapi_call_id = ?').bind(callId).first<any>();
    expect(unknown).toMatchObject({ kind: 'unknown', status: 'tool_saved' });

    const started = await api('POST', `/calls/${start.callId}/started`, { userId, body: { vapiCallId: callId } });
    expect(started.body.call).toMatchObject({ id: unknown.id, kind: 'test', status: 'tool_saved' });
    expect(await env.DB.prepare('SELECT id FROM calls WHERE id = ?').bind(start.callId).first()).toBeNull();
  });

  it('answers invalid arguments with a one-line error so the assistant can retry', async () => {
    const { userId, token } = await profileWithKey();
    const start = await startCall(userId);
    const callId = vapiId();
    await api('POST', `/calls/${start.callId}/started`, { userId, body: { vapiCallId: callId } });
    const payload = JSON.parse(fillFixture(saveFixture, { CALL_ID: callId, TOOL_CALL_ID: 'tc-bad' }));
    payload.message.toolCallList[0].function.arguments = { items: [{ name: 'rice', quantity: 0, unit: 'katori' }] };
    const res = await postWebhook(token, JSON.stringify(payload));
    expect(res.status).toBe(200);
    expect(res.body.results[0]).toEqual({
      name: 'save_foods',
      toolCallId: 'tc-bad',
      error: 'Item 1 (rice): quantity must be a positive number. Fix it and call save_foods again with the full list.',
    });
    expect(await callItems(userId)).toHaveLength(0);
    expect((await api('GET', '/calls/latest', { userId })).body.call.status).toBe('called');
  });

  it('rejects bad tokens and ignores junk and other message types with 200', async () => {
    const { token } = await profileWithKey();
    expect((await postWebhook('x'.repeat(43), '{}')).status).toBe(401);
    expect((await postWebhook('short', '{}')).status).toBe(401);
    expect(await postWebhook(token, '{not json')).toMatchObject({ status: 200, body: {} });
    expect(await postWebhook(token, JSON.stringify({ message: { type: 'status-update', call: { id: 'x' } } }))).toMatchObject({ status: 200, body: {} });
  });

  it("can't touch another user's call", async () => {
    const a = await profileWithKey();
    const b = await profileWithKey();
    const start = await startCall(a.userId);
    const callId = vapiId();
    await api('POST', `/calls/${start.callId}/started`, { userId: a.userId, body: { vapiCallId: callId } });
    const res = await postWebhook(b.token, fillFixture(saveFixture, { CALL_ID: callId, TOOL_CALL_ID: 'tc-x' }));
    expect(res.body.results[0].error).toMatch(/could not be matched/);
    expect(await callItems(a.userId)).toHaveLength(0);
    expect((await api('POST', `/calls/${start.callId}/failed`, { userId: b.userId, body: {} })).status).toBe(404);
  });
});

describe('client-reported failures and the stale sweep', () => {
  it('records SDK failures', async () => {
    const { userId } = await profileWithKey();
    const start = await startCall(userId);
    const res = await api('POST', `/calls/${start.callId}/failed`, { userId, body: { reason: 'Mic permission denied' } });
    expect(res.body.call).toMatchObject({ status: 'failed', error: 'Mic permission denied' });
  });

  it('closes calls with no webhook after 2 hours on the next read', async () => {
    const { userId } = await profileWithKey();
    const old = new Date(Date.now() - 3 * 3600_000).toISOString();
    const date = today();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO calls (user_id, local_date, kind, status, vapi_call_id, created_at, updated_at) VALUES (?1, ?2, 'scheduled', 'called', ?3, ?4, ?4)`).bind(userId, date, vapiId(), old),
      env.DB.prepare(`INSERT INTO calls (user_id, local_date, kind, status, created_at, updated_at) VALUES (?1, ?2, 'retry', 'queued', ?3, ?3)`).bind(userId, date, old),
    ]);
    const d = (await api('GET', `/days/${date}`, { userId })).body;
    expect(d.calls.map((c: any) => [c.status, c.endedReason ?? c.error])).toEqual([
      ['no_list', 'no-end-of-call-report'],
      ['failed', 'call never started'],
    ]);
  });
});

describe('no response leaks a stored key', () => {
  it('scans every endpoint except /calls/start', async () => {
    const { userId } = await profileWithKey();
    const start = await startCall(userId);
    const foodRes = await api('POST', '/foods', { userId, body: { displayName: `leak ${Date.now()}`, baseUnit: 'plate', nutrients: { calories: 1 } } });
    const foodId = foodRes.body.food.id;
    const [item] = (await api('POST', `/days/${today()}/items`, { userId, body: { items: [{ name: 'x', quantity: 1, unit: 'g' }] } })).body.items;
    const token = await webhookToken(userId);

    const responses = [
      foodRes,
      await api('GET', '/health'),
      await api('GET', '/meta'),
      await api('GET', '/profiles'),
      await api('POST', '/profiles', { body: { name: `leak ${Date.now()}` } }),
      await api('GET', '/me/settings', { userId }),
      await api('PUT', '/me/settings', { userId, body: { vapiPublicKey: KEY, callTime: '21:00' } }),
      await api('GET', '/me/goals', { userId }),
      await api('PUT', '/me/goals', { userId, body: { goals: { protein: 100 } } }),
      await api('POST', `/calls/${start.callId}/started`, { userId, body: { vapiCallId: vapiId() } }),
      await api('POST', `/calls/${start.callId}/failed`, { userId, body: {} }),
      await api('GET', '/calls/latest', { userId }),
      await api('GET', `/days/${today()}`, { userId }),
      await api('GET', `/days?from=${today()}&to=${today()}`, { userId }),
      await api('PATCH', `/items/${item.id}`, { userId, body: { quantity: 2 } }),
      await api('GET', '/uncached'),
      await api('GET', '/foods'),
      await api('GET', `/foods/${foodId}`),
      await api('PUT', `/foods/${foodId}`, { body: { nutrients: { protein: 1 } } }),
      await api('POST', `/foods/${foodId}/aliases`, { body: { alias: `leak alias ${Date.now()}` } }),
      await api('PUT', `/foods/${foodId}/units/katori`, { body: { servings: 1 } }),
      await postWebhook(token, JSON.stringify({ message: { type: 'end-of-call-report', call: { id: vapiId() } } })),
      await api('DELETE', `/items/${item.id}`, { userId }),
      await api('GET', '/me/settings', { userId: 'nope' }),
    ];
    for (const r of responses) {
      expect(r.status).toBeLessThan(500);
      expect(r.text).not.toContain(KEY);
      expect(r.text).not.toContain(token);
    }
  });
});
