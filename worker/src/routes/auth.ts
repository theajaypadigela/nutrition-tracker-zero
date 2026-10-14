import { hashPassword, ON_DEVICE_PASSWORD_ITERATIONS, PASSWORD_ITERATIONS, randomToken, sha256Hex, verifyPassword } from '../auth';
import { badRequest, HttpError, json, nowIso, readJson } from '../http';
import type { Router } from '../router';
import { asObject, trimmedString } from '../validate';
import { insertProfile, MAX_PROFILE_NAME } from './profiles';

export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 128;

/**
 * Accounts: the username is the profile's name, the password is kept as a PBKDF2 hash. Both routes need only the shared app token, since
 * nobody is signed in yet. Both return a credential the app stores securely and sends with X-User-Id, including on health routes.
 */
export function registerAuth(router: Router) {
  /** Creates the account and its profile, including the credential stored automatically by the app. */
  router.add('POST', '/auth/register', 'app', async ({ req, env }) => {
    const body = asObject(await readJson(req));
    const username = trimmedString(body.username, 'username', 1, MAX_PROFILE_NAME);
    const password = body.password;
    if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
      throw badRequest(`password must be ${MIN_PASSWORD}-${MAX_PASSWORD} characters`);
    }
    // The ON_DEVICE var is typed as the literal "" from wrangler.jsonc, hence the cast.
    const iterations = (env.ON_DEVICE as string) === '1' ? ON_DEVICE_PASSWORD_ITERATIONS : PASSWORD_ITERATIONS;
    return json(await insertProfile(env, body, username, await hashPassword(password, iterations)), 201);
  });

  /**
   * One answer for every way to be wrong (no such username, a profile that has no password, a wrong password), so the reply does not say
   * which. The length rules above are not applied here: an account made under older rules must still be able to log in.
   */
  router.add('POST', '/auth/login', 'app', async ({ req, env }) => {
    const body = asObject(await readJson(req));
    const username = trimmedString(body.username, 'username', 1, MAX_PROFILE_NAME);
    const password = body.password;
    if (typeof password !== 'string' || password.length === 0 || password.length > MAX_PASSWORD) {
      throw badRequest('password is required');
    }
    // `name` is COLLATE NOCASE, so "asha" finds "Asha".
    const user = await env.DB.prepare('SELECT id, name, password_hash FROM users WHERE name = ?')
      .bind(username)
      .first<{ id: string; name: string; password_hash: string | null }>();
    if (!user?.password_hash || !(await verifyPassword(password, user.password_hash))) {
      throw new HttpError(401, 'invalid_credentials', 'Wrong username or password');
    }
    const secret = randomToken();
    await env.DB.prepare('INSERT INTO account_sessions (token_hash, user_id, created_at) VALUES (?1, ?2, ?3)')
      .bind(await sha256Hex(secret), user.id, nowIso()).run();
    return json({ profile: { id: user.id, name: user.name }, secret });
  });
}
