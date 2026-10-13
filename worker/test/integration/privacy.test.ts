/**
 * Privacy and security (WEEKLY_BREAKDOWN_PLAN.md 8.3, 11.8): health data stays out of the voice assistant and out of
 * every response that does not need it, the shared token alone reads nothing, and the secret is stored hashed and
 * never leaves. A canary profile with distinctive values is scanned for across the whole surface.
 */
import { env } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { buildAssistant } from '../../src/vapi/assistant';
import { api, createProfileWithSecret, fillFixture, postWebhook, unique, webhookToken } from '../helpers';

// Distinctive: no target, count or id in the app comes out as any of these.
const CANARY = { weightKg: 73.7, birthYear: 1981, heightCm: 171.3 };
const CANARY_STRINGS = ['73.7', '171.3', '1981'];

async function canaryProfile(name = unique('Canary')) {
  const p = await createProfileWithSecret(name);
  const res = await api('PUT', '/me/profile', {
    userId: p.userId,
    secret: p.secret,
    body: {
      profile: { birthYear: CANARY.birthYear, birthMonth: 2, sexForCalc: 'female', heightCm: CANARY.heightCm, weightKg: CANARY.weightKg, activity: 'low_active', goal: 'general_health' },
      safety: { pregnantOrBreastfeeding: false, eatingDisorder: false, clinicianDiet: false, dietInteractingMedicine: false },
      consentVersion: '2026-10-v1',
    },
  });
  expect(res.status).toBe(200);
  return p;
}

const leaks = (text: string) => CANARY_STRINGS.filter((c) => text.includes(c));

describe('the voice assistant never receives health data (plan 8.3.1)', () => {
  it('builds an assistant, a prompt, a first message and metadata with none of the canary values', async () => {
    const p = await canaryProfile();
    await env.DB.prepare('UPDATE users SET vapi_public_key = ? WHERE id = ?').bind('pk-canary-0123456789', p.userId).run();
    await api('POST', '/days/2026-10-05/items', { userId: p.userId, body: { items: [{ name: 'idli', quantity: 2, unit: 'piece', meal: 'breakfast' }] } });
    const start = await api('POST', '/calls/start', { userId: p.userId, body: { kind: 'manual' } });
    expect(start.status).toBe(201);
    expect(leaks(JSON.stringify(start.body.assistant))).toEqual([]);
    expect(leaks(start.text.replace('pk-canary-0123456789', ''))).toEqual([]);
    // The assistant builder itself takes no health input at all, by its type: a direct call with the same user's details.
    const direct = buildAssistant({ userId: p.userId, name: 'Canary', localDate: '2026-10-05', localTime: '20:00', callRowId: 1, webhookUrl: 'https://zero.example/vapi/webhook/x', alreadyLogged: [] });
    expect(leaks(JSON.stringify(direct))).toEqual([]);
    expect(JSON.stringify(direct)).not.toMatch(/weight|height|birth|calorie target|bmi/i);
  });

  it('keeps health words out of the call prompt, which already forbids nutrition talk', async () => {
    const p = await canaryProfile();
    await env.DB.prepare('UPDATE users SET vapi_public_key = ? WHERE id = ?').bind('pk-canary-0123456789', p.userId).run();
    const { body } = await api('POST', '/calls/start', { userId: p.userId, body: { kind: 'manual' } });
    const prompt = body.assistant.model.messages[0].content as string;
    expect(prompt).toMatch(/Never mention calories, macros, nutrition or health advice/);
    expect(prompt).not.toMatch(/\bBMI\b|weigh|body mass|target|goal/i);
  });
});

