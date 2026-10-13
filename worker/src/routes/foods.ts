import { HttpError, badRequest, conflict, json, notFound, nowIso, readJson } from '../http';
import { foodFromRow, loadIndex, type FoodRow } from '../db/queries';
import { buildFoodHistory, HALF_LIFE_DAYS, HISTORY_WINDOW_DAYS, MAX_HISTORY_ROWS, type HistoryRow } from '../domain/history';
import { checkFood, rawServingIssues, type FoodIssue } from '../domain/quality/foodChecks';
import { foodGaps } from '../domain/quality/foodGaps';
import { addDays, localDateIn } from '../domain/time';
import { indexFromResults, indexStatements, type LogItemRow } from '../db/queries';
import { FOOD_FORMS, FOOD_SOURCES, type Food, type FoodForm, type FoodIndex, type FoodSource } from '../domain/match';
import { normalizeName } from '../domain/normalize';
import { NUTRIENTS, type NutrientKey } from '../domain/nutrients';
import { runCascade } from '../domain/resolve';
import { normalizeBaseUnit, normalizeUnit, type BaseUnit } from '../domain/units';
import { MAX_NAME } from '../domain/items';
import type { Ctx, Router } from '../router';
import { asObject, isUniqueViolation, parseNutrients, trimmedString } from '../validate';

const MAX_SERVINGS = 100_000;
const MAX_ALIASES = 20;

export function foodJson(index: FoodIndex, food: Food) {
  const units = index.units.get(food.id);
  return {
    id: food.id,
    name: food.name,
    displayName: food.displayName,
    baseUnit: food.baseUnit,
    nutrients: food.nutrients,
    aliases: [...(index.aliasesByFood.get(food.id) ?? [])].sort(),
    units: units ? [...units].map(([unit, servings]) => ({ unit, servings })).sort((a, b) => a.unit.localeCompare(b.unit)) : [],
    source: food.source ?? null,
    reviewedAt: food.reviewedAt ?? null,
    form: food.form ?? null,
  };
}

/** `undefined` leaves the source alone, `null` clears it, anything else must be one of the four (plan 7.4: provenance, not authority). */
function parseSource(value: unknown): FoodSource | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value === 'string' && (FOOD_SOURCES as readonly string[]).includes(value)) return value as FoodSource;
  throw badRequest(`source must be one of ${FOOD_SOURCES.join(', ')}`);
}

/** The same for whether the numbers are for the food as eaten or raw and dry, before cooking (plan 7.7). */
function parseForm(value: unknown): FoodForm | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value === 'string' && (FOOD_FORMS as readonly string[]).includes(value)) return value as FoodForm;
  throw badRequest(`form must be one of ${FOOD_FORMS.join(', ')}`);
}

/**
 * The hard rules of plan 7.4 refuse a save with the issues that broke them (the app words them); the soft rules come back with the
 * saved food, for the editor to have asked about before saving.
 */
function assertPossible(errors: FoodIssue[]) {
  if (errors.length === 0) return;
  throw new HttpError(400, 'invalid_nutrients', `These values cannot all be true: ${errors.map((e) => e.id).join(', ')}`, { issues: errors });
}

function parseBaseUnit(value: unknown): BaseUnit {
  const base = typeof value === 'string' ? normalizeBaseUnit(value) : null;
  if (!base) throw badRequest('baseUnit must be one of the base units from /meta');
  return base;
}

function parseServings(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > MAX_SERVINGS) {
    throw badRequest('servings must be a positive number');
  }
  return n;
}

function parseConversionUnit(raw: string, base: BaseUnit): string {
  const unit = normalizeUnit(raw);
  if (!unit || unit.length > 30) throw badRequest('unit is required');
  if (unit === base) throw badRequest('That is already the base unit');
  return unit;
}

function parseAlias(value: unknown): string {
  const raw = trimmedString(value, 'alias', 1, MAX_NAME);
  const alias = normalizeName(raw);
  if (!alias) throw badRequest('alias must contain letters or digits');
  return alias;
}

