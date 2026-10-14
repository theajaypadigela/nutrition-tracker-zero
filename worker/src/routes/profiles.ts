import { randomToken, sha256Hex } from '../auth';
import { badRequest, conflict, json, nowIso, readJson } from '../http';
import { CALL_TIME_RE, DEFAULT_TIMEZONE, isValidTimeZone } from '../domain/time';
import type { Router } from '../router';
import { asObject, isUniqueViolation, trimmedString } from '../validate';

export const MAX_PROFILE_NAME = 40;

export function registerProfiles(router: Router) {
  router.add('GET', '/profiles', 'app', async ({ env }) => {
    const { results } = await env.DB.prepare('SELECT id, name FROM users ORDER BY name COLLATE NOCASE').all<{
      id: string;
      name: string;
    }>();
    return json({ profiles: results });
  });

  router.add('POST', '/profiles', 'app', async ({ req, env }) => {
    const body = asObject(await readJson(req));
    return json(await insertProfile(env, body, trimmedString(body.name, 'name', 1, MAX_PROFILE_NAME)), 201);
  });
}

/**
 * Validates the optional timezone and call time in `body`, then inserts the profile with its one-time secret. Shared by POST /profiles
 * (no password) and POST /auth/register (`passwordHash`). Answers 409 `name_taken` when the name is in use, whatever its case.
 */
export async function insertProfile(
  env: Env,
  body: Record<string, unknown>,
  name: string,
  passwordHash: string | null = null,
): Promise<{ profile: { id: string; name: string }; secret: string }> {
  const timezone = body.timezone === undefined ? DEFAULT_TIMEZONE : String(body.timezone);
  if (!isValidTimeZone(timezone)) throw badRequest('timezone must be an IANA zone like Asia/Kolkata');
  const callTime = body.callTime === undefined || body.callTime === null ? null : String(body.callTime);
  if (callTime !== null && !CALL_TIME_RE.test(callTime)) throw badRequest('callTime must be HH:MM');

  const id = crypto.randomUUID();
  const now = nowIso();
  // The profile's credential, stored only as a hash and kept automatically in the app's secure storage.
  const secret = randomToken();
  try {
    await env.DB.prepare(
      `INSERT INTO users (id, name, timezone, call_time, webhook_token, secret_hash, password_hash, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)`,
    )
      .bind(id, name, timezone, callTime, randomToken(), await sha256Hex(secret), passwordHash, now)
      .run();
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict('name_taken', 'A profile with that name already exists');
    throw err;
  }
  return { profile: { id, name }, secret };
}
