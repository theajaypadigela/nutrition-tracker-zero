import { badRequest, json, notFound, nowIso, readJson } from '../http';
import {
  callJson,
  indexFromResults,
  indexStatements,
  insertItemsStatement,
  itemJson,
  loadIndex,
  staleSweepStatement,
  type CallRow,
  type LogItemRow,
} from '../db/queries';
import { parseItemList, prepareItems } from '../domain/items';
import { itemNutrients, sumNutrients } from '../domain/nutrition';
import { addDays, daysBetween, isValidDate } from '../domain/time';
import type { Ctx, Router } from '../router';
import { asObject, positiveInt } from '../validate';
import { goalsFromRows, goalsStatement } from './settings';

const MAX_RANGE_DAYS = 62;

function parseDate(value: string | null | undefined, field = 'date'): string {
  if (!value || !isValidDate(value)) throw badRequest(`${field} must be YYYY-MM-DD`);
  return value;
}

export function registerDays(router: Router) {
  router.add('GET', '/days/:date', 'user', async ({ env, params, user }: Ctx) => {
    const db = env.DB;
    const date = parseDate(params.date);
    const userId = user!.id;
    const results = await db.batch([
      staleSweepStatement(db, userId),
      ...indexStatements(db),
      db
        .prepare('SELECT * FROM log_items WHERE user_id = ?1 AND local_date = ?2 ORDER BY created_at, id')
        .bind(userId, date),
      db.prepare('SELECT * FROM calls WHERE user_id = ?1 AND local_date = ?2 ORDER BY id').bind(userId, date),
      goalsStatement(db, userId),
    ]);
    const index = indexFromResults(results.slice(1, 4));
    const rows = (results[4] as D1Result<LogItemRow>).results;
    const calls = (results[5] as D1Result<CallRow>).results;
    const goals = goalsFromRows((results[6] as D1Result<{ nutrient: string; target: number }>).results);

    const items = rows.map((r) => itemJson(index, r));
    return json({
      date,
      items,
      totals: sumNutrients(items.map((i) => i.nutrients)),
      goals,
      pendingCount: items.filter((i) => i.status !== 'resolved').length,
      calls: calls.map((c) => callJson(c, c.status === 'no_list')),
    });
  });

  router.add('GET', '/days', 'user', async ({ env, url, user }: Ctx) => {
    const db = env.DB;
    const from = parseDate(url.searchParams.get('from'), 'from');
    const to = parseDate(url.searchParams.get('to'), 'to');
    const span = daysBetween(from, to);
    if (span < 0 || span >= MAX_RANGE_DAYS) throw badRequest(`Range must be 1-${MAX_RANGE_DAYS} days`);
    const results = await db.batch([
      ...indexStatements(db),
      db
        .prepare(
          `SELECT local_date, food_id, quantity, unit, status FROM log_items
           WHERE user_id = ?1 AND local_date BETWEEN ?2 AND ?3`,
        )
        .bind(user!.id, from, to),
      goalsStatement(db, user!.id),
    ]);
    const index = indexFromResults(results.slice(0, 3));
    const rows = (results[3] as D1Result<Pick<LogItemRow, 'local_date' | 'food_id' | 'quantity' | 'unit' | 'status'>>).results;
    const goals = goalsFromRows((results[4] as D1Result<{ nutrient: string; target: number }>).results);

    const byDate = new Map<string, typeof rows>();
    for (const r of rows) {
      const list = byDate.get(r.local_date) ?? [];
      list.push(r);
      byDate.set(r.local_date, list);
    }
    const days = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const list = byDate.get(d) ?? [];
      days.push({
        date: d,
        itemCount: list.length,
        pendingCount: list.filter((r) => r.status !== 'resolved').length,
        totals: sumNutrients(list.map((r) => itemNutrients(index, r))),
      });
    }
    return json({ from, to, days, goals });
  });

  router.add('POST', '/days/:date/items', 'user', async ({ req, env, params, user }: Ctx) => {
    const db = env.DB;
    const date = parseDate(params.date);
    const body = asObject(await readJson(req));
    const parsed = parseItemList(body.items);
    if ('error' in parsed) throw badRequest(parsed.error);

    let callId: string | null = null;
    if (body.callId !== undefined && body.callId !== null) {
      const id = positiveInt(String(body.callId), 'callId');
      const call = await db
        .prepare('SELECT vapi_call_id FROM calls WHERE id = ?1 AND user_id = ?2')
        .bind(id, user!.id)
        .first<{ vapi_call_id: string | null }>();
      if (!call) throw notFound('Call not found');
      callId = call.vapi_call_id;
    }

    const index = await loadIndex(db);
    const items = prepareItems(index, parsed.items);
    const createdAt = nowIso();
    await insertItemsStatement(db, items, { userId: user!.id, localDate: date, callId, source: 'manual', createdAt }).run();
    const rows: LogItemRow[] = items.map((i) => ({
      id: i.id,
      user_id: user!.id,
      local_date: date,
      meal: i.meal,
      raw_name: i.rawName,
      normalized_name: i.normalizedName,
      quantity: i.quantity,
      unit: i.unit,
      food_id: i.foodId,
      status: i.status,
      call_id: callId,
      source: 'manual',
      created_at: createdAt,
    }));
    return json({ items: rows.map((r) => itemJson(index, r)) }, 201);
  });
}
