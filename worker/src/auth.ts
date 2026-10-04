import { HttpError } from './http';

const encoder = new TextEncoder();

async function digest(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', encoder.encode(value));
}

/** Constant-time string comparison (hashes first so timingSafeEqual always gets equal lengths). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([digest(a), digest(b)]);
  return crypto.subtle.timingSafeEqual(da, db) && a.length === b.length;
}

export async function requireAppToken(req: Request, env: Env): Promise<void> {
  const header = req.headers.get('authorization') ?? '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!env.APP_TOKEN || !match || !(await safeEqual(match[1]!, env.APP_TOKEN))) {
    throw new HttpError(401, 'unauthorized', 'Missing or invalid app token');
  }
}

/** 32 random bytes, base64url without padding (43 chars). */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const WEBHOOK_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
