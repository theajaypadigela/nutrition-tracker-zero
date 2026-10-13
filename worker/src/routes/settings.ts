import { badRequest, conflict, json, nowIso, readJson } from '../http';
import { callJson, staleSweepStatement, type CallRow, type UserRow } from '../db/queries';
import { goalRejection, goalWarnings } from '../domain/goals';
import { NUTRIENTS, isNutrientKey, type NutrientKey } from '../domain/nutrients';
import { checkOverride, overrideBounds } from '../domain/targets/overrides';
import { CALL_TIME_RE, isValidTimeZone, localDateIn } from '../domain/time';
import { requireProfileSecret } from '../auth';
import { goalStateFromResults, goalStatements, goalsView, type GoalRow } from '../health';
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

/** The nutrients whose goal the person typed (the rest read the recommended or the generic reference). */
export function customKeys(rows: { nutrient: string }[]): NutrientKey[] {
  return rows.map((r) => r.nutrient).filter(isNutrientKey);
}

/** What a typed number is checked against: the personal set in force, or none (the calorie placeholders only). */
function boundsContext(view: ReturnType<typeof goalsView>, state: ReturnType<typeof goalStateFromResults>) {
  const set = view.mode === 'personalised' && state.sets.length ? state.sets[state.sets.length - 1]! : null;
  return { set, sex: set?.inputs?.sexForCalc ?? null };
}

/** A typed number away from the usual values is kept as typed and labelled with why, never refused or changed (plan 6.4). */
function warningOf(row: GoalRow, view: ReturnType<typeof goalsView>, state: ReturnType<typeof goalStateFromResults>): string | null {
  if (!isNutrientKey(row.nutrient) || row.origin === 'care_team') return null;
  return checkOverride({ nutrient: row.nutrient, value: row.target, ...boundsContext(view, state) }).note ?? null;
}

function goalsJson(rows: GoalRow[], view: ReturnType<typeof goalsView>, state: ReturnType<typeof goalStateFromResults>) {
  const typed = new Map(rows.map((r) => [r.nutrient, r]));
  const context = boundsContext(view, state);
  return {
    mode: view.mode,
    hidden: view.hidden,
    goals: NUTRIENTS.map((n) => {
      const row = typed.get(n.key);
      const rec = view.recommended[n.key];
      // A care-team number is used as typed: it is never measured against the usual values (6.7).
      const bounds = view.mode === 'reference_only' || view.hidden ? {} : overrideBounds({ nutrient: n.key, ...context });
      const warning = row ? warningOf(row, view, state) : null;
      return {
        key: n.key,
        label: n.label,
        unit: n.unit,
        kind: n.kind,
        defaultGoal: n.defaultGoal,
        target: view.goals[n.key],
        custom: !!row,
        origin: view.origins[n.key] ?? null,
        recommended: rec?.value ?? null,
        ...(rec ? { how: rec.how, basis: rec.basis, evidence: rec.evidence } : {}),
        ...(bounds.low !== undefined || bounds.high !== undefined ? { bounds } : {}),
        ...(row ? { setAt: row.updated_at ?? null, outsideBounds: warning !== null, ...(warning ? { warning } : {}) } : {}),
      };
    }),
    warnings: goalWarnings(rows),
  };
}

