/**
 * `GET /reports/weekly` (WEEKLY_BREAKDOWN_PLAN.md 9.3): the whole weekly view model, built by the pure engine in
 * domain/report from the week's items and the target set in force on each day. Nothing derived is stored, so
 * correcting a food corrects every past week.
 *
 * Who may read it. A report of a profile with a health profile reveals its targets and energy, so it needs that
 * profile's secret, like every health route (plan 8.3.2). A profile with no health profile has nothing to protect
 * beyond what `GET /days` already serves: it gets the generic report with no secret.
 *
 * Cost. One `db.batch` of nine statements (the food index, the items for up to eight weeks, the day marks, and the
 * health rows), then everything in memory: about 3,500 to 5,000 rows read, inside the free tier's budget.
 */
import { requireProfileSecret } from "../auth";
import { badRequest, json, nowIso } from "../http";
import {
  indexFromResults,
  indexStatements,
  type LogItemRow,
} from "../db/queries";
import { NUTRIENTS, type NutrientKey } from "../domain/nutrients";
import { itemNutrients } from "../domain/intake/items";
import { buildRangeReport } from "../domain/report/range";
import { MAX_HISTORY_WEEKS, buildWeeklyReport } from "../domain/report/weekly";
import type { DayMark, IntakeDay, IntakeItem } from "../domain/intake/types";
import { addDays, isValidDate, localDateIn, weekStartOf } from "../domain/time";
import {
  healthFromResults,
  profileStatement,
  healthStatements,
  insertSetStatement,
  modeOf,
  overridesOf,
  withCurrentAgeBand,
} from "../health";
import type { Ctx, Router } from "../router";

/** The weeks of items the report needs: its own history, and at least the 28 days the vitamin window looks back. */
const MIN_WINDOW_WEEKS = 4;

type ItemRow = Pick<
  LogItemRow,
  "local_date" | "food_id" | "raw_name" | "quantity" | "unit" | "status"
>;

export async function weeklyReportResponse({
  req,
  env,
  url,
  user,
  unlocked,
}: Ctx): Promise<Response> {
  const db = env.DB;
  const u = user!;
  const today = localDateIn(u.timezone);

  const startParam = url.searchParams.get("start");
  if (startParam !== null && !isValidDate(startParam))
    throw badRequest("start must be YYYY-MM-DD", { field: "start" });
  const start = weekStartOf(startParam ?? today);
  if (start > weekStartOf(today))
    throw badRequest("start cannot be a week that has not begun", {
      field: "start",
    });
  const weeksParam = url.searchParams.get("weeks");
  const weeks = weeksParam === null ? MAX_HISTORY_WEEKS : Number(weeksParam);
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > MAX_HISTORY_WEEKS) {
    throw badRequest(
      `weeks must be a whole number from 1 to ${MAX_HISTORY_WEEKS}`,
      { field: "weeks" },
    );
  }

  const from = addDays(start, -7 * (Math.max(weeks, MIN_WINDOW_WEEKS) - 1));
  const to = addDays(start, 6);
  const results = await db.batch([
    ...indexStatements(db),
    db
      .prepare(
        `SELECT local_date, food_id, raw_name, quantity, unit, status FROM log_items
         WHERE user_id = ?1 AND local_date BETWEEN ?2 AND ?3`,
      )
      .bind(u.id, from, to),
    db
      .prepare(
        "SELECT local_date, status FROM day_status WHERE user_id = ?1 AND local_date BETWEEN ?2 AND ?3",
      )
      .bind(u.id, from, to),
    ...healthStatements(db, u.id),
  ]);
  const index = indexFromResults(results.slice(0, 3));
  const rows = (results[3] as D1Result<ItemRow>).results;
  const marks = (
    results[4] as D1Result<{ local_date: string; status: DayMark }>
  ).results;
  const state = healthFromResults(results.slice(5));

  // A profile with a secret reads its report only with it, whether or not it has a health profile, so the answer never says which
  // (security review). A profile from before secrets existed has no health profile, and gets the generic report as before.
  if ((u.secret_hash || state.profile) && !unlocked)
    await requireProfileSecret(req, u.secret_hash, { db, userId: u.id });
  const mode = modeOf(state.profile);

  // The set in force may have to move with a birthday (plan 6.2): the report adds it, once, as it reads.
  const { sets, added } = withCurrentAgeBand(state, today);
  if (added) await db.batch([insertSetStatement(db, u.id, added, nowIso())]);
  const latest = sets[sets.length - 1] ?? null;

  const byDate = new Map<string, IntakeDay>();
  const dayOf = (date: string): IntakeDay => {
    let d = byDate.get(date);
    if (!d) {
      d = { date, items: [], mark: null };
      byDate.set(date, d);
    }
    return d;
  };
  for (const row of rows) {
    const food = row.food_id ? index.byId.get(row.food_id) : undefined;
    const nutrients = itemNutrients(index, row);
    const item: IntakeItem = {
      foodId: row.food_id,
      name: food?.displayName ?? row.raw_name,
      pending: row.status !== "resolved",
      nutrients: Object.fromEntries(
        NUTRIENTS.map((n) => [n.key, nutrients[n.key as NutrientKey]]),
      ),
      quantity: row.quantity,
      unit: row.unit,
      source: food?.source ?? null,
    };
    dayOf(row.local_date).items.push(item);
  }
  for (const m of marks) dayOf(m.local_date).mark = m.status;

  const report = buildWeeklyReport({
    weekStart: start,
    today,
    weeks,
    mode,
    numbersHidden: state.profile?.numbers_hidden === 1,
    medicine: state.profile?.diet_interacting_medicine === 1,
    targetSets: mode === "personalised" ? sets : [],
    overrides: overridesOf(state.goals),
    days: [...byDate.values()],
    goal: latest?.inputs?.goalApplied ?? null,
    pattern: latest?.inputs?.pattern ?? null,
    referenceSet: latest?.referenceSet ?? null,
    bmi: latest?.inputs?.bmi ?? null,
    weights: state.weights.map((w) => ({
      date: w.local_date,
      weightKg: w.weight_kg,
    })),
    // The Nutrient mix, saturated fat and added sugars in it, and the experimental calibration appear only when the deployment switches
    // them on (wrangler.jsonc): the score once the foods people eat have their values, because until then it looks surer than the data;
    // the two parts once foods have values for them; the calibration never by default, because nothing validates it (plan 4.9, 5.5).
    config: {
      score: (env.NUTRIENT_SCORE as string) === "1",
      moderationComponents: (env.SCORE_MODERATION as string) === "1",
      calibration: (env.CALIBRATION as string) === "1",
    },
  });
  return json(report);
}

