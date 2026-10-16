import { WEBHOOK_TOKEN_RE } from '../auth';
import { HttpError, json, nowIso, readJson } from '../http';
import { insertItemsStatement, loadIndex, type CallRow, type UserRow } from '../db/queries';
import { callbackReply, parseCallbackMinutes } from '../domain/callback';
import { FEATURES } from '../domain/features';
import { parseItemList, prepareItems } from '../domain/items';
import type { FoodIndex } from '../domain/match';
import { isValidDate, localDateIn } from '../domain/time';
import { markConfirmedDay } from '../voice/save';
import { MARK_DAY_COMPLETE, SAVE_FOODS, SCHEDULE_CALLBACK } from './assistant';
import {
  callIdOf,
  endOfCallReportOf,
  isStartFailure,
  messageOf,
  messageType,
  metadataOf,
  parseArguments,
  toolCallsOf,
} from './parse';

const MAX_BODY = 2 * 1024 * 1024;

interface Processed {
  id: string;
  n?: number;
  result?: string;
}

type Msg = Record<string, unknown>;

function log(event: Record<string, unknown>) {
  // Ids and statuses only: never keys, transcripts or payload bodies.
  console.log(JSON.stringify({ evt: 'vapi', ...event }));
}

const saved = (n: number) => `Saved ${n} item${n === 1 ? '' : 's'}`;

/** Finds the call by Vapi id, then by metadata.callRowId (same user), else records an 'unknown' call. */
async function findOrCreateCall(db: D1Database, user: UserRow, msg: Msg): Promise<CallRow | null> {
  const vapiId = callIdOf(msg);
  if (vapiId) {
    const row = await db.prepare('SELECT * FROM calls WHERE vapi_call_id = ?').bind(vapiId).first<CallRow>();
    if (row) return row.user_id === user.id ? row : null;
  }
  const meta = metadataOf(msg);
  const now = nowIso();
  if (meta.callRowId !== null) {
    const row = await db
      .prepare(
        `UPDATE calls SET vapi_call_id = COALESCE(vapi_call_id, ?3),
                          status = CASE status WHEN 'queued' THEN 'called' ELSE status END,
                          updated_at = ?4
         WHERE id = ?1 AND user_id = ?2 AND (vapi_call_id IS NULL OR vapi_call_id = ?3 OR ?3 IS NULL)
         RETURNING *`,
      )
      .bind(meta.callRowId, user.id, vapiId, now)
      .first<CallRow>();
    if (row) return row;
  }
  const localDate = meta.localDate && isValidDate(meta.localDate) ? meta.localDate : localDateIn(user.timezone);
  const row = await db
    .prepare(
      `INSERT INTO calls (vapi_call_id, user_id, local_date, kind, status, created_at, updated_at)
       VALUES (?1, ?2, ?3, 'unknown', 'called', ?4, ?4)
       ON CONFLICT (vapi_call_id) DO UPDATE SET updated_at = excluded.updated_at
       RETURNING *`,
    )
    .bind(vapiId, user.id, localDate, now)
    .first<CallRow>();
  return row && row.user_id === user.id ? row : null;
}

