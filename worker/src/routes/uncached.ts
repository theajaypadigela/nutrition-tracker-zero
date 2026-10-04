import { json } from '../http';
import { indexFromResults, indexStatements } from '../db/queries';
import { suggest } from '../domain/suggest';
import type { Ctx, Router } from '../router';

interface PendingFoodGroup {
  normalized_name: string;
  item_count: number;
  user_count: number;
  examples: string;
  units: string;
}

interface PendingUnitGroup {
  food_id: string;
  unit: string;
  item_count: number;
  user_count: number;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export function registerUncached(router: Router) {
  /** Derived from pending log_items across all users, most-logged first (PLAN.md §6, §12). */
  router.add('GET', '/uncached', 'app', async ({ env, url }: Ctx) => {
    const db = env.DB;
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const results = await db.batch([
      ...indexStatements(db),
      db
        .prepare(
          `SELECT normalized_name, COUNT(*) AS item_count, COUNT(DISTINCT user_id) AS user_count,
                  json_group_array(DISTINCT raw_name) AS examples, json_group_array(DISTINCT unit) AS units
           FROM log_items WHERE status = 'pending_food'
           GROUP BY normalized_name ORDER BY item_count DESC, normalized_name LIMIT ?1`,
        )
        .bind(limit),
      db
        .prepare(
          `SELECT food_id, unit, COUNT(*) AS item_count, COUNT(DISTINCT user_id) AS user_count
           FROM log_items WHERE status = 'pending_unit'
           GROUP BY food_id, unit ORDER BY item_count DESC LIMIT ?1`,
        )
        .bind(limit),
      db.prepare(
        `SELECT
           (SELECT COUNT(DISTINCT normalized_name) FROM log_items WHERE status = 'pending_food') AS unknown_foods,
           (SELECT COUNT(*) FROM (SELECT 1 FROM log_items WHERE status = 'pending_unit' GROUP BY food_id, unit)) AS missing_units`,
      ),
    ]);
    const index = indexFromResults(results.slice(0, 3));
    const foods = (results[3] as D1Result<PendingFoodGroup>).results;
    const units = (results[4] as D1Result<PendingUnitGroup>).results;
    const counts = (results[5] as D1Result<{ unknown_foods: number; missing_units: number }>).results[0];

    return json({
      totals: { unknownFoods: counts?.unknown_foods ?? 0, missingUnits: counts?.missing_units ?? 0 },
      unknownFoods: foods.map((g) => ({
        normalizedName: g.normalized_name,
        examples: (JSON.parse(g.examples) as string[]).slice(0, 5),
        units: JSON.parse(g.units) as string[],
        itemCount: g.item_count,
        userCount: g.user_count,
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
          },
        ];
      }),
    });
  });
}
