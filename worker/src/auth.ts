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

function base64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 32 random bytes, base64url without padding (43 chars). */
export function randomToken(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export const WEBHOOK_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** Hex SHA-256: how a profile secret is stored. The secret itself is 256 random bits, so no salt or stretching is needed. */
export async function sha256Hex(value: string): Promise<string> {
  const bytes = new Uint8Array(await digest(value));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const PROFILE_SECRET_HEADER = 'x-profile-secret';
/** A secret as `randomToken()` makes it: 43 base64url characters. Anything else is refused before it is hashed. */
export const PROFILE_SECRET_RE = /^[A-Za-z0-9_-]{43}$/;

/**
 * Whether the request carries this profile's secret. It never throws and never reveals why not: a profile
 * with no secret yet, a missing header and a wrong secret all read as "locked" (plan 8.3.2).
 */
export async function hasProfileSecret(req: Request, secretHash: string | null, account?: { db: D1Database; userId: string }): Promise<boolean> {
  const given = req.headers.get(PROFILE_SECRET_HEADER);
  if (!given || !PROFILE_SECRET_RE.test(given)) return false;
  const hash = await sha256Hex(given);
  // Keep existing installations signed in; a password login adds a credential rather than rotating theirs.
  if (secretHash && await safeEqual(hash, secretHash)) return true;
  if (!account) return false;
  return !!await account.db.prepare('SELECT user_id FROM account_sessions WHERE token_hash = ?1 AND user_id = ?2')
    .bind(hash, account.userId).first();
}

/**
 * Health-scoped routes refuse without the profile's secret (plan 8.3.2). The shared app token is not enough. The answer depends only
 * on what the request carried, never on whether the profile has a secret: no secret sent is `profile_secret_required`, and any secret
 * that does not unlock it is `profile_secret_invalid`, so a poller cannot tell a profile with no secret from one with a different one.
 */
export async function requireProfileSecret(req: Request, secretHash: string | null, account?: { db: D1Database; userId: string }): Promise<void> {
  if (!req.headers.get(PROFILE_SECRET_HEADER)) throw new HttpError(403, 'profile_secret_required', "This profile's secret is required.");
  if (!(await hasProfileSecret(req, secretHash, account))) throw new HttpError(403, 'profile_secret_invalid', "That is not this profile's secret.");
}

// ---- passwords (accounts: POST /auth/register, POST /auth/login)

/**
 * PBKDF2-SHA256 iterations for a new password. This is below current guidance (OWASP asks for 600,000) on purpose: Cloudflare's free plan
 * allows 10 ms of CPU per request, and 100,000 iterations already take about 8 ms on a fast laptop, so a hosted Worker would fail
 * requests at the limit. 20,000 take about 1.5 ms. The count is stored inside every hash, so raising it later leaves existing
 * passwords working.
 */
export const PASSWORD_ITERATIONS = 20_000;
/** Inside the app (ON_DEVICE) the hash is computed in plain JavaScript, which is far slower, and the database is a file on the person's own phone. */
export const ON_DEVICE_PASSWORD_ITERATIONS = 1_000;

const PASSWORD_SCHEME = 'pbkdf2-sha256';

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

/** `pbkdf2-sha256$<iterations>$<salt>$<hash>`, salt and hash in base64url. A fresh random salt each time, so equal passwords differ. */
export async function hashPassword(password: string, iterations: number = PASSWORD_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return [PASSWORD_SCHEME, iterations, base64Url(salt), base64Url(await derive(password, salt, iterations))].join('$');
}

/** Whether `password` is the one `stored` was made from. Anything that is not a hash made by `hashPassword` reads as "no". */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, rounds, salt, hash, extra] = stored.split('$');
  const iterations = Number(rounds);
  if (scheme !== PASSWORD_SCHEME || extra !== undefined || !salt || !hash || !Number.isSafeInteger(iterations) || iterations < 1) return false;
  let saltBytes: Uint8Array;
  try {
    saltBytes = Uint8Array.from(atob(salt.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }
  return safeEqual(base64Url(await derive(password, saltBytes, iterations)), hash);
}
