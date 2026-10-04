import { describe, expect, it } from 'vitest';
import { api, createProfile, unique } from '../helpers';

describe('auth and routing', () => {
  it('/health needs no token', async () => {
    const res = await api('GET', '/health', { token: null });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('rejects a missing or wrong app token', async () => {
    expect((await api('GET', '/meta', { token: null })).status).toBe(401);
    expect((await api('GET', '/meta', { token: 'wrong' })).status).toBe(401);
    expect((await api('GET', '/meta', { token: 'test-app-token-and-more' })).status).toBe(401);
    expect((await api('GET', '/meta')).status).toBe(200);
  });

  it('requires an existing X-User-Id on user routes', async () => {
    expect((await api('GET', '/me/settings')).body.error.code).toBe('user_required');
    const res = await api('GET', '/me/settings', { userId: 'nope' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('unknown_user');
  });

  it('404s unknown routes and 405s wrong methods', async () => {
    expect((await api('GET', '/nope')).status).toBe(404);
    expect((await api('DELETE', '/meta')).status).toBe(405);
  });

  it('rejects malformed JSON', async () => {
    const res = await api('POST', '/profiles', { raw: '{oops' });
    expect(res.status).toBe(400);
  });
});

describe('/meta', () => {
  it('serves units, base units, meals and the nutrient catalog', async () => {
    const { body } = await api('GET', '/meta');
    expect(body.units).toContain('katori');
    expect(body.baseUnits).toContain('100 g');
    expect(body.meals).toEqual(['breakfast', 'lunch', 'snack', 'dinner']);
    expect(body.nutrients).toHaveLength(17);
    expect(body.nutrients[0]).toEqual({ key: 'calories', label: 'Calories', unit: 'kcal', defaultGoal: 2500 });
  });
});

describe('profiles', () => {
  it('creates, lists and rejects duplicate names case-insensitively', async () => {
    const name = unique('Asha');
    const created = await api('POST', '/profiles', { body: { name } });
    expect(created.status).toBe(201);
    expect(created.body.profile).toEqual({ id: expect.any(String), name });
    const dup = await api('POST', '/profiles', { body: { name: name.toUpperCase() } });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('name_taken');
    const list = await api('GET', '/profiles');
    expect(list.body.profiles).toContainEqual({ id: created.body.profile.id, name });
    expect(Object.keys(list.body.profiles[0]).sort()).toEqual(['id', 'name']);
  });

  it('validates name and timezone', async () => {
    expect((await api('POST', '/profiles', { body: { name: '' } })).status).toBe(400);
    expect((await api('POST', '/profiles', { body: { name: unique('X'), timezone: 'Mars/Base' } })).status).toBe(400);
  });
});

describe('settings and goals', () => {
  it('has defaults and partial updates; the Vapi key is write-only', async () => {
    const userId = await createProfile();
    const initial = await api('GET', '/me/settings', { userId });
    expect(initial.body).toMatchObject({ timezone: 'Asia/Kolkata', callTime: null, callEnabled: true, vapi: { configured: false }, lastCall: null });

    const updated = await api('PUT', '/me/settings', {
      userId,
      body: { callTime: '20:30', callEnabled: false, timezone: 'Europe/London', vapiPublicKey: 'pk-0123456789abcdef' },
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ callTime: '20:30', callEnabled: false, timezone: 'Europe/London', vapi: { configured: true } });
    expect(updated.text).not.toContain('pk-0123456789abcdef');

    const cleared = await api('PUT', '/me/settings', { userId, body: { vapiPublicKey: null } });
    expect(cleared.body.vapi.configured).toBe(false);
  });

  it('validates settings', async () => {
    const userId = await createProfile();
    for (const body of [{ callTime: '25:00' }, { timezone: 'Nowhere' }, { callEnabled: 'yes' }, { vapiPublicKey: 'has spaces in it' }]) {
      expect((await api('PUT', '/me/settings', { userId, body })).status).toBe(400);
    }
  });

  it('stores custom goals and resets them with null', async () => {
    const userId = await createProfile();
    const set = await api('PUT', '/me/goals', { userId, body: { goals: { protein: 120, iron: 18 } } });
    const byKey = Object.fromEntries(set.body.goals.map((g: any) => [g.key, g]));
    expect(byKey.protein).toMatchObject({ target: 120, custom: true, defaultGoal: 180 });
    expect(byKey.iron).toMatchObject({ target: 18, custom: true, defaultGoal: null });
    expect(byKey.calories).toMatchObject({ target: 2500, custom: false });

    const reset = await api('PUT', '/me/goals', { userId, body: { goals: { protein: null } } });
    expect(reset.body.goals.find((g: any) => g.key === 'protein')).toMatchObject({ target: 180, custom: false });
    expect((await api('PUT', '/me/goals', { userId, body: { goals: { vitaminZ: 1 } } })).status).toBe(400);
    expect((await api('PUT', '/me/goals', { userId, body: { goals: { protein: -1 } } })).status).toBe(400);
  });
});