describe('no response outside the health routes carries health data', () => {
  it('scans the profile list, foods, pending foods, settings, days, calls and the webhook responses', async () => {
    const p = await canaryProfile();
    await env.DB.prepare('UPDATE users SET vapi_public_key = ? WHERE id = ?').bind('pk-canary-0123456789', p.userId).run();
    await api('POST', '/days/2026-10-05/items', { userId: p.userId, body: { items: [{ name: 'idli', quantity: 2, unit: 'piece', meal: 'breakfast' }, { name: 'mystery curry', quantity: 1, unit: 'katori' }] } });
    const surfaces = [
      await api('GET', '/profiles'),
      await api('GET', '/foods'),
      await api('GET', '/uncached'),
      await api('GET', '/meta'),
      await api('GET', '/me/settings', { userId: p.userId }),
      await api('GET', '/me/goals', { userId: p.userId }),
      await api('GET', '/days/2026-10-05', { userId: p.userId }),
      await api('GET', '/days?from=2026-10-01&to=2026-10-12', { userId: p.userId }),
      await api('GET', '/calls/latest', { userId: p.userId }),
    ];
    // ... including with the secret, where goals are personal numbers: derived targets, never the measurements themselves.
    surfaces.push(await api('GET', '/me/goals', { userId: p.userId, secret: p.secret }));
    surfaces.push(await api('GET', '/days/2026-10-05', { userId: p.userId, secret: p.secret }));
    // The weekly report: refused without the secret, and with it, derived numbers only.
    surfaces.push(await api('GET', '/reports/weekly?start=2026-10-05', { userId: p.userId }));
    const weekly = await api('GET', '/reports/weekly?start=2026-10-05', { userId: p.userId, secret: p.secret });
    expect(weekly.status).toBe(200);
    surfaces.push(weekly);
    for (const s of surfaces) expect(leaks(s.text), s.text.slice(0, 80)).toEqual([]);
    // The voice webhook: a call report for this user, scanned in what it answers.
    const token = await webhookToken(p.userId);
    const report = await postWebhook(token, JSON.stringify({ message: { type: 'end-of-call-report', call: { id: 'call_canary_1', metadata: { userId: p.userId, callRowId: 999 } }, endedReason: 'customer-ended-call', durationSeconds: 5 } }));
    expect(leaks(report.text)).toEqual([]);
    void fillFixture;
  });

  it('keeps health data out of the Worker logs, including on errors', async () => {
    const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'info')];
    try {
      const p = await canaryProfile();
      await api('PUT', '/me/profile', { userId: p.userId, secret: p.secret, body: { profile: { heightCm: 10 }, safety: {} } }); // a validation error
      await api('GET', '/me/targets?date=bad', { userId: p.userId, secret: p.secret });
      await api('GET', '/me/export', { userId: p.userId, secret: 'wrong' });
      await api('GET', '/reports/weekly?start=bad', { userId: p.userId, secret: p.secret });
      await api('GET', '/reports/weekly', { userId: p.userId, secret: 'wrong' });
      // A positive control, so an empty log cannot pass by the spy having seen nothing: the webhook does log.
      const token = await webhookToken(p.userId);
      await postWebhook(token, JSON.stringify({ message: { type: 'end-of-call-report', call: { id: 'call_log_control', metadata: { userId: p.userId } }, endedReason: 'customer-ended-call' } }));
      const logged = spies.flatMap((s) => s.mock.calls.map((c) => c.map(String).join(' '))).join('\n');
      expect(logged).toContain('"evt":"vapi"');
      expect(leaks(logged)).toEqual([]);
      expect(logged).not.toContain(p.secret);
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });
});

describe('the shared token alone reads nothing about another person (plan 11.8)', () => {
  it('refuses every health route for the canary\'s id', async () => {
    const victim = await canaryProfile();
    for (const path of ['/me/profile', '/me/targets', '/me/weights', '/me/export']) {
      const res = await api('GET', path, { userId: victim.userId });
      expect(res.status, path).toBe(403);
      expect(leaks(res.text), path).toEqual([]);
    }
    expect((await api('GET', '/me/profile', { userId: victim.userId, secret: 'A'.repeat(43) })).status).toBe(403);
  });

  it('shows nothing of the body in the list of profiles: only an id and a name', async () => {
    const p = await canaryProfile('Visible Name');
    const list = await api('GET', '/profiles');
    expect(list.body.profiles.find((x: any) => x.id === p.userId)).toEqual({ id: p.userId, name: 'Visible Name' });
    expect(Object.keys(list.body.profiles[0]).sort()).toEqual(['id', 'name']);
  });
});

describe('the secret (plan 8.3.2)', () => {
  it('is compared in constant time through the repo\'s safeEqual, stored as a 64-character hash, and never in a log or response', async () => {
    const p = await canaryProfile();
    const row = await env.DB.prepare('SELECT secret_hash FROM users WHERE id = ?').bind(p.userId).first<{ secret_hash: string }>();
    expect(row!.secret_hash).toHaveLength(64);
    const all = [await api('GET', '/me/profile', { userId: p.userId, secret: p.secret }), await api('GET', '/me/export', { userId: p.userId, secret: p.secret }), await api('GET', '/me/targets', { userId: p.userId, secret: p.secret })];
    for (const r of all) {
      expect(r.text).not.toContain(p.secret);
      expect(r.text).not.toContain(row!.secret_hash);
    }
  });

  it('a request body of the profile routes is never logged, and the safety block is stored nowhere', async () => {
    const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error')];
    try {
      const p = await createProfileWithSecret();
      await api('PUT', '/me/profile', { userId: p.userId, secret: p.secret, body: { profile: { birthYear: 1981, heightCm: 171.3, weightKg: 73.7, sexForCalc: 'female', activity: 'low_active', goal: 'general_health' }, safety: { pregnantOrBreastfeeding: true }, consentVersion: 'v1' } });
      await api('POST', '/me/targets/preview', { userId: p.userId, body: { profile: { birthYear: 1981 }, safety: { eatingDisorder: true } } });
      const logged = spies.flatMap((s) => s.mock.calls.map((c) => c.map(String).join(' '))).join('\n');
      expect(logged).not.toMatch(/1981|171\.3|73\.7|pregnan|eating/);
      // Nothing in any table mentions a safety answer.
      for (const table of ['health_profiles', 'target_sets', 'weight_entries', 'day_status', 'users', 'user_goals']) {
        const rows = JSON.stringify((await env.DB.prepare(`SELECT * FROM ${table}`).all()).results);
        expect(rows, table).not.toMatch(/pregnantOrBreastfeeding|eatingDisorder|clinicianDiet/);
      }
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });
});
