jest.mock('@/config/local', () => ({ ON_DEVICE: false, API_BASE_URL: 'https://api.test', APP_TOKEN: 'tok' }));
import { api, ApiError, setApiSecret, setApiUser } from '@/api/client';
import { getProfileZone } from '@/api/zone';

const fetchMock = jest.fn();
(global as any).fetch = fetchMock;

function respond(status: number, body?: unknown) {
  fetchMock.mockResolvedValueOnce({ status, ok: status >= 200 && status < 300, text: async () => (body === undefined ? '' : JSON.stringify(body)) });
}

beforeEach(() => fetchMock.mockReset());

describe('api client', () => {
  it('sends the app token and the selected profile', async () => {
    setApiUser('user-1');
    respond(200, { profiles: [] });
    await api.listProfiles();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/profiles');
    expect(init.headers).toMatchObject({ authorization: 'Bearer tok', 'x-user-id': 'user-1' });
  });

  it('posts JSON bodies and unwraps responses', async () => {
    respond(201, { items: [{ id: 'i1' }] });
    const items = await api.addItems('2026-10-04', [{ name: 'idli', quantity: 3, unit: 'piece' }], 7);
    expect(items).toEqual([{ id: 'i1' }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/days/2026-10-04/items');
    expect(JSON.parse(init.body)).toEqual({ items: [{ name: 'idli', quantity: 3, unit: 'piece' }], callId: 7 });
  });

  it('maps error bodies to ApiError with code and details', async () => {
    respond(409, { error: { code: 'name_taken', message: 'taken', foodId: 'f1' } });
    await expect(api.createFood({ displayName: 'x', baseUnit: 'plate', nutrients: { calories: 1 } })).rejects.toMatchObject({
      status: 409,
      code: 'name_taken',
      details: { foodId: 'f1' },
    });
  });

  it('reads the person\'s own food history, which only that profile can see', async () => {
    setApiUser('user-9');
    respond(200, { asOf: '2026-10-13', windowDays: 180, halfLifeDays: 21, foods: [{ name: 'idli', meals: { breakfast: { days: 3 } } }] });
    const history = await api.getFoodHistory();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/foods/history');
    expect(init.method).toBe('GET');
    expect(init.headers).toMatchObject({ 'x-user-id': 'user-9' });
    expect(history.foods[0]).toMatchObject({ name: 'idli' });
  });

  it('handles 204 and network failures', async () => {
    respond(204);
    await expect(api.deleteItem('a/b')).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/items/a%2Fb');
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const err = await api.health().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('network');
  });

  it('sends the profile secret, once there is one, and not before', async () => {
    setApiUser('user-1');
    setApiSecret(null);
    respond(200, { profiles: [] });
    await api.listProfiles();
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('x-profile-secret');

    setApiSecret('s'.repeat(43));
    respond(200, { profiles: [] });
    await api.listProfiles();
    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({ 'x-profile-secret': 's'.repeat(43) });

    setApiSecret(null);
    respond(200, { profiles: [] });
    await api.listProfiles();
    expect(fetchMock.mock.calls[2][1].headers).not.toHaveProperty('x-profile-secret');
  });

  it('createProfile returns the profile and its one-time secret', async () => {
    respond(201, { profile: { id: 'u', name: 'Asha' }, secret: 'x'.repeat(43) });
    await expect(api.createProfile('Asha')).resolves.toEqual({ profile: { id: 'u', name: 'Asha' }, secret: 'x'.repeat(43) });
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });

  it('register posts the username and password, and returns the profile and its one-time secret', async () => {
    respond(201, { profile: { id: 'u', name: 'Asha' }, secret: 'x'.repeat(43) });
    await expect(api.register('Asha', 'a long password')).resolves.toEqual({ profile: { id: 'u', name: 'Asha' }, secret: 'x'.repeat(43) });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/auth/register');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ username: 'Asha', password: 'a long password' });
  });

  it('login posts the username and password and returns just the profile', async () => {
    respond(200, { profile: { id: 'u', name: 'Asha' } });
    await expect(api.login('asha', 'a long password')).resolves.toEqual({ id: 'u', name: 'Asha' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/auth/login');
    expect(JSON.parse(init.body)).toEqual({ username: 'asha', password: 'a long password' });
  });

  it('login surfaces a wrong password as a 401 with its code, so the screen can word it', async () => {
    respond(401, { error: { code: 'invalid_credentials', message: 'Wrong username or password' } });
    const err = await api.login('asha', 'nope').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 401, code: 'invalid_credentials' });
  });

  it('calls the health routes by their methods and paths', async () => {
    const call = async (run: () => Promise<unknown>, body: unknown = {}) => {
      respond(200, body);
      await run();
      const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
      return { url: String(url).replace('https://api.test', ''), method: init.method, body: init.body ? JSON.parse(init.body) : undefined };
    };
    expect(await call(() => api.getHealthProfile())).toMatchObject({ url: '/me/profile', method: 'GET' });
    expect(await call(() => api.saveHealthProfile({ profile: { goal: 'lose' }, consentVersion: 'v1' }))).toMatchObject({ url: '/me/profile', method: 'PUT', body: { profile: { goal: 'lose' }, consentVersion: 'v1' } });
    expect(await call(() => api.previewTargets({ birthYear: 1990 }, { pregnantOrBreastfeeding: false, eatingDisorder: false, clinicianDiet: false, dietInteractingMedicine: false }), { targetSet: { id: null } })).toMatchObject({ url: '/me/targets/preview', method: 'POST' });
    expect(await call(() => api.getTargets('2026-10-05'))).toMatchObject({ url: '/me/targets?date=2026-10-05', method: 'GET' });
    expect(await call(() => api.getTargets())).toMatchObject({ url: '/me/targets' });
    expect(await call(() => api.addWeight(61.5, { confirm: true }))).toMatchObject({ url: '/me/weights', method: 'POST', body: { weightKg: 61.5, confirm: true } });
    expect(await call(() => api.exportHealthData())).toMatchObject({ url: '/me/export', method: 'GET' });
    expect(await call(() => api.updateGoals({ protein: 70 }, 'care_team'))).toMatchObject({ url: '/me/goals', method: 'PUT', body: { goals: { protein: 70 }, origin: 'care_team' } });
    expect(await call(() => api.claimSecret())).toMatchObject({ url: '/me/secret', method: 'POST' });
    respond(204);
    await api.deleteHealthData();
    expect(fetchMock.mock.calls.at(-1)[0]).toBe('https://api.test/me/health-data');
    respond(204);
    await api.deleteProfile();
    expect([fetchMock.mock.calls.at(-1)[0], fetchMock.mock.calls.at(-1)[1].method]).toEqual(['https://api.test/me', 'DELETE']);
  });

  it('remembers the profile\'s time zone whenever the settings are read or saved, so every screen agrees on the day', async () => {
    respond(200, { id: 'user-9', name: 'Ravi', timezone: 'Europe/London', callTime: null, callEnabled: true, vapi: { configured: false }, lastCall: null });
    await api.getSettings();
    expect(getProfileZone()).toEqual({ userId: 'user-9', zone: 'Europe/London' });
    respond(200, { id: 'user-9', name: 'Ravi', timezone: 'Asia/Kolkata', callTime: null, callEnabled: true, vapi: { configured: false }, lastCall: null });
    await api.updateSettings({ timezone: 'Asia/Kolkata' });
    expect(getProfileZone()).toEqual({ userId: 'user-9', zone: 'Asia/Kolkata' });
  });
});

describe('the server address (security review, plan 8.3.6)', () => {
  it('allows HTTPS anywhere, and plain HTTP only to this machine', () => {
    const { isAllowedBaseUrl } = jest.requireActual('@/api/client') as typeof import('@/api/client');
    expect(isAllowedBaseUrl('https://nutrition-tracker-zero.example.workers.dev')).toBe(true);
    expect(isAllowedBaseUrl('http://localhost:8787')).toBe(true);
    expect(isAllowedBaseUrl('http://10.0.2.2:8787')).toBe(true);
    expect(isAllowedBaseUrl('http://127.0.0.1')).toBe(true);
    expect(isAllowedBaseUrl('http://192.168.1.20:8787')).toBe(false);
    expect(isAllowedBaseUrl('http://localhost.evil.example')).toBe(false);
    expect(isAllowedBaseUrl('http://example.com')).toBe(false);
  });
});
