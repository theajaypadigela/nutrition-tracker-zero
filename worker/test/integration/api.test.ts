import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { api, createProfile, createProfileWithSecret, unique } from '../helpers';

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
    expect(body.nutrients).toHaveLength(21);
    expect(body.nutrients[0]).toEqual({ key: 'calories', label: 'Calories', unit: 'kcal', kind: 'energy', window: 'week', group: 'energy_and_macros', defaultGoal: 2000 });
    expect(body.engineVersion).toBe('1.1.0'); // 1.1.0: a calorie target's range is centred on the target, never under the floor
    expect(body.referenceSets).toEqual([
      { id: 'nasem', label: 'US and Canada (National Academies)', available: true },
      { id: 'icmr_nin', label: 'India (ICMR-NIN)', available: true },
    ]);
  });

  it('says what each nutrient\'s target means, so no screen has to guess from a name', async () => {
    const { body } = await api('GET', '/meta');
    const kind = Object.fromEntries(body.nutrients.map((n: any) => [n.key, n.kind]));
    expect(kind).toMatchObject({
      calories: 'energy',
      protein: 'minimum',
      fiber: 'minimum',
      sodium: 'limit',
      fat: 'range',
      carbs: 'range',
      sugar: 'amount',
      calcium: 'minimum',
    });
    // The vitamins that vary too much day to day are judged over four weeks, not one.
    const window = Object.fromEntries(body.nutrients.map((n: any) => [n.key, n.window]));
    expect(window).toMatchObject({ vitaminA: 'four_weeks', vitaminC: 'four_weeks', vitaminD: 'four_weeks', vitaminE: 'four_weeks', vitaminK: 'four_weeks', iron: 'week', protein: 'week' });
  });

  it('serves a generic reference, not the old fixed 2,500 kcal / 180 g protein diet', async () => {
    const { body } = await api('GET', '/meta');
    const ref = Object.fromEntries(body.nutrients.map((n: any) => [n.key, n.defaultGoal]));
    expect(ref).toMatchObject({ calories: 2000, protein: 50, carbs: 275, fat: 78, fiber: 28, sodium: 2300, calcium: 1000, iron: 13, potassium: 3000, magnesium: 370, zinc: 9.5, vitaminA: 800, vitaminC: 82.5, vitaminD: 15, vitaminE: 15, vitaminK: 105 });
    // No authority limits total sugars, so there is no number to compare it with.
    expect(ref.sugar).toBeNull();
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
    const { userId, secret } = await createProfileWithSecret();
    const set = await api('PUT', '/me/goals', { userId, secret, body: { goals: { protein: 120, iron: 18 } } });
    const byKey = Object.fromEntries(set.body.goals.map((g: any) => [g.key, g]));
    expect(byKey.protein).toMatchObject({ target: 120, custom: true, defaultGoal: 50 });
    expect(byKey.iron).toMatchObject({ target: 18, custom: true, defaultGoal: 13 });
    expect(byKey.calories).toMatchObject({ target: 2000, custom: false });

    const reset = await api('PUT', '/me/goals', { userId, secret, body: { goals: { protein: null } } });
    expect(reset.body.goals.find((g: any) => g.key === 'protein')).toMatchObject({ target: 50, custom: false });
    expect((await api('PUT', '/me/goals', { userId, secret, body: { goals: { vitaminZ: 1 } } })).status).toBe(400);
    expect((await api('PUT', '/me/goals', { userId, secret, body: { goals: { protein: -1 } } })).status).toBe(400);
  });

  it('refuses a calorie goal under 800 kcal and above 6,000, and says why', async () => {
    const { userId, secret } = await createProfileWithSecret();
    const low = await api('PUT', '/me/goals', { userId, secret, body: { goals: { calories: 799 } } });
    expect(low.status).toBe(400);
    expect(low.body.error.message).toMatch(/doctor or dietitian/);
    expect(low.body.error.field).toBe('calories');
    expect((await api('PUT', '/me/goals', { userId, secret, body: { goals: { calories: 6001 } } })).status).toBe(400);
    expect((await api('PUT', '/me/goals', { userId, secret, body: { goals: { calories: 800 } } })).status).toBe(200);
    // A refused value is never partly saved.
    const refused = await api('PUT', '/me/goals', { userId, secret, body: { goals: { protein: 90, calories: 300 } } });
    expect(refused.status).toBe(400);
    const goals = await api('GET', '/me/goals', { userId });
    expect(goals.body.goals.find((g: any) => g.key === 'protein')).toMatchObject({ custom: false });
  });

  it('warns, without refusing, between 800 and 1,200 kcal', async () => {
    const { userId, secret } = await createProfileWithSecret();
    const set = await api('PUT', '/me/goals', { userId, secret, body: { goals: { calories: 1000 } } });
    expect(set.status).toBe(200);
    expect(set.body.warnings).toEqual([{ nutrient: 'calories', id: 'below_floor', floor: 1200 }]);
    expect((await api('GET', '/me/goals', { userId })).body.warnings).toHaveLength(1);
    const fine = await api('PUT', '/me/goals', { userId, secret, body: { goals: { calories: 1800 } } });
    expect(fine.body.warnings).toEqual([]);
  });

  it('tells the days endpoints which goals the person typed', async () => {
    const { userId, secret } = await createProfileWithSecret();
    await api('PUT', '/me/goals', { userId, secret, body: { goals: { protein: 90 } } });
    const day = await api('GET', '/days/2026-10-05', { userId });
    expect(day.body.customGoals).toEqual(['protein']);
    expect(day.body.goals.protein).toBe(90);
    expect(day.body.goals.calories).toBe(2000);
    const range = await api('GET', '/days?from=2026-10-05&to=2026-10-11', { userId });
    expect(range.body.customGoals).toEqual(['protein']);
  });

  it('changes the goals of a profile with a secret only with it; a profile from before secrets still can (security review)', async () => {
    const { userId, secret } = await createProfileWithSecret();
    const locked = await api('PUT', '/me/goals', { userId, body: { goals: { calories: 900 } } });
    expect(locked.status).toBe(403);
    expect(locked.body.error.code).toBe('profile_secret_required');
    expect((await api('PUT', '/me/goals', { userId, secret, body: { goals: { calories: 1900 } } })).status).toBe(200);
    // A profile made before secrets existed (no hash) types its own numbers as in Phase 0.
    const legacy = await createProfile();
    await env.DB.prepare('UPDATE users SET secret_hash = NULL WHERE id = ?').bind(legacy).run();
    expect((await api('PUT', '/me/goals', { userId: legacy, body: { goals: { protein: 70 } } })).status).toBe(200);
  });
});
