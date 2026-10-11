import { badRequest, conflict, json, notFound, nowIso, readJson } from '../http';
import { callJson, staleSweepStatement, type CallRow } from '../db/queries';
import { localDateIn, localTimeIn } from '../domain/time';
import type { Ctx, Router } from '../router';
import { buildAssistant } from '../vapi/assistant';
import type { LoggedItem } from '../vapi/prompt';
import { handleVapiWebhook } from '../vapi/webhook';
import { asObject, positiveInt, trimmedString } from '../validate';

const START_KINDS = ['scheduled', 'retry', 'test', 'manual'] as const;
type StartKind = (typeof START_KINDS)[number];

function publicBase(env: Env, url: URL): string {
  const configured = (env.PUBLIC_BASE_URL as string | undefined)?.trim();
  return (configured || url.origin).replace(/\/+$/, '');
}

async function ownCall(db: D1Database, id: number, userId: string): Promise<CallRow> {
  const row = await db.prepare('SELECT * FROM calls WHERE id = ?1 AND user_id = ?2').bind(id, userId).first<CallRow>();
  if (!row) throw notFound('Call not found');
  return row;
}

export function registerCalls(router: Router) {
  /** Records the call before anything reaches Vapi; the only response that carries the public key. */
  router.add('POST', '/calls/start', 'user', async ({ req, env, url, user }: Ctx) => {
    const u = user!;
    const body = asObject(await readJson(req));
    const kind = (body.kind ?? 'manual') as StartKind;
    if (!START_KINDS.includes(kind)) throw badRequest(`kind must be one of ${START_KINDS.join(', ')}`);
    if (!u.vapi_public_key) throw conflict('vapi_not_configured', 'Add your Vapi public key in Settings first');

    const db = env.DB;
    const at = new Date();
    const localDate = localDateIn(u.timezone, at);
    const localTime = localTimeIn(u.timezone, at);
    const now = nowIso();
    const [inserted, logged] = await db.batch([
      db
        .prepare(
          `INSERT INTO calls (user_id, local_date, kind, status, created_at, updated_at)
           VALUES (?1, ?2, ?3, 'queued', ?4, ?4) RETURNING id`,
        )
        .bind(u.id, localDate, kind, now),
      db
        .prepare(
          'SELECT raw_name, quantity, unit, meal FROM log_items WHERE user_id = ?1 AND local_date = ?2 ORDER BY created_at, id',
        )
        .bind(u.id, localDate),
    ]);
    const callId = (inserted as D1Result<{ id: number }>).results[0]!.id;
    const assistant = buildAssistant({
      userId: u.id,
      name: u.name,
      localDate,
      localTime,
      callRowId: callId,
      webhookUrl: `${publicBase(env, url)}/vapi/webhook/${u.webhook_token}`,
      alreadyLogged: (logged as D1Result<LoggedItem>).results,
    });
    return json({ callId, localDate, publicKey: u.vapi_public_key, assistant }, 201);
  });

  router.add('POST', '/calls/:id/started', 'user', async ({ req, env, params, user }: Ctx) => {
    const db = env.DB;
    const id = positiveInt(params.id, 'id');
    const vapiCallId = trimmedString(asObject(await readJson(req)).vapiCallId, 'vapiCallId', 1, 100);
    const call = await ownCall(db, id, user!.id);
    if (call.vapi_call_id === vapiCallId) return json({ call: callJson(call) });
    if (call.vapi_call_id) throw conflict('already_started', 'This call is linked to another Vapi call');

    const other = await db.prepare('SELECT * FROM calls WHERE vapi_call_id = ?').bind(vapiCallId).first<CallRow>();
    if (other) {
      if (other.user_id !== user!.id) throw conflict('already_started', 'That Vapi call belongs to another call');
      // The webhook got here first and recorded an 'unknown' call: keep that row, drop ours.
      const [merged] = await db.batch([
        db
          .prepare(`UPDATE calls SET kind = CASE kind WHEN 'unknown' THEN ?2 ELSE kind END, updated_at = ?3 WHERE id = ?1 RETURNING *`)
          .bind(other.id, call.kind, nowIso()),
        db.prepare(`DELETE FROM calls WHERE id = ?1 AND status = 'queued'`).bind(call.id),
      ]);
      return json({ call: callJson((merged as D1Result<CallRow>).results[0]!) });
    }

    const row = await db
      .prepare(
        `UPDATE calls SET vapi_call_id = ?2, status = CASE status WHEN 'queued' THEN 'called' ELSE status END, updated_at = ?3
         WHERE id = ?1 RETURNING *`,
      )
      .bind(call.id, vapiCallId, nowIso())
      .first<CallRow>();
    return json({ call: callJson(row!) });
  });

  router.add('POST', '/calls/:id/failed', 'user', async ({ req, env, params, user }: Ctx) => {
    const db = env.DB;
    const id = positiveInt(params.id, 'id');
    const body = asObject(await readJson(req));
    const reason = body.reason === undefined ? 'client error' : trimmedString(body.reason, 'reason', 1, 500);
    await ownCall(db, id, user!.id);
    const row = await db
      .prepare(
        `UPDATE calls SET status = CASE WHEN status IN ('queued', 'called') THEN 'failed' ELSE status END,
                          error = CASE WHEN status IN ('queued', 'called') THEN ?2 ELSE error END,
                          updated_at = ?3
         WHERE id = ?1 RETURNING *`,
      )
      .bind(id, reason, nowIso())
      .first<CallRow>();
    return json({ call: callJson(row!) });
  });

  router.add('GET', '/calls/latest', 'user', async ({ env, user }: Ctx) => {
    const db = env.DB;
    const [, latest] = await db.batch([
      staleSweepStatement(db, user!.id),
      db.prepare('SELECT * FROM calls WHERE user_id = ? ORDER BY id DESC LIMIT 1').bind(user!.id),
    ]);
    const row = (latest as D1Result<CallRow>).results[0];
    return json({ call: row ? callJson(row) : null });
  });

  router.add('POST', '/vapi/webhook/:token', 'none', ({ req, env, params }: Ctx) =>
    handleVapiWebhook(req, env, params.token!),
  );
}