async function handleToolCalls(db: D1Database, user: UserRow, call: CallRow | null, msg: Msg): Promise<Response> {
  const results: Record<string, string>[] = [];
  const processed = JSON.parse(call?.processed_tool_call_ids ?? '[]') as Processed[];
  let index: FoodIndex | null = null;

  for (const tc of toolCallsOf(msg)) {
    if (tc.name === SCHEDULE_CALLBACK) {
      // Only the phone can ring itself: the app arms the reminder from the same message. The server's part is to check the minutes and
      // say what the person should hear, the way it answers the other tools. Nothing is stored.
      const asked = parseCallbackMinutes(tc.arguments);
      results.push(
        'error' in asked
          ? { name: tc.name, toolCallId: tc.id, error: asked.error }
          : { name: tc.name, toolCallId: tc.id, result: callbackReply(asked.minutes, Date.now() + asked.minutes * 60_000, user.timezone) },
      );
      continue;
    }
    if (tc.name === MARK_DAY_COMPLETE && !FEATURES.dayCompletion) {
      results.push({ name: tc.name, toolCallId: tc.id, error: 'Marking a day complete is not available. Say a short goodbye and end the call.' });
      continue;
    }
    if (tc.name !== SAVE_FOODS && tc.name !== MARK_DAY_COMPLETE) {
      results.push({ name: tc.name, toolCallId: tc.id, error: `Unknown tool ${tc.name}.` });
      continue;
    }
    if (!call) {
      results.push({ name: tc.name, toolCallId: tc.id, error: 'This call could not be matched to the user.' });
      continue;
    }
    const prior = processed.find((p) => p.id === tc.id);
    if (prior) {
      // Redelivery: change nothing, answer the same.
      log({ type: 'tool-calls', callRowId: call.id, outcome: 'duplicate' });
      results.push({ name: tc.name, toolCallId: tc.id, result: prior.result ?? saved(prior.n!) });
      continue;
    }
    const args = parseArguments(tc.arguments);
    if (tc.name === MARK_DAY_COMPLETE) {
      if (args?.confirmed !== true) {
        results.push({ name: tc.name, toolCallId: tc.id, error: 'Ask whether to mark the day complete and wait for an explicit yes before retrying.' });
        continue;
      }
      // A previous tool in the same message may have changed the deduplication state.
      const fresh = await db.prepare('SELECT * FROM calls WHERE id = ?1 AND user_id = ?2').bind(call.id, user.id).first<CallRow>();
      try {
        const result = await markConfirmedDay(db, user.id, fresh ?? call, tc.id);
        processed.push({ id: tc.id, result });
        results.push({ name: tc.name, toolCallId: tc.id, result });
      } catch {
        results.push({ name: tc.name, toolCallId: tc.id, error: 'The day could not be marked complete. Please retry or mark it in Today.' });
      }
      continue;
    }
    const parsed = parseItemList(args?.items);
    if ('error' in parsed) {
      log({ type: 'tool-calls', callRowId: call.id, outcome: 'invalid' });
      results.push({
        name: tc.name,
        toolCallId: tc.id,
        error: `${parsed.error} Fix it and call save_foods again with the full list.`.replace(/\s+/g, ' '),
      });
      continue;
    }

    index ??= await loadIndex(db);
    const items = prepareItems(index, parsed.items);
    const now = nowIso();
    const entry: Processed = { id: tc.id, n: items.length };
    const statements: D1PreparedStatement[] = [];
    if (call.vapi_call_id) {
      // A second save in the same call replaces that call's items, so corrections never duplicate.
      statements.push(
        db
          .prepare(`DELETE FROM log_items WHERE user_id = ?1 AND call_id = ?2 AND source = 'call'`)
          .bind(user.id, call.vapi_call_id),
      );
    }
    statements.push(
      insertItemsStatement(db, items, {
        userId: user.id,
        localDate: call.local_date,
        callId: call.vapi_call_id,
        source: 'call',
        createdAt: now,
      }),
      db
        .prepare(
          `UPDATE calls SET status = 'tool_saved',
                            processed_tool_call_ids = json_insert(processed_tool_call_ids, '$[#]', json(?1)),
                            updated_at = ?2
           WHERE id = ?3`,
        )
        .bind(JSON.stringify(entry), now, call.id),
    );
    await db.batch(statements);
    processed.push(entry);
    log({ type: 'tool-calls', callRowId: call.id, outcome: 'saved', items: items.length });
    results.push({ name: tc.name, toolCallId: tc.id, result: saved(items.length) });
  }
  return json({ results });
}

async function handleEndOfCall(db: D1Database, call: CallRow | null, msg: Msg): Promise<Response> {
  if (!call) return json({});
  const report = endOfCallReportOf(msg);
  const fallback = isStartFailure(report.endedReason) ? 'failed' : 'no_list';
  const row = await db
    .prepare(
      `UPDATE calls SET
         status = CASE WHEN status = 'tool_saved' THEN 'tool_saved' ELSE ?2 END,
         error = CASE WHEN status <> 'tool_saved' AND ?2 = 'failed' THEN COALESCE(error, ?3) ELSE error END,
         ended_reason = ?3, transcript = ?4, duration_seconds = ?5, updated_at = ?6
       WHERE id = ?1
       RETURNING status`,
    )
    .bind(call.id, fallback, report.endedReason, report.transcript, report.durationSeconds, nowIso())
    .first<{ status: string }>();
  log({ type: 'end-of-call-report', callRowId: call.id, status: row?.status, endedReason: report.endedReason });
  return json({});
}

/** POST /vapi/webhook/:token (PLAN.md §9.4). Always 200 except for a bad token. */
export async function handleVapiWebhook(req: Request, env: Env, token: string): Promise<Response> {
  if (!WEBHOOK_TOKEN_RE.test(token)) throw new HttpError(401, 'unauthorized', 'Unknown webhook token');
  const user = await env.DB.prepare('SELECT * FROM users WHERE webhook_token = ?').bind(token).first<UserRow>();
  if (!user) throw new HttpError(401, 'unauthorized', 'Unknown webhook token');

  let body: unknown;
  try {
    body = await readJson(req, MAX_BODY);
  } catch (err) {
    log({ type: 'unreadable', status: err instanceof HttpError ? err.status : 0 });
    return json({});
  }
  const msg = messageOf(body);
  const type = msg ? messageType(msg) : '';
  if (!msg || (type !== 'tool-calls' && type !== 'end-of-call-report')) return json({});

  const call = await findOrCreateCall(env.DB, user, msg);
  if (!call) log({ type, outcome: 'call-mismatch' });
  return type === 'tool-calls' ? handleToolCalls(env.DB, user, call, msg) : handleEndOfCall(env.DB, call, msg);
}
