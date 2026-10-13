/**
 * Retention and hardening (WEEKLY_BREAKDOWN_PLAN.md 8.3.2, 8.3.3, Phase 6): transcripts are emptied after 30 days, and the deployment can
 * require the profile secret on every profile route.
 */
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { randomToken, sha256Hex } from '../../src/auth';
import worker from '../../src/index';
import { TRANSCRIPT_RETENTION_DAYS, purgeOldTranscripts, transcriptExpired } from '../../src/maintenance';
import { APP_TOKEN, BASE, api, createProfileWithSecret, postWebhook, webhookToken } from '../helpers';

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

async function call(userId: string, over: { createdAt: string; transcript: string | null; status?: string }) {
  const res = await env.DB
    .prepare(
      `INSERT INTO calls (user_id, local_date, kind, status, ended_reason, transcript, duration_seconds, created_at, updated_at)
       VALUES (?1, '2026-09-01', 'scheduled', ?2, 'customer-ended-call', ?3, 42, ?4, ?4) RETURNING id`,
    )
    .bind(userId, over.status ?? 'no_list', over.transcript, over.createdAt)
    .first<{ id: number }>();
  return res!.id;
}
const transcriptOf = (id: number) => env.DB.prepare('SELECT transcript FROM calls WHERE id = ?').bind(id).first<{ transcript: string | null }>().then((r) => r!.transcript);

