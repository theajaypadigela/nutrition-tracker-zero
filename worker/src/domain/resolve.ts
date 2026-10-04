import { indexFromResults, indexStatements } from '../db/queries';
import type { FoodIndex } from './match';
import { resolveItem, type ItemStatus } from './nutrition';

interface AffectedRow {
  id: string;
  normalized_name: string;
  unit: string;
  food_id: string | null;
  status: ItemStatus;
}

export interface ItemChange {
  id: string;
  foodId: string | null;
  status: ItemStatus;
}

export interface CascadeResult {
  index: FoodIndex;
  /** Items that went from pending to resolved. */
  resolvedCount: number;
  /** Items that went from resolved back to pending (e.g. a base-unit change). */
  repended: number;
  changed: number;
}

/** Pure part: the new status of every affected item, using the same factor() as reads. */
export function planChanges(index: FoodIndex, rows: AffectedRow[]): ItemChange[] {
  const changes: ItemChange[] = [];
  for (const row of rows) {
    const next = resolveItem(index, row.normalized_name, row.unit);
    if (next.foodId !== row.food_id || next.status !== row.status) changes.push({ id: row.id, ...next });
  }
  return changes;
}

const CHUNK = 500;

/**
 * Applies `writes` (food/alias/unit changes) and, in the same transaction, reads the new cache plus
 * every item linked to `foodIds` or pending under one of `names`. Then re-resolves those items for all
 * users with one UPDATE … FROM json_each per 500 changes (PLAN.md §7).
 */
export async function runCascade(
  db: D1Database,
  writes: D1PreparedStatement[],
  scope: { foodIds: string[]; names: string[] },
): Promise<CascadeResult> {
  const affected = db
    .prepare(
      `SELECT id, normalized_name, unit, food_id, status FROM log_items
       WHERE food_id IN (SELECT value FROM json_each(?1))
          OR (status = 'pending_food' AND normalized_name IN (SELECT value FROM json_each(?2)))`,
    )
    .bind(JSON.stringify(scope.foodIds), JSON.stringify(scope.names));
  const results = await db.batch([...writes, ...indexStatements(db), affected]);
  const tail = results.slice(writes.length);
  const index = indexFromResults(tail.slice(0, 3));
  const rows = (tail[3] as D1Result<AffectedRow>).results;
  const before = new Map(rows.map((r) => [r.id, r.status]));
  const changes = planChanges(index, rows);

  if (changes.length > 0) {
    const updates: D1PreparedStatement[] = [];
    for (let i = 0; i < changes.length; i += CHUNK) {
      updates.push(
        db
          .prepare(
            `UPDATE log_items SET food_id = u.value ->> '$.foodId', status = u.value ->> '$.status'
             FROM json_each(?1) AS u WHERE log_items.id = u.value ->> '$.id'`,
          )
          .bind(JSON.stringify(changes.slice(i, i + CHUNK))),
      );
    }
    await db.batch(updates);
  }

  let resolvedCount = 0;
  let repended = 0;
  for (const c of changes) {
    const was = before.get(c.id);
    if (c.status === 'resolved' && was !== 'resolved') resolvedCount++;
    if (c.status !== 'resolved' && was === 'resolved') repended++;
  }
  return { index, resolvedCount, repended, changed: changes.length };
}