/** Throws 409 if any of `names` is already a food name or alias (other than on `exceptFoodId`). */
async function assertNamesFree(db: D1Database, names: string[], exceptFoodId?: string) {
  const row = await db
    .prepare(
      `SELECT id AS food_id, name AS taken FROM foods WHERE name IN (SELECT value FROM json_each(?1))
       UNION ALL
       SELECT food_id, alias FROM food_aliases WHERE alias IN (SELECT value FROM json_each(?1))`,
    )
    .bind(JSON.stringify(names))
    .all<{ food_id: string; taken: string }>();
  const clash = row.results.find((r) => r.food_id !== exceptFoodId);
  if (clash) {
    throw conflict('name_taken', `"${clash.taken}" is already used by another food`, { foodId: clash.food_id });
  }
}

async function getFoodOr404(db: D1Database, id: string): Promise<Food> {
  const row = await db.prepare('SELECT * FROM foods WHERE id = ?').bind(id).first<FoodRow>();
  if (!row) throw notFound('Food not found');
  return foodFromRow(row);
}

function upsertUnitStatement(db: D1Database, foodId: string, unit: string, servings: number, by: string | null, now: string) {
  return db
    .prepare(
      `INSERT INTO food_units (food_id, unit, servings, added_by, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (food_id, unit) DO UPDATE SET servings = excluded.servings, added_by = excluded.added_by, updated_at = excluded.updated_at`,
    )
    .bind(foodId, unit, servings, by, now);
}

async function guardUnique<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict('name_taken', 'That name is already used by another food');
    throw err;
  }
}

