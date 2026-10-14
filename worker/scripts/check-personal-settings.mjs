import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Tests the real HTTP contract, using a disposable account that is always deleted. Prints no credentials. */
export async function checkPersonalSettings(send) {
  const username = `settings-check-${randomUUID().slice(0, 8)}`;
  const password = randomUUID();
  const created = await send('POST', '/auth/register', { username, password, timezone: 'UTC' });
  assert.equal(created.status, 201, 'test account registration');
  const userId = created.body.profile.id;
  const initial = { userId, secret: created.body.secret };
  const date = new Date().toISOString().slice(0, 10);
  const profile = {
    birthYear: 1990, birthMonth: 3, sexForCalc: 'female', heightCm: 180, weightKg: 89,
    activity: 'inactive', goal: 'maintain', pace: 'gentle', pattern: 'vegan', referenceSet: 'nasem', numbersHidden: false,
  };
  const safety = { pregnantOrBreastfeeding: false, eatingDisorder: false, clinicianDiet: false, dietInteractingMedicine: true };
  const login = async () => {
    const r = await send('POST', '/auth/login', { username, password });
    assert.equal(r.status, 200, 'password login');
    assert.ok(typeof r.body.secret === 'string' && /^[A-Za-z0-9_-]{43}$/.test(r.body.secret), 'login must grant account access');
    return { userId, secret: r.body.secret };
  };
  const read = async (path, credentials) => {
    const r = await send('GET', path, undefined, credentials);
    assert.equal(r.status, 200, `${path} must open directly after login`);
    return r.body;
  };
  const save = async (input, credentials) => {
    const r = await send('PUT', '/me/profile', { profile: input, safety, consentVersion: '2026-10-v3' }, credentials);
    assert.equal(r.status, 200, 'saving personal settings');
    return r.body;
  };
  const checkTargets = async (value, credentials) => {
    const targets = await read('/me/targets', credentials);
    assert.equal(targets.targets.find(t => t.nutrient === 'protein').value, value, 'Your targets uses saved protein');
    const goals = await read('/me/goals', credentials);
    assert.equal(goals.goals.find(g => g.key === 'protein').target, value, 'daily goals uses saved protein');
    assert.equal((await read(`/days/${date}`, credentials)).goals.protein, value, 'Today uses saved protein');
    assert.equal((await read('/reports/weekly', credentials)).mode, 'personalised', 'reports open with account access');
  };
  try {
    const first = await login();
    assert.equal((await read('/me/profile', first)).profile.mode, 'generic', 'unconfigured settings open without another login');
    await read('/me/targets', first);
    await save(profile, first);
    assert.equal((await read('/me/profile', first)).profile.weightKg, 89, 'first save persists');
    await checkTargets(89, first);
    console.log('PASS: unconfigured account opens, saves and reopens personal settings and targets.');

    const returning = await login();
    const saved = (await read('/me/profile', returning)).profile;
    for (const [key, value] of Object.entries(profile)) assert.equal(saved[key], value, `${key} survives login`);
    assert.equal(saved.dietInteractingMedicine, true, 'medicine setting survives login');
    const edited = { ...profile, birthYear: 1991, birthMonth: 5, heightCm: 181, weightKg: 91, pattern: 'vegetarian' };
    await save(edited, returning);
    const reopened = (await read('/me/profile', returning)).profile;
    for (const [key, value] of Object.entries(edited)) assert.equal(reopened[key], value, `${key} edit persists`);
    await checkTargets(91, returning);
    assert.equal((await read('/me/profile', first)).profile.weightKg, 91, 'a second login keeps the first session usable');
    await read('/me/profile', initial);
    const bad = await send('POST', '/auth/login', { username, password: 'incorrect password' });
    assert.equal(bad.status, 401, 'wrong passwords are refused');
    assert.equal(bad.body.error.code, 'invalid_credentials');
    console.log('PASS: configured account loads, edits and reopens saved values; existing sessions remain valid.');
  } finally {
    const removed = await send('DELETE', '/me', undefined, initial);
    assert.equal(removed.status, 204, 'test account cleanup');
    console.log('PASS: disposable account and its data were deleted.');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const config = readFileSync(new URL('../../app/src/config/local.ts', import.meta.url), 'utf8');
  const base = process.env.NUTRITION_API_BASE_URL ?? /API_BASE_URL\s*=\s*['"]([^'"]+)['"]/.exec(config)?.[1];
  const token = process.env.NUTRITION_APP_TOKEN ?? /APP_TOKEN\s*=\s*['"]([^'"]+)['"]/.exec(config)?.[1];
  assert.ok(base && token, 'API configuration is required');
  await checkPersonalSettings(async (method, path, body, credentials) => {
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    if (credentials) Object.assign(headers, { 'x-user-id': credentials.userId, 'x-profile-secret': credentials.secret });
    const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  });
}
