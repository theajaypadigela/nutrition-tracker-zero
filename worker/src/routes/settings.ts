import { badRequest, conflict, json, nowIso, readJson } from '../http';
import { callJson, staleSweepStatement, type CallRow, type UserRow } from '../db/queries';
import { NUTRIENTS, isNutrientKey, type NutrientKey } from '../domain/nutrients';
import { CALL_TIME_RE, isValidTimeZone } from '../domain/time';
import type { Ctx, Router } from '../router';
import { asObject, isUniqueViolation, trimmedString } from '../validate';
import { MAX_PROFILE_NAME } from './profiles';

const PUBLIC_KEY_RE = /^[A-Za-z0-9._-]{8,200}$/;

/** Settings view. Never includes the Vapi key itself, only whether one is stored. */
function settingsJson(user: UserRow, lastCall: CallRow | null) {
  return {
    id: user.id,
    name: user.name,
    timezone: user.timezone,
    callTime: user.call_time,
    callEnabled: user.call_enabled === 1,
    vapi: { configured: !!user.vapi_public_key },
    lastCall: lastCall ? callJson(lastCall) : null,
  };
}

async function readSettings(env: Env, userId: string) {
  const [, user, last] = await env.DB.batch([
    staleSweepStatement(env.DB, userId),
    env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId),
    env.DB.prepare('SELECT * FROM calls WHERE user_id = ? ORDER BY id DESC LIMIT 1').bind(userId),
  ]);
  return settingsJson(
    (user as D1Result<UserRow>).results[0]!,
    (last as D1Result<CallRow>).results[0] ?? null,
  );
}

export type Goals = Record<NutrientKey, number | null>;

export async function loadGoals(db: D1Database, userId: string): Promise<Goals> {
  return goalsFromRows((await goalsStatement(db, userId).all<{ nutrient: string; target: number }>()).results);
}

export function goalsStatement(db: D1Database, userId: string) {
  return db.prepare('SELECT nutrient, target FROM user_goals WHERE user_id = ?').bind(userId);
}

export function goalsFromRows(rows: { nutrient: string; target: number }[]): Goals {
  const goals = Object.fromEntries(NUTRIENTS.map((n) => [n.key, n.defaultGoal])) as Goals;
  for (const r of rows) if (isNutrientKey(r.nutrient)) goals[r.nutrient] = r.target;
  return goals;
}

function goalsJson(rows: { nutrient: string; target: number }[]) {
  const custom = new Map(rows.map((r) => [r.nutrient, r.target]));
  return {
    goals: NUTRIENTS.map((n) => ({
      key: n.key,
      label: n.label,
      unit: n.unit,
      defaultGoal: n.defaultGoal,
      target: custom.get(n.key) ?? n.defaultGoal,
      custom: custom.has(n.key),
    })),
  };
}

export function registerSettings(router: Router) {
  router.add('GET', '/me/settings', 'user', async ({ env, user }: Ctx) => json(await readSettings(env, user!.id)));

  router.add('PUT', '/me/settings', 'user', async ({ req, env, user }: Ctx) => {
    const body = asObject(await readJson(req));
    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = ?${values.length}`);
    };

    if (body.name !== undefined) set('name', trimmedString(body.name, 'name', 1, MAX_PROFILE_NAME));
    if (body.timezone !== undefined) {
      if (typeof body.timezone !== 'string' || !isValidTimeZone(body.timezone)) {
        throw badRequest('timezone must be an IANA zone like Asia/Kolkata');
      }
      set('timezone', body.timezone);
    }
    if (body.callTime !== undefined) {
      if (body.callTime !== null && (typeof body.callTime !== 'string' || !CALL_TIME_RE.test(body.callTime))) {
        throw badRequest('callTime must be HH:MM or null');
      }
      set('call_time', body.callTime);
    }
    if (body.callEnabled !== undefined) {
      if (typeof body.callEnabled !== 'boolean') throw badRequest('callEnabled must be a boolean');
      set('call_enabled', body.callEnabled ? 1 : 0);
    }
    if (body.vapiPublicKey !== undefined) {
      const key = typeof body.vapiPublicKey === 'string' ? body.vapiPublicKey.trim() : body.vapiPublicKey;
      if (key === null || key === '') set('vapi_public_key', null);
      else if (typeof key === 'string' && PUBLIC_KEY_RE.test(key)) set('vapi_public_key', key);
      else throw badRequest('vapiPublicKey must be the public key from the Vapi dashboard');
    }

    if (sets.length > 0) {
      set('updated_at', nowIso());
      values.push(user!.id);
      try {
        await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?${values.length}`)
          .bind(...values)
          .run();
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict('name_taken', 'A profile with that name already exists');
        throw err;
      }
    }
    return json(await readSettings(env, user!.id));
  });

  router.add('GET', '/me/goals', 'user', async ({ env, user }: Ctx) => {
    const { results } = await goalsStatement(env.DB, user!.id).all<{ nutrient: string; target: number }>();
    return json(goalsJson(results));
  });

  router.add('PUT', '/me/goals', 'user', async ({ req, env, user }: Ctx) => {
    const body = asObject(await readJson(req));
    const goals = asObject(body.goals);
    const upserts: { nutrient: string; target: number }[] = [];
    const resets: string[] = [];
    for (const [key, value] of Object.entries(goals)) {
      if (!isNutrientKey(key)) throw badRequest(`Unknown nutrient: ${key}`);
      if (value === null) {
        resets.push(key);
        continue;
      }
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 100_000) {
        throw badRequest(`${key} goal must be a positive number`);
      }
      upserts.push({ nutrient: key, target: value });
    }
    const db = env.DB;
    await db.batch([
      db
        .prepare(
          `DELETE FROM user_goals WHERE user_id = ?1 AND nutrient IN (SELECT value FROM json_each(?2))`,
        )
        .bind(user!.id, JSON.stringify(resets)),
      db
        .prepare(
          `INSERT INTO user_goals (user_id, nutrient, target)
           SELECT ?1, g.value ->> '$.nutrient', g.value ->> '$.target' FROM json_each(?2) AS g WHERE true
           ON CONFLICT (user_id, nutrient) DO UPDATE SET target = excluded.target`,
        )
        .bind(user!.id, JSON.stringify(upserts)),
    ]);
    const { results } = await goalsStatement(db, user!.id).all<{ nutrient: string; target: number }>();
    return json(goalsJson(results));
  });
}
