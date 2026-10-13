import { buildIndex, type AliasRow, type Food, type FoodIndex, type UnitRow } from '../domain/match';
import { NUTRIENTS, type NutrientValues } from '../domain/nutrients';
import type { BaseUnit } from '../domain/units';
import type { NewItem } from '../domain/items';
import { itemNutrients, itemWeight } from '../domain/intake/items';
import { checkAmount } from '../domain/quality/items';
import { transcriptExpired } from '../maintenance';

export interface UserRow {
  id: string;
  name: string;
  timezone: string;
  call_time: string | null;
  call_enabled: number;
  vapi_public_key: string | null;
  webhook_token: string;
  /** SHA-256 of the profile's secret; null until a legacy profile claims one. Never returned by any route. */
  secret_hash: string | null;
  /** PBKDF2 hash of the account password (see auth.ts); null for a profile made before accounts. Never returned by any route. */
  password_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface CallRow {
  id: number;
  vapi_call_id: string | null;
  user_id: string;
  local_date: string;
  kind: 'scheduled' | 'retry' | 'test' | 'manual' | 'unknown';
  status: 'queued' | 'called' | 'tool_saved' | 'no_list' | 'failed';
  ended_reason: string | null;
  transcript: string | null;
  duration_seconds: number | null;
  error: string | null;
  processed_tool_call_ids: string;
  created_at: string;
  updated_at: string;
}

export interface LogItemRow {
  id: string;
  user_id: string;
  local_date: string;
  meal: string | null;
  raw_name: string;
  normalized_name: string;
  quantity: number;
  unit: string;
  food_id: string | null;
  status: 'resolved' | 'pending_food' | 'pending_unit';
  call_id: string | null;
  source: 'call' | 'manual' | 'import';
  created_at: string;
}

export type FoodRow = {
  id: string;
  name: string;
  display_name: string;
  base_unit: string;
  added_by: string | null;
  created_at: string;
  updated_at: string;
} & Record<string, unknown>;

export function foodFromRow(row: FoodRow): Food {
  const nutrients = {} as NutrientValues;
  for (const n of NUTRIENTS) {
    const v = row[n.column];
    nutrients[n.key] = typeof v === 'number' ? v : null;
  }
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name,
    baseUnit: row.base_unit as BaseUnit,
    nutrients,
    source: (typeof row.source === 'string' ? row.source : null) as Food['source'],
    reviewedAt: typeof row.reviewed_at === 'string' ? row.reviewed_at : null,
    form: (typeof row.form === 'string' ? row.form : null) as Food['form'],
  };
}

export async function getUser(db: D1Database, id: string): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
}

export function indexStatements(db: D1Database): D1PreparedStatement[] {
  return [
    db.prepare('SELECT * FROM foods'),
    db.prepare('SELECT alias, food_id FROM food_aliases'),
    db.prepare('SELECT food_id, unit, servings FROM food_units'),
  ];
}

export function indexFromResults(results: D1Result[]): FoodIndex {
  const [foods, aliases, units] = results as [D1Result<FoodRow>, D1Result<AliasRow>, D1Result<UnitRow>];
  return buildIndex(foods.results.map(foodFromRow), aliases.results, units.results);
}

/** Loads the whole shared cache in one round trip (three SELECTs). */
export async function loadIndex(db: D1Database): Promise<FoodIndex> {
  return indexFromResults(await db.batch(indexStatements(db)));
}

/** One statement for any number of items (json_each avoids the 100-parameter limit). */
export function insertItemsStatement(
  db: D1Database,
  items: NewItem[],
  common: { userId: string; localDate: string; callId: string | null; source: 'call' | 'manual' | 'import'; createdAt: string },
): D1PreparedStatement {
  const payload = items.map((i) => ({
    id: i.id,
    meal: i.meal,
    rawName: i.rawName,
    normalizedName: i.normalizedName,
    quantity: i.quantity,
    unit: i.unit,
    foodId: i.foodId,
    status: i.status,
  }));
  return db
    .prepare(
      `INSERT INTO log_items (id, user_id, local_date, meal, raw_name, normalized_name, quantity, unit, food_id, status, call_id, source, created_at)
       SELECT j.value ->> '$.id', ?1, ?2, j.value ->> '$.meal', j.value ->> '$.rawName', j.value ->> '$.normalizedName',
              j.value ->> '$.quantity', j.value ->> '$.unit', j.value ->> '$.foodId', j.value ->> '$.status', ?3, ?4, ?5
       FROM json_each(?6) AS j`,
    )
    .bind(common.userId, common.localDate, common.callId, common.source, common.createdAt, JSON.stringify(payload));
}

export const STALE_CALL_MS = 2 * 60 * 60 * 1000;

/** Lazy safety net (PLAN.md §9.1): closes calls that never got a webhook. */
export function staleSweepStatement(db: D1Database, userId: string, now = new Date()): D1PreparedStatement {
  const cutoff = new Date(now.getTime() - STALE_CALL_MS).toISOString();
  return db
    .prepare(
      `UPDATE calls SET
         status = CASE status WHEN 'called' THEN 'no_list' ELSE 'failed' END,
         ended_reason = CASE WHEN status = 'called' THEN COALESCE(ended_reason, 'no-end-of-call-report') ELSE ended_reason END,
         error = CASE WHEN status = 'queued' THEN COALESCE(error, 'call never started') ELSE error END,
         updated_at = ?3
       WHERE user_id = ?1 AND status IN ('called', 'queued') AND created_at < ?2`,
    )
    .bind(userId, cutoff, now.toISOString());
}

export function itemJson(index: FoodIndex, row: LogItemRow) {
  const food = row.food_id ? index.byId.get(row.food_id) : undefined;
  const nutrients = itemNutrients(index, row);
  return {
    id: row.id,
    localDate: row.local_date,
    meal: row.meal,
    rawName: row.raw_name,
    normalizedName: row.normalized_name,
    quantity: row.quantity,
    unit: row.unit,
    foodId: row.food_id,
    foodName: food?.displayName ?? null,
    baseUnit: food?.baseUnit ?? null,
    status: row.status,
    source: row.source,
    callId: row.call_id,
    createdAt: row.created_at,
    nutrients,
    /** What the amount comes to in grams or millilitres, when the food says (plan 7.7). */
    weight: itemWeight(index, row),
    /** An amount worth a second look (a mishearing, a typo), or null: it still counts (plan 7.7). */
    amountCheck: checkAmount({ quantity: row.quantity, unit: row.unit, kcal: row.status === 'resolved' ? nutrients.calories : null }),
  };
}

export function callJson(row: CallRow, withTranscript = false) {
  return {
    id: row.id,
    vapiCallId: row.vapi_call_id,
    localDate: row.local_date,
    kind: row.kind,
    status: row.status,
    endedReason: row.ended_reason,
    durationSeconds: row.duration_seconds,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // A transcript past its retention period is never served, whether or not the daily purge has run (plan 8.3.3).
    ...(withTranscript ? { transcript: transcriptExpired(row.created_at) ? null : row.transcript } : {}),
  };
}
