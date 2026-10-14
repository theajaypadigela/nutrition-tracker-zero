import { env } from 'cloudflare:test';
import { it } from 'vitest';
import worker from '../../src/index';
import { checkPersonalSettings } from '../../scripts/check-personal-settings.mjs';
it('opens, saves and edits personal settings and targets after password login', async () => {
  await checkPersonalSettings(async (method: string, path: string, body?: unknown, credentials?: { userId: string; secret: string }) => {
    const headers: Record<string, string> = { authorization: 'Bearer test-app-token', 'content-type': 'application/json' };
    if (credentials) Object.assign(headers, { 'x-user-id': credentials.userId, 'x-profile-secret': credentials.secret });
    const res = await worker.fetch(new Request('https://local.example' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env);
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  });
});