export function registerFoods(router: Router) {
  router.add('GET', '/foods', 'app', async ({ env, url }: Ctx) => {
    const index = await loadIndex(env.DB);
    const q = normalizeName(url.searchParams.get('q') ?? '');
    let foods = [...index.byId.values()];
    if (q) {
      foods = foods.filter(
        (f) =>
          f.name.includes(q) ||
          f.displayName.toLowerCase().includes(q) ||
          (index.aliasesByFood.get(f.id) ?? []).some((a) => a.includes(q)),
      );
    }
    foods.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return json({ foods: foods.map((f) => foodJson(index, f)) });
  });

  // Registered before `/foods/:id`, or "gaps" would be taken for an id.
  router.add('GET', '/foods/gaps', 'user', async ({ env, user }: Ctx) => {
    const db = env.DB;
    const today = localDateIn(user!.timezone);
    const from = addDays(today, -27);
    const results = await db.batch([
      ...indexStatements(db),
      db
        .prepare(`SELECT food_id, quantity, unit, status FROM log_items WHERE user_id = ?1 AND local_date BETWEEN ?2 AND ?3`)
        .bind(user!.id, from, today),
    ]);
    const index = indexFromResults(results.slice(0, 3));
    const rows = (results[3] as D1Result<Pick<LogItemRow, 'food_id' | 'quantity' | 'unit' | 'status'>>).results;
    return json({ from, to: today, ...foodGaps(index, rows) });
  });

  // The foods this person logs, ranked for the log screen: how often and how lately, for each meal. Only their own log is read, so
  // nobody sees anyone else's habits. Registered before `/foods/:id`.
  router.add('GET', '/foods/history', 'user', async ({ env, user }: Ctx) => {
    const db = env.DB;
    const today = localDateIn(user!.timezone);
    const from = addDays(today, 1 - HISTORY_WINDOW_DAYS);
    const results = await db.batch([
      ...indexStatements(db),
      db
        .prepare(
          `SELECT local_date, meal, raw_name, normalized_name, food_id, quantity, unit, created_at FROM log_items
           WHERE user_id = ?1 AND local_date >= ?2 ORDER BY local_date DESC, created_at DESC LIMIT ?3`,
        )
        .bind(user!.id, from, MAX_HISTORY_ROWS),
    ]);
    const index = indexFromResults(results.slice(0, 3));
    const rows = (results[3] as D1Result<HistoryRow>).results;
    return json({ asOf: today, windowDays: HISTORY_WINDOW_DAYS, halfLifeDays: HALF_LIFE_DAYS, foods: buildFoodHistory(index, rows, today) });
  });

  router.add('GET', '/foods/:id', 'app', async ({ env, params }: Ctx) => {
    const index = await loadIndex(env.DB);
    const food = index.byId.get(params.id!);
    if (!food) throw notFound('Food not found');
    return json({ food: foodJson(index, food) });
  });

  router.add('POST', '/foods', 'app', async ({ req, env, user }: Ctx) => {
    const body = asObject(await readJson(req));
    const displayName = trimmedString(body.displayName, 'displayName', 1, MAX_NAME);
    const name = normalizeName(displayName);
    if (!name) throw badRequest('displayName must contain letters or digits');
    const baseUnit = parseBaseUnit(body.baseUnit);
    const nutrients = parseNutrients(body.nutrients, true);

    const aliasInput = body.aliases ?? [];
    if (!Array.isArray(aliasInput) || aliasInput.length > MAX_ALIASES) throw badRequest(`aliases must be a list of up to ${MAX_ALIASES}`);
    const aliases = [...new Set(aliasInput.map(parseAlias))].filter((a) => a !== name);

    const unitInput = body.units ?? [];
    if (!Array.isArray(unitInput) || unitInput.length > 20) throw badRequest('units must be a list of up to 20');
    const units = new Map<string, number>();
    for (const u of unitInput) {
      const o = asObject(u);
      units.set(parseConversionUnit(String(o.unit ?? ''), baseUnit), parseServings(o.servings));
    }

    const source = parseSource(body.source) ?? null;
    const form = parseForm(body.form) ?? null;
    // Hard rules refuse a save; soft ones come back with the saved food (plan 7.4).
    const check = checkFood({ baseUnit, nutrients, units: [...units].map(([unit, servings]) => ({ unit, servings })), form });
    assertPossible(check.errors);

    await assertNamesFree(env.DB, [name, ...aliases]);

    const db = env.DB;
    const id = crypto.randomUUID();
    const now = nowIso();
    const by = user?.id ?? null;
    const columns = NUTRIENTS.map((n) => n.column);
    const nutrientValues = NUTRIENTS.map((n) => nutrients[n.key] ?? null);
    const writes = [
      db
        .prepare(
          `INSERT INTO foods (id, name, display_name, base_unit, ${columns.join(', ')}, added_by, created_at, updated_at, source, reviewed_at, form)
           VALUES (${Array.from({ length: 4 + columns.length + 6 }, (_, i) => `?${i + 1}`).join(', ')})`,
        )
        .bind(id, name, displayName, baseUnit, ...nutrientValues, by, now, now, source, now, form),
      db
        .prepare(
          `INSERT INTO food_aliases (alias, food_id, added_by, created_at)
           SELECT value, ?1, ?2, ?3 FROM json_each(?4)`,
        )
        .bind(id, by, now, JSON.stringify(aliases)),
      ...[...units].map(([unit, servings]) => upsertUnitStatement(db, id, unit, servings, by, now)),
    ];
    const result = await guardUnique(() => runCascade(db, writes, { foodIds: [id], names: [name, ...aliases] }));
    const food = result.index.byId.get(id)!;
    return json({ food: foodJson(result.index, food), resolvedCount: result.resolvedCount, warnings: check.warnings }, 201);
  });

  // The editor's dry run: the same checks as a save, with nothing written (plan 7.4). Calories may still be missing while typing.
  router.add('POST', '/foods/check', 'app', async ({ req }: Ctx) => {
    const body = asObject(await readJson(req));
    const baseUnit = parseBaseUnit(body.baseUnit);
    const nutrients = parseNutrients(body.nutrients, false);
    const unitInput = body.units ?? [];
    if (!Array.isArray(unitInput) || unitInput.length > 20) throw badRequest('units must be a list of up to 20');
    const units = unitInput.map((u) => {
      const o = asObject(u);
      return { unit: parseConversionUnit(String(o.unit ?? ''), baseUnit), servings: parseServings(o.servings) };
    });
    return json(checkFood({ baseUnit, nutrients, units, form: parseForm(body.form) ?? null }));
  });

  router.add('PUT', '/foods/:id', 'app', async ({ req, env, params }: Ctx) => {
    const db = env.DB;
    const food = await getFoodOr404(db, params.id!);
    const body = asObject(await readJson(req));
    const now = nowIso();

    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = ?${values.length}`);
    };
    const writes: D1PreparedStatement[] = [];
    const names: string[] = [];

    if (body.displayName !== undefined) {
      const displayName = trimmedString(body.displayName, 'displayName', 1, MAX_NAME);
      const name = normalizeName(displayName);
      if (!name) throw badRequest('displayName must contain letters or digits');
      set('display_name', displayName);
      if (name !== food.name) {
        await assertNamesFree(db, [name], food.id);
        set('name', name);
        names.push(name);
        // Keep the old name as an alias so items logged under it stay linked.
        writes.push(
          db.prepare('DELETE FROM food_aliases WHERE alias = ?1 AND food_id = ?2').bind(name, food.id),
          db
            .prepare('INSERT OR IGNORE INTO food_aliases (alias, food_id, created_at) VALUES (?1, ?2, ?3)')
            .bind(food.name, food.id, now),
        );
      }
    }

    const source = parseSource(body.source);
    const form = parseForm(body.form);
    let baseUnit: BaseUnit = food.baseUnit;
    let baseChanged = false;
    if (body.baseUnit !== undefined) {
      baseUnit = parseBaseUnit(body.baseUnit);
      if (baseUnit !== food.baseUnit) {
        baseChanged = true;
        set('base_unit', baseUnit);
        // Conversions are relative to the base serving, so they no longer hold.
        writes.push(db.prepare('DELETE FROM food_units WHERE food_id = ?1').bind(food.id));
      }
    }

    // What the food will hold after this save: the checks are run on the whole food, not on the patch.
    let merged: Partial<Record<NutrientKey, number | null>> = baseChanged ? {} : { ...food.nutrients };
    if (body.nutrients !== undefined) {
      const nutrients = parseNutrients(body.nutrients, baseChanged);
      for (const n of NUTRIENTS) {
        const v = nutrients[n.key as NutrientKey];
        if (v !== undefined) {
          set(n.column, v);
          merged = { ...merged, [n.key]: v };
        }
      }
    } else if (baseChanged) {
      throw badRequest('Changing baseUnit needs nutrients per the new base unit');
    }
    if (source !== undefined) set('source', source);
    if (form !== undefined) set('form', form);
    // Whoever saves values, or says where they came from or what state of the food they describe, has just reviewed them.
    if (body.nutrients !== undefined || source !== undefined || form !== undefined) set('reviewed_at', now);

    if (sets.length === 0) throw badRequest('Nothing to update');
    // The numbers are checked when they change; saying only what state of the food they describe asks only the raw-food question,
    // so a form alone never trips a hard rule on numbers saved before the checks existed.
    const formAfter = form === undefined ? (food.form ?? null) : form;
    const check =
      body.nutrients !== undefined || baseChanged
        ? checkFood({ baseUnit, nutrients: merged, form: formAfter })
        : { errors: [], warnings: form !== undefined ? rawServingIssues(formAfter, [baseUnit]) : [] };
    // Raw food: the helpings it is already converted to are worth the same question (plan 7.7). A base-unit change clears them.
    if (formAfter === 'raw' && (form !== undefined || body.nutrients !== undefined) && !baseChanged) {
      const stored = await db.prepare('SELECT unit FROM food_units WHERE food_id = ?').bind(food.id).all<{ unit: string }>();
      const asked = new Set(check.warnings.filter((w) => w.id === 'raw_serving_unit').map((w) => String(w.params.unit)));
      check.warnings.push(...rawServingIssues('raw', stored.results.map((r) => r.unit)).filter((w) => !asked.has(String(w.params.unit))));
    }
    assertPossible(check.errors);
    set('updated_at', now);
    values.push(food.id);
    // The food row update goes first so the alias swap sees the new name.
    writes.unshift(db.prepare(`UPDATE foods SET ${sets.join(', ')} WHERE id = ?${values.length}`).bind(...values));

    const result = await guardUnique(() => runCascade(db, writes, { foodIds: [food.id], names }));
    return json({
      food: foodJson(result.index, result.index.byId.get(food.id)!),
      resolvedCount: result.resolvedCount,
      repended: result.repended,
      warnings: check.warnings,
    });
  });

  router.add('POST', '/foods/:id/aliases', 'app', async ({ req, env, params, user }: Ctx) => {
    const db = env.DB;
    const food = await getFoodOr404(db, params.id!);
    const alias = parseAlias(asObject(await readJson(req)).alias);
    if (alias === food.name) throw conflict('name_taken', 'That is already this food\'s name', { foodId: food.id });
    const existing = await db.prepare('SELECT food_id FROM food_aliases WHERE alias = ?').bind(alias).first<{ food_id: string }>();
    if (existing?.food_id === food.id) {
      const index = await loadIndex(db);
      return json({ food: foodJson(index, index.byId.get(food.id)!), resolvedCount: 0 });
    }
    await assertNamesFree(db, [alias]);
    const write = db
      .prepare('INSERT INTO food_aliases (alias, food_id, added_by, created_at) VALUES (?1, ?2, ?3, ?4)')
      .bind(alias, food.id, user?.id ?? null, nowIso());
    const result = await guardUnique(() => runCascade(db, [write], { foodIds: [food.id], names: [alias] }));
    return json({ food: foodJson(result.index, result.index.byId.get(food.id)!), resolvedCount: result.resolvedCount }, 201);
  });

  router.add('DELETE', '/foods/:id/aliases/:alias', 'app', async ({ env, params }: Ctx) => {
    const db = env.DB;
    const food = await getFoodOr404(db, params.id!);
    const alias = normalizeName(params.alias!);
    const found = await db
      .prepare('SELECT 1 AS x FROM food_aliases WHERE alias = ?1 AND food_id = ?2')
      .bind(alias, food.id)
      .first();
    if (!found) throw notFound('Alias not found');
    const write = db.prepare('DELETE FROM food_aliases WHERE alias = ?1 AND food_id = ?2').bind(alias, food.id);
    const result = await runCascade(db, [write], { foodIds: [food.id], names: [] });
    return json({ food: foodJson(result.index, result.index.byId.get(food.id)!), repended: result.repended });
  });

  router.add('PUT', '/foods/:id/units/:unit', 'app', async ({ req, env, params, user }: Ctx) => {
    const db = env.DB;
    const food = await getFoodOr404(db, params.id!);
    const unit = parseConversionUnit(params.unit!, food.baseUnit);
    const servings = parseServings(asObject(await readJson(req)).servings);
    const write = upsertUnitStatement(db, food.id, unit, servings, user?.id ?? null, nowIso());
    const result = await runCascade(db, [write], { foodIds: [food.id], names: [] });
    const { warnings } = checkFood({ baseUnit: food.baseUnit, nutrients: {}, units: [{ unit, servings }], form: food.form ?? null });
    return json({ food: foodJson(result.index, result.index.byId.get(food.id)!), resolvedCount: result.resolvedCount, warnings });
  });

  router.add('DELETE', '/foods/:id/units/:unit', 'app', async ({ env, params }: Ctx) => {
    const db = env.DB;
    const food = await getFoodOr404(db, params.id!);
    const unit = normalizeUnit(params.unit!);
    const write = db.prepare('DELETE FROM food_units WHERE food_id = ?1 AND unit = ?2').bind(food.id, unit);
    const result = await runCascade(db, [write], { foodIds: [food.id], names: [] });
    return json({ food: foodJson(result.index, result.index.byId.get(food.id)!), repended: result.repended });
  });
}
