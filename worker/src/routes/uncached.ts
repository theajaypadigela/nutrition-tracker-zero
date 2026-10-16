import { json } from '../http';
import { indexFromResults, indexStatements } from '../db/queries';
import type { FoodIndex } from '../domain/match';
import { suggest } from '../domain/suggest';
import type { Ctx, Router } from '../router';

interface PendingFoodGroup {
  normalized_name: string;
  item_count: number;
  user_count: number;
  mine_items: number;
  last_date: string;
  examples: string;
  units: string;
}

interface PendingUnitGroup {
  food_id: string;
  unit: string;
  item_count: number;
  user_count: number;
  mine_items: number;
  last_date: string;
}

interface Counts {
  unknown_foods: number;
  missing_units: number;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

/**
 * The pending foods (`unknownFoods`) and the pending unit conversions (`missingUnits`), grouped. One query shape serves both scopes:
 * `?1` is the person to count as "mine" (an id nobody has when the request names no one), and `scope` is either everything logged by
 * anyone or only what this person logged. A group's `mine_items` is how many of its items are this person's, so the shared list can say
 * "you logged this" without saying who else did: counts are the only thing that ever leaves another person's log.
 */
function pendingStatements(db: D1Database, userId: string, scope: 'everyone' | 'mine', limit: number): D1PreparedStatement[] {
  const where = scope === 'mine' ? 'AND user_id = ?1' : '';
  return [
    db
      .prepare(
        `SELECT normalized_name, COUNT(*) AS item_count, COUNT(DISTINCT user_id) AS user_count,
                SUM(CASE WHEN user_id = ?1 THEN 1 ELSE 0 END) AS mine_items, MAX(local_date) AS last_date,
                json_group_array(DISTINCT raw_name) AS examples, json_group_array(DISTINCT unit) AS units
         FROM log_items WHERE status = 'pending_food' ${where}
         GROUP BY normalized_name ORDER BY ${scope === 'mine' ? 'last_date DESC, item_count DESC' : 'item_count DESC'}, normalized_name LIMIT ?2`,
      )
      .bind(userId, limit),
    db
      .prepare(
        `SELECT food_id, unit, COUNT(*) AS item_count, COUNT(DISTINCT user_id) AS user_count,
                SUM(CASE WHEN user_id = ?1 THEN 1 ELSE 0 END) AS mine_items, MAX(local_date) AS last_date
         FROM log_items WHERE status = 'pending_unit' ${where}
         GROUP BY food_id, unit ORDER BY ${scope === 'mine' ? 'last_date DESC, item_count DESC' : 'item_count DESC'}, unit LIMIT ?2`,
      )
      .bind(userId, limit),
    (() => {
      const counts = db.prepare(
        `SELECT
           (SELECT COUNT(DISTINCT normalized_name) FROM log_items WHERE status = 'pending_food' ${where}) AS unknown_foods,
           (SELECT COUNT(*) FROM (SELECT 1 FROM log_items WHERE status = 'pending_unit' ${where} GROUP BY food_id, unit)) AS missing_units`,
      );
      // `?1` only exists in the statement when it is limited to one person.
      return scope === 'mine' ? counts.bind(userId) : counts;
    })(),
  ];
}

function present(index: FoodIndex, foods: PendingFoodGroup[], units: PendingUnitGroup[], counts: Counts | undefined, scope: 'everyone' | 'mine') {
  return {
    totals: { unknownFoods: counts?.unknown_foods ?? 0, missingUnits: counts?.missing_units ?? 0 },
    unknownFoods: foods.map((g) => ({
      normalizedName: g.normalized_name,
      examples: (JSON.parse(g.examples) as string[]).slice(0, 5),
      units: JSON.parse(g.units) as string[],
      itemCount: g.item_count,
      userCount: g.user_count,
      // How many of the items are the asker's. In their own list that is all of them.
      myItemCount: scope === 'mine' ? g.item_count : (g.mine_items ?? 0),
      lastDate: scope === 'mine' ? g.last_date : undefined,
      suggestions: suggest(index, g.normalized_name),
    })),
    missingUnits: units.flatMap((g) => {
      const food = index.byId.get(g.food_id);
      if (!food) return [];
      return [
        {
          foodId: food.id,
          foodName: food.displayName,
          baseUnit: food.baseUnit,
          unit: g.unit,
          itemCount: g.item_count,
          userCount: g.user_count,
          myItemCount: scope === 'mine' ? g.item_count : (g.mine_items ?? 0),
          lastDate: scope === 'mine' ? g.last_date : undefined,
        },
      ];
    }),
  };
}

export function registerUncached(router: Router) {
  /**
   * Derived from pending log_items (PLAN.md §6, §12). The top level is everything anyone logged, most-logged first: the shared list
   * ("Global pending items"). When the request names a profile, `mine` is the same shape for what that profile logged, newest first
   * ("My pending items"); an older app that does not read it is unaffected, and a request that names no one gets no `mine`.
   */
  router.add('GET', '/uncached', 'app', async ({ env, url, user }: Ctx) => {
    const db = env.DB;
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const me = user?.id ?? '';
    const results = await db.batch([
      ...indexStatements(db),
      ...pendingStatements(db, me, 'everyone', limit),
      ...(user ? pendingStatements(db, me, 'mine', limit) : []),
    ]);
    const index = indexFromResults(results.slice(0, 3));
    const rows = <T>(i: number) => (results[i] as D1Result<T>).results;
    const everyone = present(index, rows<PendingFoodGroup>(3), rows<PendingUnitGroup>(4), rows<Counts>(5)[0], 'everyone');
    return json(
      user
        ? { ...everyone, mine: present(index, rows<PendingFoodGroup>(6), rows<PendingUnitGroup>(7), rows<Counts>(8)[0], 'mine') }
        : everyone,
    );
  });
}
