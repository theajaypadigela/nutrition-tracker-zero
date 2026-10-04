jest.mock('@/config/local', () => ({ API_BASE_URL: 'https://api.test', APP_TOKEN: 'tok' }));
import { api, ApiError, setApiUser } from '@/api/client';

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

  it('handles 204 and network failures', async () => {
    respond(204);
    await expect(api.deleteItem('a/b')).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/items/a%2Fb');
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const err = await api.health().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('network');
  });
});
