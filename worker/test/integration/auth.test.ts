/**
 * Accounts: register with a username and password, log in with them. The password is stored only as a PBKDF2 hash and never leaves; one
 * answer covers every way to log in wrongly.
 */
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { hashPassword, PASSWORD_ITERATIONS, verifyPassword } from '../../src/auth';
import worker from '../../src/index';
import { api, unique } from '../helpers';

const PASSWORD = 'correct horse battery';

const register = (username: string, password: unknown = PASSWORD, extra: Record<string, unknown> = {}) =>
  api('POST', '/auth/register', { body: { username, password, ...extra } });
const login = (username: unknown, password: unknown) => api('POST', '/auth/login', { body: { username, password } });

describe('password hashes', () => {
  it('verify the password they were made from, and nothing else', async () => {
    const stored = await hashPassword(PASSWORD);
    expect(await verifyPassword(PASSWORD, stored)).toBe(true);
    expect(await verifyPassword(`${PASSWORD} `, stored)).toBe(false);
    expect(await verifyPassword('', stored)).toBe(false);
  });

  it('keep the iteration count and a fresh salt inside, so equal passwords differ and the count can change later', async () => {
    const [a, b] = [await hashPassword(PASSWORD), await hashPassword(PASSWORD)];
    expect(a).not.toBe(b);
    expect(a).toMatch(new RegExp(`^pbkdf2-sha256\\$${PASSWORD_ITERATIONS}\\$[A-Za-z0-9_-]{22}\\$[A-Za-z0-9_-]{43}$`));
    const older = await hashPassword(PASSWORD, 1_000);
    expect(older.split('$')[1]).toBe('1000');
    expect(await verifyPassword(PASSWORD, older)).toBe(true);
  });

  it('read anything that is not one of their own as a wrong password, without throwing', async () => {
    for (const junk of ['', 'plain', 'sha256$1$aa$bb', 'pbkdf2-sha256$x$aa$bb', 'pbkdf2-sha256$0$aa$bb', 'pbkdf2-sha256$1000$$bb', 'pbkdf2-sha256$1000$aa$bb$cc', 'pbkdf2-sha256$1000$***$bb']) {
      expect(await verifyPassword(PASSWORD, junk), junk).toBe(false);
    }
  });

  it('handle a password that is not ASCII', async () => {
    const stored = await hashPassword('पासवर्ड 🍛 pässwörd');
    expect(await verifyPassword('पासवर्ड 🍛 pässwörd', stored)).toBe(true);
    expect(await verifyPassword('पासवर्ड', stored)).toBe(false);
  });
});

