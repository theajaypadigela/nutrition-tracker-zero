import { badRequest, json, noContent, notFound, readJson } from '../http';
import { itemJson, loadIndex, type LogItemRow } from '../db/queries';
import { MAX_NAME, parseMeal, parseQuantity } from '../domain/items';
import { normalizeName } from '../domain/normalize';
import { resolveItem } from '../domain/nutrition';
import { normalizeUnit } from '../domain/units';
import type { Ctx, Router } from '../router';
import { asObject, trimmedString } from '../validate';

export function registerItems(router: Router) {
  router.add('PATCH', '/items/:id', 'user', async ({ req, env, params, user }: Ctx) => {
    const db = env.DB;
    const row = await db
      .prepare('SELECT * FROM log_items WHERE id = ?1 AND user_id = ?2')
      .bind(params.id!, user!.id)
      .first<LogItemRow>();
    if (!row) throw notFound('Item not found');
    const body = asObject(await readJson(req));
    const next = { ...row };

    if (body.name !== undefined) {
      next.raw_name = trimmedString(body.name, 'name', 1, MAX_NAME);
      next.normalized_name = normalizeName(next.raw_name);
      if (!next.normalized_name) throw badRequest('name must contain letters or digits');
    }
    if (body.quantity !== undefined) {
      const q = parseQuantity(body.quantity);
      if (q === null) throw badRequest('quantity must be a positive number');
      next.quantity = q;
    }
    if (body.unit !== undefined) {
      const unit = typeof body.unit === 'string' ? normalizeUnit(body.unit) : '';
      if (!unit || unit.length > 30) throw badRequest('unit is required');
      next.unit = unit;
    }
    if (body.meal !== undefined) {
      const meal = parseMeal(body.meal);
      if (meal === undefined) throw badRequest('meal must be breakfast, lunch, snack, dinner or null');
      next.meal = meal;
    }

    const index = await loadIndex(db);
    const resolution = resolveItem(index, next.normalized_name, next.unit);
    next.food_id = resolution.foodId;
    next.status = resolution.status;
    await db
      .prepare(
        `UPDATE log_items SET raw_name = ?1, normalized_name = ?2, quantity = ?3, unit = ?4, meal = ?5, food_id = ?6, status = ?7
         WHERE id = ?8 AND user_id = ?9`,
      )
      .bind(next.raw_name, next.normalized_name, next.quantity, next.unit, next.meal, next.food_id, next.status, row.id, user!.id)
      .run();
    return json({ item: itemJson(index, next) });
  });

  router.add('DELETE', '/items/:id', 'user', async ({ env, params, user }: Ctx) => {
    const res = await env.DB.prepare('DELETE FROM log_items WHERE id = ?1 AND user_id = ?2').bind(params.id!, user!.id).run();
    if (res.meta.changes === 0) throw notFound('Item not found');
    return noContent();
  });
}