async function readGoals(env: Env, userId: string, tz: string, unlocked: boolean) {
  const results = await env.DB.batch(goalStatements(env.DB, userId, unlocked));
  const state = goalStateFromResults(results, unlocked);
  const today = localDateIn(tz);
  return goalsJson(state.goals, goalsView({ state, today, unlocked }), state);
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

  router.add('GET', '/me/goals', 'user', async ({ env, user, unlocked }: Ctx) => json(await readGoals(env, user!.id, user!.timezone, unlocked)));

  /**
   * Typed numbers, kept as overrides of the recommended value. Any positive number is saved: it is the person's choice.
   * A number away from the usual values (plan 6.4: energy between the sex-specific floor and 125% of the estimate,
   * protein between the allowance and the highest typical figure, sodium between 1,500 and 2,300 mg, a micronutrient
   * up to its food-sourced upper level; without the secret, calories between 1,200 and 6,000) comes back with a note
   * saying why it is unusual. `origin: 'care_team'` is for a reference-only profile typing the numbers its doctor gave it (6.7).
   */
  router.add('PUT', '/me/goals', 'user', async ({ req, env, user, unlocked }: Ctx) => {
    // A profile with a secret changes its numbers only with it: the personal bounds need the target set, and a care-team number is
    // health data. A profile that never claimed one (an older app) keeps typing its own numbers, as in Phase 0.
    if (user!.secret_hash && !unlocked) await requireProfileSecret(req, user!.secret_hash);
    const body = asObject(await readJson(req));
    const goals = asObject(body.goals);
    const origin = body.origin === undefined ? 'custom' : body.origin;
    if (origin !== 'custom' && origin !== 'care_team') throw badRequest("origin must be 'custom' or 'care_team'");
    const db = env.DB;
    const today = localDateIn(user!.timezone);
    const before = goalStateFromResults(await db.batch(goalStatements(db, user!.id, unlocked)), unlocked);
    const view = goalsView({ state: before, today, unlocked });
    if (origin === 'care_team' && view.mode !== 'reference_only') {
      throw badRequest('Care-team numbers are for profiles without personal targets. Use your own targets instead.', { field: 'origin' });
    }
    const context = boundsContext(view, before);

    const upserts: { nutrient: string; target: number }[] = [];
    const resets: string[] = [];
    const notes: { nutrient: string; note: string }[] = [];
    for (const [key, value] of Object.entries(goals)) {
      if (!isNutrientKey(key)) throw badRequest(`Unknown nutrient: ${key}`);
      if (value === null) {
        resets.push(key);
        continue;
      }
      if (typeof value !== 'number') throw badRequest(`${key} goal must be a positive number`);
      // Only a number that cannot be a target is refused; care-team numbers also get a typo guard (6.7).
      const rejection = origin === 'care_team' ? careTeamRejection(key, value) : goalRejection(key, value);
      if (rejection) throw badRequest(rejection, { field: key });
      if (origin === 'custom') {
        const check = checkOverride({ nutrient: key, value, ...context });
        if (!check.ok) throw badRequest(check.message!, { field: key });
        if (check.note) notes.push({ nutrient: key, note: check.note });
      }
      upserts.push({ nutrient: key, target: value });
    }
    const now = nowIso();
    // Without the secret only the person's own numbers are touched: a care-team number is neither replaced nor removed (?5 = 1).
    const ownOnly = unlocked ? 0 : 1;
    await db.batch([
      db
        .prepare(`DELETE FROM user_goals WHERE user_id = ?1 AND nutrient IN (SELECT value FROM json_each(?2)) AND (?3 = 0 OR origin = 'custom')`)
        .bind(user!.id, JSON.stringify(resets), ownOnly),
      db
        .prepare(
          `INSERT INTO user_goals (user_id, nutrient, target, updated_at, origin)
           SELECT ?1, g.value ->> '$.nutrient', g.value ->> '$.target', ?3, ?4 FROM json_each(?2) AS g WHERE true
           ON CONFLICT (user_id, nutrient) DO UPDATE SET target = excluded.target, updated_at = excluded.updated_at, origin = excluded.origin
           WHERE ?5 = 0 OR user_goals.origin = 'custom'`,
        )
        .bind(user!.id, JSON.stringify(upserts), now, origin, ownOnly),
    ]);
    return json({ ...(await readGoals(env, user!.id, user!.timezone, unlocked)), notes });
  });
}

/** Numbers from a care team are used as typed, with only a typo guard: energy 500 to 6,000 kcal, the rest positive (plan 6.7). */
function careTeamRejection(nutrient: NutrientKey, value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return `${nutrient} must be a positive number`;
  if (nutrient === 'calories' && (value < 500 || value > 6000)) return 'Energy must be between 500 and 6,000 kcal';
  const reference = NUTRIENTS.find((n) => n.key === nutrient)?.defaultGoal;
  if (reference && value > reference * 10) return `That is more than ten times the usual reference for ${nutrient}. Check the number.`;
  return null;
}