describe('transcripts are kept for 30 days (plan 8.3.3)', () => {
  it('says when one has expired', () => {
    expect(TRANSCRIPT_RETENTION_DAYS).toBe(30);
    expect(transcriptExpired(daysAgo(31))).toBe(true);
    expect(transcriptExpired(daysAgo(29))).toBe(false);
  });

  it('empties the old ones for everyone and leaves recent ones and the call rows alone', async () => {
    const a = await createProfileWithSecret();
    const b = await createProfileWithSecret();
    const oldA = await call(a.userId, { createdAt: daysAgo(45), transcript: 'old words of a' });
    const freshA = await call(a.userId, { createdAt: daysAgo(3), transcript: 'recent words of a' });
    const oldB = await call(b.userId, { createdAt: daysAgo(31), transcript: 'old words of b' });
    const none = await call(b.userId, { createdAt: daysAgo(60), transcript: null });
    const emptied = await purgeOldTranscripts(env.DB);
    expect(emptied).toBeGreaterThanOrEqual(2);
    expect([await transcriptOf(oldA), await transcriptOf(oldB), await transcriptOf(none)]).toEqual([null, null, null]);
    expect(await transcriptOf(freshA)).toBe('recent words of a');
    // the call itself is still there, with what the person sees later
    const row = await env.DB.prepare('SELECT status, ended_reason, duration_seconds FROM calls WHERE id = ?').bind(oldA).first();
    expect(row).toEqual({ status: 'no_list', ended_reason: 'customer-ended-call', duration_seconds: 42 });
    expect(await purgeOldTranscripts(env.DB)).toBe(0); // nothing left to do
  });

  it('is run by the daily schedule', async () => {
    const p = await createProfileWithSecret();
    const id = await call(p.userId, { createdAt: daysAgo(50), transcript: 'to go' });
    const ctx = createExecutionContext();
    await worker.scheduled!({ cron: '17 3 * * *', scheduledTime: Date.now(), type: 'scheduled', noRetry() {} } as ScheduledController, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(await transcriptOf(id)).toBeNull();
  });

  it('is never served once expired, even before the schedule has run', async () => {
    const p = await createProfileWithSecret();
    await call(p.userId, { createdAt: daysAgo(40), transcript: 'too old to show', status: 'no_list' });
    const old = await api('GET', '/days/2026-09-01', { userId: p.userId });
    expect(old.body.calls[0]).toMatchObject({ status: 'no_list', transcript: null });
    expect(old.text).not.toContain('too old to show');
    const q = await createProfileWithSecret();
    await call(q.userId, { createdAt: daysAgo(2), transcript: 'recent enough', status: 'no_list' });
    expect((await api('GET', '/days/2026-09-01', { userId: q.userId })).body.calls[0].transcript).toBe('recent enough');
  });

  it('is written fresh by the webhook and kept until it expires', async () => {
    const p = await createProfileWithSecret();
    const id = await call(p.userId, { createdAt: new Date().toISOString(), transcript: null, status: 'called' });
    const token = await webhookToken(p.userId);
    const res = await postWebhook(token, JSON.stringify({ message: { type: 'end-of-call-report', call: { id: 'call_x', metadata: { userId: p.userId, callRowId: id } }, endedReason: 'customer-ended-call', durationSeconds: 5, artifact: { transcript: 'AI: hello' } } }));
    expect(res.status).toBe(200);
    await purgeOldTranscripts(env.DB);
    expect(await transcriptOf(id)).toBe('AI: hello');
  });
});

describe('REQUIRE_SECRET: the secret on every profile route (plan 8.3.2)', () => {
  const fetchWith = (flag: string, path: string, opts: { userId: string; secret?: string; method?: string; body?: unknown }) => {
    const headers: Record<string, string> = { authorization: `Bearer ${APP_TOKEN}`, 'x-user-id': opts.userId };
    if (opts.secret) headers['x-profile-secret'] = opts.secret;
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    const req = new Request(`${BASE}${path}`, { method: opts.method ?? 'GET', headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
    return worker.fetch!(req as never, { ...env, REQUIRE_SECRET: flag } as unknown as Env);
  };
  const code = async (res: Response) => (await res.json<any>()).error?.code;

  it('is off by default: the shared token and a profile id still read the day', async () => {
    const p = await createProfileWithSecret();
    expect((await fetchWith('', '/me/settings', { userId: p.userId })).status).toBe(200);
  });

  it('when on, a profile with a secret needs it on a route that never needed it before', async () => {
    const p = await createProfileWithSecret();
    const none = await fetchWith('1', '/me/settings', { userId: p.userId });
    expect([none.status, await code(none)]).toEqual([403, 'profile_secret_required']);
    const wrong = await fetchWith('1', '/days/2026-10-05', { userId: p.userId, secret: 'x'.repeat(43) });
    expect([wrong.status, await code(wrong)]).toEqual([403, 'profile_secret_invalid']);
    expect((await fetchWith('1', '/me/settings', { userId: p.userId, secret: p.secret })).status).toBe(200);
    expect((await fetchWith('1', '/days/2026-10-05', { userId: p.userId, secret: p.secret })).status).toBe(200);
    expect((await fetchWith('1', '/foods/gaps', { userId: p.userId })).status).toBe(403);
    expect((await fetchWith('1', '/calls/latest', { userId: p.userId })).status).toBe(403);
  });

  it('locks a profile that has no secret yet instead of leaving it open, and closes the claim: the owner issues a code (security review)', async () => {
    const p = await createProfileWithSecret();
    await env.DB.prepare('UPDATE users SET secret_hash = NULL WHERE id = ?').bind(p.userId).run();
    const open = await fetchWith('1', '/me/settings', { userId: p.userId });
    expect([open.status, await code(open)]).toEqual([403, 'profile_secret_required']);
    // Anyone holding the shared token could claim it first, so the claim needs the secret it would create.
    expect((await fetchWith('1', '/me/secret', { userId: p.userId, method: 'POST' })).status).toBe(403);
    expect((await env.DB.prepare('SELECT secret_hash FROM users WHERE id = ?').bind(p.userId).first<{ secret_hash: string | null }>())!.secret_hash).toBeNull();
    // docs/BREACH_RUNBOOK.md: the owner of the deployment stores the hash of a fresh code and gives the person the code.
    const issued = randomToken();
    await env.DB.prepare('UPDATE users SET secret_hash = ? WHERE id = ?').bind(await sha256Hex(issued), p.userId).run();
    expect((await fetchWith('1', '/me/settings', { userId: p.userId, secret: issued })).status).toBe(200);
  });

  it('answers the same for a profile with no secret and one with a different secret, so polling cannot find a reset profile', async () => {
    const withSecret = await createProfileWithSecret();
    const without = await createProfileWithSecret();
    await env.DB.prepare('UPDATE users SET secret_hash = NULL WHERE id = ?').bind(without.userId).run();
    const guess = 'g'.repeat(43);
    for (const flag of ['', '1']) {
      const a = await fetchWith(flag, '/me/profile', { userId: withSecret.userId, secret: guess });
      const b = await fetchWith(flag, '/me/profile', { userId: without.userId, secret: guess });
      expect([a.status, await code(a)]).toEqual([403, 'profile_secret_invalid']);
      expect([b.status, await code(b)]).toEqual([403, 'profile_secret_invalid']);
    }
  });

  it('leaves the shared routes and the voice webhook as they are', async () => {
    const p = await createProfileWithSecret();
    const asApp = (path: string) => worker.fetch!(new Request(`${BASE}${path}`, { headers: { authorization: `Bearer ${APP_TOKEN}` } }) as never, { ...env, REQUIRE_SECRET: '1' } as unknown as Env);
    expect((await asApp('/profiles')).status).toBe(200);
    expect((await asApp('/meta')).status).toBe(200);
    expect((await asApp('/foods')).status).toBe(200);
    const token = await webhookToken(p.userId);
    const res = await worker.fetch!(
      new Request(`${BASE}/vapi/webhook/${token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: { type: 'status-update', call: { id: 'c', metadata: { userId: p.userId } }, status: 'in-progress' } }) }) as never,
      { ...env, REQUIRE_SECRET: '1' } as unknown as Env,
    );
    expect(res.status).toBeLessThan(500);
    expect(res.status).not.toBe(403);
  });
});
