import { badRequest, json, noContent, notFound, nowIso, readJson } from '../http';
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
import { itemNutrients, sumNutrients } from '../domain/intake/items';
import { classifyDay } from '../domain/quality/days';
import { dayTargetsOn } from '../domain/report/weekly';
import { addDays, daysBetween, isValidDate, localDateIn } from '../domain/time';
import type { Ctx, Router } from '../router';
import { asObject, positiveInt } from '../validate';
import { goalStateFromResults, goalStatements, goalsView, modeOf, overridesOf } from '../health';

const MAX_RANGE_DAYS = 62;

/** What a person can say about a day (plan 7.2): it is complete, it looks incomplete, or leave it out of the reports. */
const DAY_STATUSES = ['complete', 'partial', 'skip'] as const;
type DayStatus = (typeof DAY_STATUSES)[number];

/** The nutrients whose goal is a number the person typed (their own or their care team's). */
const typedKeys = (view: ReturnType<typeof goalsView>) =>
  Object.entries(view.origins)
    .filter(([, origin]) => origin === 'custom' || origin === 'care_team')
    .map(([key]) => key);

function parseDate(value: string | null | undefined, field = 'date'): string {
  if (!value || !isValidDate(value)) throw badRequest(`${field} must be YYYY-MM-DD`);
  return value;
}

export function registerDays(router: Router) {
  router.add('GET', '/days/:date', 'user', async ({ env, params, user, unlocked }: Ctx) => {
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
      db.prepare('SELECT status FROM day_status WHERE user_id = ?1 AND local_date = ?2').bind(userId, date),
      ...goalStatements(db, userId, unlocked),
    ]);
    const index = indexFromResults(results.slice(1, 4));
    const rows = (results[4] as D1Result<LogItemRow>).results;
    const calls = (results[5] as D1Result<CallRow>).results;
    const mark = (results[6] as D1Result<{ status: DayStatus }>).results[0]?.status ?? null;
    const state = goalStateFromResults(results.slice(7), unlocked);
    const today = localDateIn(user!.timezone);
    const view = goalsView({ state, today, unlocked });

    const items = rows.map((r) => itemJson(index, r));
    // Whether the day counts in the weekly figures, by the report's own rules (plan 7.2), so Today can ask about a day that looks
    // incomplete. Without the secret it is judged as for a profile without personal targets: nothing personal is used or revealed.
    const mode = unlocked && state.profile ? modeOf(state.profile) : 'generic';
    const limits = dayTargetsOn({ mode, targetSets: mode === 'personalised' ? state.sets : [], overrides: overridesOf(state.goals), today }, date);
    const counted = classifyDay(
      { date, mark, items: items.map((i) => ({ foodId: i.foodId, name: i.rawName, pending: i.status !== 'resolved', nutrients: { calories: i.nutrients.calories } })) },
      today,
      limits,
    );
    return json({
      date,
      /** The person's own mark on the day, or null. */
      status: mark,
      /** How the weekly figures read the day: counted (`valid`, `confirmed`), not (`partial` with why, `empty`, `skipped`), or still today. */
      dayState: { state: counted.state, reason: counted.reason ?? null },
      items,
      totals: sumNutrients(items.map((i) => i.nutrients)),
      goals: view.goals,
      customGoals: typedKeys(view),
      pendingCount: items.filter((i) => i.status !== 'resolved').length,
      calls: calls.map((c) => callJson(c, c.status === 'no_list')),
    });
  });

  router.add('GET', '/days', 'user', async ({ env, url, user, unlocked }: Ctx) => {
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
      db.prepare('SELECT local_date, status FROM day_status WHERE user_id = ?1 AND local_date BETWEEN ?2 AND ?3').bind(user!.id, from, to),
      ...goalStatements(db, user!.id, unlocked),
    ]);
    const index = indexFromResults(results.slice(0, 3));
    const rows = (results[3] as D1Result<Pick<LogItemRow, 'local_date' | 'food_id' | 'quantity' | 'unit' | 'status'>>).results;
    const marks = new Map((results[4] as D1Result<{ local_date: string; status: DayStatus }>).results.map((m) => [m.local_date, m.status]));
    const view = goalsView({ state: goalStateFromResults(results.slice(5), unlocked), today: localDateIn(user!.timezone), unlocked });

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
        status: marks.get(d) ?? null,
        itemCount: list.length,
        pendingCount: list.filter((r) => r.status !== 'resolved').length,
        totals: sumNutrients(list.map((r) => itemNutrients(index, r))),
      });
    }
    return json({ from, to, days, goals: view.goals, customGoals: typedKeys(view) });
  });

  // "This day is complete / looks incomplete / leave it out of my reports" (illness, travel, fasting, a festival): plan 7.2, 9.3.
  // Only today or a day gone by can be marked, and the mark says nothing about why.
  router.add('PUT', '/days/:date/status', 'user', async ({ req, env, params, user }: Ctx) => {
    const date = parseDate(params.date);
    if (date > localDateIn(user!.timezone)) throw badRequest('Only today or a day gone by can be marked');
    const status = asObject(await readJson(req)).status;
    if (typeof status !== 'string' || !(DAY_STATUSES as readonly string[]).includes(status)) {
      throw badRequest(`status must be one of ${DAY_STATUSES.join(', ')}`);
    }
    await env.DB
      .prepare(
        `INSERT INTO day_status (user_id, local_date, status, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (user_id, local_date) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
      )
      .bind(user!.id, date, status, nowIso())
      .run();
    return json({ date, status });
  });

  router.add('DELETE', '/days/:date/status', 'user', async ({ env, params, user }: Ctx) => {
    const date = parseDate(params.date);
    await env.DB.prepare('DELETE FROM day_status WHERE user_id = ?1 AND local_date = ?2').bind(user!.id, date).run();
    return noContent();
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
        .prepare('SELECT COALESCE(provider_call_id, vapi_call_id) AS vapi_call_id FROM calls WHERE id = ?1 AND user_id = ?2')
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
