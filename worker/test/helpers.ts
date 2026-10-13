import { SELF, env } from 'cloudflare:test';

export const APP_TOKEN = 'test-app-token';
export const BASE = 'https://zero.example';

export interface ApiResult<T = any> {
  status: number;
  body: T;
  text: string;
}

export async function api<T = any>(
  method: string,
  path: string,
  opts: { body?: unknown; userId?: string; token?: string | null; raw?: string; secret?: string } = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  if (opts.token !== null) headers.authorization = `Bearer ${opts.token ?? APP_TOKEN}`;
  if (opts.userId) headers['x-user-id'] = opts.userId;
  if (opts.secret) headers['x-profile-secret'] = opts.secret;
  let body: string | undefined;
  if (opts.raw !== undefined) body = opts.raw;
  else if (opts.body !== undefined) body = JSON.stringify(opts.body);
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await SELF.fetch(`${BASE}${path}`, { method, headers, body });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed as T, text };
}

let seq = 0;
export const unique = (prefix: string) => `${prefix} ${Date.now().toString(36)}${(seq++).toString(36)}`;

export async function createProfile(name = unique('User'), extra: Record<string, unknown> = {}): Promise<string> {
  const res = await api('POST', '/profiles', { body: { name, ...extra } });
  if (res.status !== 201) throw new Error(`createProfile ${res.status} ${res.text}`);
  return res.body.profile.id as string;
}

/** A new profile and its one-time secret, as the app receives them. */
export async function createProfileWithSecret(name = unique('User'), extra: Record<string, unknown> = {}): Promise<{ userId: string; secret: string; name: string }> {
  const res = await api('POST', '/profiles', { body: { name, ...extra } });
  if (res.status !== 201) throw new Error(`createProfile ${res.status} ${res.text}`);
  return { userId: res.body.profile.id as string, secret: res.body.secret as string, name };
}

export async function webhookToken(userId: string): Promise<string> {
  const row = await env.DB.prepare('SELECT webhook_token FROM users WHERE id = ?').bind(userId).first<{ webhook_token: string }>();
  return row!.webhook_token;
}

export function fillFixture(fixture: unknown, vars: Record<string, string>): string {
  let s = JSON.stringify(fixture);
  for (const [k, v] of Object.entries(vars)) s = s.split(`__${k}__`).join(v);
  return s;
}

export async function postWebhook(token: string, payload: string) {
  return api('POST', `/vapi/webhook/${token}`, { raw: payload, token: null });
}