/** Inclusive date-range totals. Uses the same calculator on the server and the embedded backend. */
export async function rangeReportResponse({
  req,
  env,
  url,
  user,
  unlocked,
}: Ctx): Promise<Response> {
  const u = user!;
  const today = localDateIn(u.timezone);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !isValidDate(from))
    throw badRequest("from must be YYYY-MM-DD", { field: "from" });
  if (!to || !isValidDate(to))
    throw badRequest("to must be YYYY-MM-DD", { field: "to" });
  if (from > to)
    throw badRequest("from must not be after to", { field: "from" });
  if (from > today)
    throw badRequest("from cannot be in the future", { field: "from" });
  const through = to > today ? today : to;
  const db = env.DB;
  const profile = await profileStatement(db, u.id).first<{
    numbers_hidden: number;
  }>();
  if ((u.secret_hash || profile) && !unlocked)
    await requireProfileSecret(req, u.secret_hash, { db, userId: u.id });
  const numbersHidden = profile?.numbers_hidden === 1;
  const results = await db.batch([
    ...indexStatements(db),
    db
      .prepare(
        `SELECT local_date, food_id, raw_name, quantity, unit, status FROM log_items
      WHERE user_id = ?1 AND local_date BETWEEN ?2 AND ?3`,
      )
      .bind(u.id, from, through),
    db
      .prepare(
        `SELECT local_date FROM day_status
      WHERE user_id = ?1 AND local_date BETWEEN ?2 AND ?3 AND status = 'skip'`,
      )
      .bind(u.id, from, through),
  ]);
  const index = indexFromResults(results.slice(0, 3));
  const rows = (results[3] as D1Result<ItemRow>).results;
  const skipped = (results[4] as D1Result<{ local_date: string }>).results;
  return json(
    buildRangeReport({
      from,
      to,
      through,
      numbersHidden,
      skippedDates: skipped.map((d) => d.local_date),
      items: rows.map((row) => ({
        date: row.local_date,
        pending: row.status !== "resolved",
        nutrients: itemNutrients(index, row),
      })),
    }),
  );
}

export function registerReports(router: Router) {
  router.add("GET", "/reports/range", "user", rangeReportResponse);
  router.add("GET", "/reports/weekly", "user", weeklyReportResponse);
}
