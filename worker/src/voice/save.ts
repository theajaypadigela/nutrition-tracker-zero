import type { CallRow } from '../db/queries';
import { prepareItems, type NewItem } from '../domain/items';
import { conflict, nowIso } from '../http';

/** Compare-and-swap guards the whole batch, so concurrent redelivery cannot undo a correction. */
export async function saveConfirmedFoods(db: D1Database, userId: string, original: CallRow, toolId: string,
  items: ReturnType<typeof prepareItems>): Promise<string> {
  let call = original;
  const payload = items.map((i: NewItem) => ({ id: i.id, meal: i.meal, rawName: i.rawName, normalizedName: i.normalizedName,
    quantity: i.quantity, unit: i.unit, foodId: i.foodId, status: i.status }));
  for (let attempt = 0; attempt < 4; attempt++) {
    if (call.ended_reason) throw conflict('call_ended', 'This call has already ended');
    const processed = JSON.parse(call.processed_tool_call_ids) as { id: string; n: number }[];
    const prior = processed.find(p => p.id === toolId);
    if (prior) return `Saved ${prior.n} items`;
    const now = nowIso();
    const guard = 'SELECT 1 FROM calls WHERE id = ?1 AND processed_tool_call_ids = ?3 AND ended_reason IS NULL';
    const results = await db.batch([
      db.prepare(`DELETE FROM log_items WHERE user_id = ?4 AND call_id = ?2 AND source = 'call' AND EXISTS (${guard})`)
        .bind(call.id, call.provider_call_id!, call.processed_tool_call_ids, userId),
      db.prepare(`INSERT INTO log_items (id, user_id, local_date, meal, raw_name, normalized_name, quantity, unit, food_id, status, call_id, source, created_at)
        SELECT j.value ->> '$.id', ?4, ?5, j.value ->> '$.meal', j.value ->> '$.rawName', j.value ->> '$.normalizedName',
          j.value ->> '$.quantity', j.value ->> '$.unit', j.value ->> '$.foodId', j.value ->> '$.status', ?2, 'call', ?6
        FROM json_each(?7) AS j WHERE EXISTS (${guard})`)
        .bind(call.id, call.provider_call_id!, call.processed_tool_call_ids, userId, call.local_date, now, JSON.stringify(payload)),
      db.prepare(`UPDATE calls SET status = 'tool_saved', processed_tool_call_ids = json_insert(processed_tool_call_ids, '$[#]', json(?2)), updated_at = ?4
        WHERE id = ?1 AND processed_tool_call_ids = ?3 AND ended_reason IS NULL RETURNING id`)
        .bind(call.id, JSON.stringify({ id: toolId, n: items.length }), call.processed_tool_call_ids, now),
    ]);
    if (results[2]!.results.length) return `Saved ${items.length} items`;
    const fresh = await db.prepare('SELECT * FROM calls WHERE id = ?1 AND user_id = ?2').bind(call.id, userId).first<CallRow>();
    if (!fresh) throw conflict('call_ended', 'This call is no longer available');
    call = fresh;
  }
  throw conflict('voice_save_busy', 'Another meal save is in progress. Retry save_foods with the confirmed list.');
}

/** Completion is scoped to the call date, and redelivery must not undo a later manual change. */
export async function markConfirmedDay(db: D1Database, userId: string, original: CallRow, toolId: string): Promise<string> {
  let call = original;
  const result = 'Day marked complete';
  for (let attempt = 0; attempt < 4; attempt++) {
    const processed = JSON.parse(call.processed_tool_call_ids) as { id: string }[];
    if (processed.some(p => p.id === toolId)) return result;
    if (call.ended_reason) throw conflict('call_ended', 'This call has already ended');
    const now = nowIso();
    const results = await db.batch([
      db.prepare(`INSERT INTO day_status (user_id, local_date, status, updated_at)
        SELECT ?1, ?2, 'complete', ?3 WHERE EXISTS (
          SELECT 1 FROM calls WHERE id = ?4 AND user_id = ?1 AND processed_tool_call_ids = ?5 AND ended_reason IS NULL)
        ON CONFLICT (user_id, local_date) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`)
        .bind(userId, call.local_date, now, call.id, call.processed_tool_call_ids),
      db.prepare(`UPDATE calls SET processed_tool_call_ids = json_insert(processed_tool_call_ids, '$[#]', json(?2)), updated_at = ?4
        WHERE id = ?1 AND processed_tool_call_ids = ?3 AND ended_reason IS NULL RETURNING id`)
        .bind(call.id, JSON.stringify({ id: toolId, result }), call.processed_tool_call_ids, now),
    ]);
    if (results[1]!.results.length) return result;
    const fresh = await db.prepare('SELECT * FROM calls WHERE id = ?1 AND user_id = ?2').bind(call.id, userId).first<CallRow>();
    if (!fresh) throw conflict('call_ended', 'This call is no longer available');
    call = fresh;
  }
  throw conflict('voice_save_busy', 'Another save is in progress. Retry marking the day complete.');
}