describe('POST /auth/register', () => {
  it('creates the profile and answers like POST /profiles: the profile and its one-time secret', async () => {
    const name = unique('Asha');
    const res = await register(name);
    expect(res.status).toBe(201);
    expect(res.body.profile).toEqual({ id: expect.any(String), name });
    expect(res.body.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // The new profile works at once: its own settings load with the id and secret it was given.
    const settings = await api('GET', '/me/settings', { userId: res.body.profile.id, secret: res.body.secret });
    expect(settings.status).toBe(200);
    expect(settings.body.name).toBe(name);
  });

  it('stores only a hash of the password, and never returns it', async () => {
    const res = await register(unique('Hash'), 'a password nobody else uses');
    const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(res.body.profile.id).first<{ password_hash: string }>();
    expect(row!.password_hash).toMatch(/^pbkdf2-sha256\$\d+\$/);
    expect(row!.password_hash).not.toContain('nobody else');
    for (const r of [res, await login(res.body.profile.name, 'a password nobody else uses'), await api('GET', '/profiles')]) {
      expect(r.text).not.toContain('nobody else');
      expect(r.text).not.toMatch(/password_hash|pbkdf2/);
    }
  });

  it('takes the optional timezone and call time like a profile does', async () => {
    const res = await register(unique('Zone'), PASSWORD, { timezone: 'Asia/Tokyo', callTime: '20:30' });
    expect(res.status).toBe(201);
    const settings = await api('GET', '/me/settings', { userId: res.body.profile.id, secret: res.body.secret });
    expect(settings.body).toMatchObject({ timezone: 'Asia/Tokyo', callTime: '20:30' });
    expect((await register(unique('Zone'), PASSWORD, { timezone: 'Nowhere/Land' })).status).toBe(400);
  });

  it('refuses a username that is taken, whatever its case, and a name a profile already has', async () => {
    const name = unique('Taken');
    expect((await register(name)).status).toBe(201);
    for (const again of [name, name.toUpperCase(), `  ${name}  `]) {
      const res = await register(again);
      expect(res.status, again).toBe(409);
      expect(res.body.error.code).toBe('name_taken');
    }
    const profile = unique('Profile');
    await api('POST', '/profiles', { body: { name: profile } });
    expect((await register(profile)).body.error.code).toBe('name_taken');
  });

  it('refuses a password that is missing, too short or too long, and says nothing of it back', async () => {
    for (const bad of [null, 12345678, '', 'short', 'x'.repeat(7), 'x'.repeat(129)]) {
      const res = await register(unique('Pw'), bad);
      expect(res.status, String(bad)).toBe(400);
      expect(res.body.error.message).toBe('password must be 8-128 characters');
    }
    // No password key at all (the helper's default would fill in an undefined one).
    const missing = await api('POST', '/auth/register', { body: { username: unique('Pw') } });
    expect(missing.status).toBe(400);
    expect(missing.body.error.message).toBe('password must be 8-128 characters');
    expect((await register(unique('Pw'), 'x'.repeat(8))).status).toBe(201);
    expect((await register(unique('Pw'), 'x'.repeat(128))).status).toBe(201);
  });

  it('keeps spaces in a password: they are part of it', async () => {
    const name = unique('Space');
    expect((await register(name, '        ')).status).toBe(201);
    expect((await login(name, '        ')).status).toBe(200);
    expect((await login(name, '')).status).toBe(400);
  });

  it('refuses a username that is missing, empty or too long', async () => {
    for (const bad of [undefined, '', '   ', 'x'.repeat(41), 7]) expect((await register(bad as string)).status, String(bad)).toBe(400);
  });

  it('needs the app token', async () => {
    const res = await api('POST', '/auth/register', { token: null, body: { username: unique('NoToken'), password: PASSWORD } });
    expect(res.status).toBe(401);
  });
});

describe('POST /auth/login', () => {
  it('restores all personal settings and calculated targets on a fresh login, including reports and hardened routes', async () => {
    const name = unique('Targets');
    const created = await register(name);
    const userId = created.body.profile.id;
    const profile = { birthYear: 1990, birthMonth: 3, sexForCalc: 'female', heightCm: 180, weightKg: 89, activity: 'inactive', goal: 'maintain', pace: 'gentle', pattern: 'vegan', referenceSet: 'nasem', numbersHidden: false };
    const safety = { pregnantOrBreastfeeding: false, eatingDisorder: false, clinicianDiet: false, dietInteractingMedicine: true };
    const saved = await api('PUT', '/me/profile', { userId, secret: created.body.secret, body: { profile, safety, consentVersion: '2026-10-v3' } });
    expect(saved.status).toBe(200);
    expect(saved.body.targetSet.targets.find((t: any) => t.nutrient === 'protein').value).toBe(89);
    const loggedIn = await login(name, PASSWORD);
    const opts = { userId, secret: loggedIn.body.secret };
    expect((await api('GET', '/me/profile', opts)).body.profile).toMatchObject({ ...profile, dietInteractingMedicine: true });
    expect((await api('GET', '/me/goals', opts)).body.goals.find((g: any) => g.key === 'protein')).toMatchObject({ target: 89, recommended: 89 });
    expect((await api('GET', '/days/2026-10-14', opts)).body.goals.protein).toBe(89);
    expect((await api('GET', '/me/targets', opts)).body.targets.find((t: any) => t.nutrient === 'protein').value).toBe(89);
    expect((await api('GET', '/reports/weekly', opts)).body.mode).toBe('personalised');
    expect((await api('PUT', '/me/goals', { ...opts, body: { goals: { protein: 95 } } })).status).toBe(200);
    expect((await api('GET', '/days/2026-10-14', opts)).body.goals.protein).toBe(95);
    const hardened = await worker.fetch(new Request('https://zero.example/me/settings', {
      headers: { authorization: 'Bearer test-app-token', 'x-user-id': userId, 'x-profile-secret': opts.secret },
    }), { ...env, REQUIRE_SECRET: '1' } as unknown as Env);
    expect(hardened.status).toBe(200);
    // Erasing health data leaves the account signed in; erasing the account removes every session.
    expect((await api('DELETE', '/me/health-data', opts)).status).toBe(204);
    expect((await api('GET', '/me/profile', opts)).body.profile.mode).toBe('generic');
    expect((await api('DELETE', '/me', opts)).status).toBe(204);
    expect((await env.DB.prepare('SELECT token_hash FROM account_sessions WHERE user_id = ?').bind(userId).all()).results).toEqual([]);
  });

  it('keeps login credentials scoped to the authenticated account and issues none for a wrong password', async () => {
    const a = await register(unique('AccountA'));
    const b = await register(unique('AccountB'));
    const loggedIn = await login(a.body.profile.name, PASSWORD);
    expect((await api('GET', '/me/profile', { userId: b.body.profile.id, secret: loggedIn.body.secret })).status).toBe(403);
    expect((await api('GET', '/me/profile', { userId: a.body.profile.id, secret: b.body.secret })).status).toBe(403);
    expect((await login(a.body.profile.name, 'wrong password')).status).toBe(401);
    expect((await env.DB.prepare('SELECT token_hash FROM account_sessions WHERE user_id = ?').bind(a.body.profile.id).all()).results).toHaveLength(1);
  });

  it('lets password accounts with a missing legacy credential read their saved data', async () => {
    const created = await register(unique('NoLegacySecret'));
    await env.DB.prepare('UPDATE users SET secret_hash = NULL WHERE id = ?').bind(created.body.profile.id).run();
    const loggedIn = await login(created.body.profile.name, PASSWORD);
    expect((await api('GET', '/me/profile', { userId: created.body.profile.id, secret: loggedIn.body.secret })).status).toBe(200);
  });

  it('returns the profile for the right username and password', async () => {
    const name = unique('Ravi');
    const created = await register(name);
    const res = await login(name, PASSWORD);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ profile: created.body.profile, secret: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
    const opts = { userId: res.body.profile.id, secret: res.body.secret };
    expect((await api('GET', '/me/profile', opts)).status).toBe(200);
    // A second phone's login must keep the first phone and existing installations signed in.
    const second = await login(name, PASSWORD);
    expect(second.body.secret).not.toBe(res.body.secret);
    expect((await api('GET', '/me/profile', opts)).status).toBe(200);
    expect((await api('GET', '/me/profile', { ...opts, secret: created.body.secret })).status).toBe(200);
    const stored = await env.DB.prepare('SELECT token_hash FROM account_sessions WHERE user_id = ?').bind(opts.userId).all<{ token_hash: string }>();
    expect(stored.results).toHaveLength(2);
    expect(JSON.stringify(stored.results)).not.toContain(res.body.secret);
  });

  it('ignores the username\'s case and stray spaces, and returns the name as it was registered', async () => {
    const name = unique('Meera');
    const created = await register(name);
    for (const typed of [name.toLowerCase(), name.toUpperCase(), `  ${name}  `]) {
      const res = await login(typed, PASSWORD);
      expect(res.status, typed).toBe(200);
      expect(res.body.profile).toEqual({ id: created.body.profile.id, name });
    }
  });

  it('is case-sensitive about the password', async () => {
    const name = unique('Case');
    await register(name, 'MixedCase Password');
    expect((await login(name, 'mixedcase password')).status).toBe(401);
    expect((await login(name, 'MixedCase Password')).status).toBe(200);
  });

  it('gives one answer for a wrong password, an unknown username and a profile with no password', async () => {
    const name = unique('Wrong');
    await register(name);
    const legacy = unique('Legacy');
    await api('POST', '/profiles', { body: { name: legacy } });
    const answers = [await login(name, 'not the password'), await login(unique('Nobody'), PASSWORD), await login(legacy, PASSWORD)];
    for (const res of answers) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: { code: 'invalid_credentials', message: 'Wrong username or password' } });
    }
  });

  it('still lets in an account whose password is shorter than today\'s minimum', async () => {
    const name = unique('Older');
    const id = (await api('POST', '/profiles', { body: { name } })).body.profile.id;
    await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword('abc', 1_000), id).run();
    expect((await login(name, 'abc')).status).toBe(200);
  });

  it('refuses a body without a username or password, and one that is not a JSON object', async () => {
    expect((await login(undefined, PASSWORD)).status).toBe(400);
    expect((await login('someone', undefined)).status).toBe(400);
    expect((await login('someone', '')).status).toBe(400);
    expect((await login('someone', 'x'.repeat(129))).status).toBe(400);
    expect((await api('POST', '/auth/login', { raw: '[]' })).status).toBe(400);
  });

  it('needs the app token', async () => {
    const res = await api('POST', '/auth/login', { token: 'wrong', body: { username: 'x', password: PASSWORD } });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('stops working once the profile is deleted', async () => {
    const name = unique('Gone');
    const created = await register(name);
    expect((await api('DELETE', '/me', { userId: created.body.profile.id, secret: created.body.secret })).status).toBe(204);
    expect((await login(name, PASSWORD)).status).toBe(401);
    // And the name is free again.
    expect((await register(name)).status).toBe(201);
  });
});
