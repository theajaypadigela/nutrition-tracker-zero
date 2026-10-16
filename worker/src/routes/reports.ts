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
import { requireProfileSecret } from '../auth';
import { badRequest, json, nowIso } from '../http';
import { indexFromResults, indexStatements, type LogItemRow } from '../db/queries';
import { FEATURES } from '../domain/features';
import { NUTRIENTS, isNutrientKey, type NutrientKey } from '../domain/nutrients';
import { itemNutrients } from '../domain/intake/items';
import { buildBreakdown } from '../domain/report/breakdown';
import { buildRangeReport } from '../domain/report/range';
import { MAX_HISTORY_WEEKS, buildWeeklyReport } from '../domain/report/weekly';
import type { DayMark, IntakeDay, IntakeItem } from '../domain/intake/types';
import { addDays, isValidDate, localDateIn, weekStartOf } from '../domain/time';
import {
  healthFromResults,
  profileStatement,
  healthStatements,
  insertSetStatement,
  modeOf,
  overridesOf,
  withCurrentAgeBand,
} from '../health';
import type { Ctx, Router } from '../router';

/** The weeks of items the report needs: its own history, and at least the 28 days the vitamin window looks back. */
const MIN_WINDOW_WEEKS = 4;

type ItemRow = Pick<LogItemRow, 'local_date' | 'food_id' | 'raw_name' | 'quantity' | 'unit' | 'status'>;

export async function weeklyReportResponse({ req, env, url, user, unlocked }: Ctx): Promise<Response> {
  const db = env.DB;
  const u = user!;
  const today = localDateIn(u.timezone);

  const startParam = url.searchParams.get('start');
  if (startParam !== null && !isValidDate(startParam)) throw badRequest('start must be YYYY-MM-DD', { field: 'start' });
  const start = weekStartOf(startParam ?? today);
  if (start > weekStartOf(today))
    throw badRequest('start cannot be a week that has not begun', {
      field: 'start',
    });
  const weeksParam = url.searchParams.get('weeks');
  const weeks = weeksParam === null ? MAX_HISTORY_WEEKS : Number(weeksParam);
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > MAX_HISTORY_WEEKS) {
    throw badRequest(`weeks must be a whole number from 1 to ${MAX_HISTORY_WEEKS}`, { field: 'weeks' });
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
    db.prepare('SELECT local_date, status FROM day_status WHERE user_id = ?1 AND local_date BETWEEN ?2 AND ?3').bind(u.id, from, to),
    ...healthStatements(db, u.id),
  ]);
  const index = indexFromResults(results.slice(0, 3));
  const rows = (results[3] as D1Result<ItemRow>).results;
  const marks = (results[4] as D1Result<{ local_date: string; status: DayMark }>).results;
  const state = healthFromResults(results.slice(5));

  // A profile with a secret reads its report only with it, whether or not it has a health profile, so the answer never says which
  // (security review). A profile from before secrets existed has no health profile, and gets the generic report as before.
  if ((u.secret_hash || state.profile) && !unlocked) await requireProfileSecret(req, u.secret_hash, { db, userId: u.id });
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
      pending: row.status !== 'resolved',
      nutrients: Object.fromEntries(NUTRIENTS.map(n => [n.key, nutrients[n.key as NutrientKey]])),
      quantity: row.quantity,
      unit: row.unit,
      source: food?.source ?? null,
    };
    dayOf(row.local_date).items.push(item);
  }
  // A stored mark is kept but not read while day marking is off (FEATURES.dayCompletion), so every day counts by its own data alone.
  if (FEATURES.dayCompletion) for (const m of marks) dayOf(m.local_date).mark = m.status;

  const report = buildWeeklyReport({
    weekStart: start,
    today,
    weeks,
    mode,
    numbersHidden: state.profile?.numbers_hidden === 1,
    medicine: state.profile?.diet_interacting_medicine === 1,
    targetSets: mode === 'personalised' ? sets : [],
    overrides: overridesOf(state.goals),
    days: [...byDate.values()],
    goal: latest?.inputs?.goalApplied ?? null,
    pattern: latest?.inputs?.pattern ?? null,
    referenceSet: latest?.referenceSet ?? null,
    bmi: latest?.inputs?.bmi ?? null,
    weights: state.weights.map(w => ({
      date: w.local_date,
      weightKg: w.weight_kg,
    })),
    // The Nutrient mix, saturated fat and added sugars in it, and the experimental calibration appear only when the deployment switches
    // them on (wrangler.jsonc): the score once the foods people eat have their values, because until then it looks surer than the data;
    // the two parts once foods have values for them; the calibration never by default, because nothing validates it (plan 4.9, 5.5).
    config: {
      score: (env.NUTRIENT_SCORE as string) === '1',
      moderationComponents: (env.SCORE_MODERATION as string) === '1',
      calibration: (env.CALIBRATION as string) === '1',
      // "Thursday looks incomplete. Is that everything you ate?" asks the person to say whether a day is complete; with marking off there is
      // no way to answer, so the insight is not offered.
      dayCompletionPrompts: FEATURES.dayCompletion,
    },
  });
  return json(report);
}

/** Inclusive date-range totals. Uses the same calculator on the server and the embedded backend. */
export async function rangeReportResponse({ req, env, url, user, unlocked }: Ctx): Promise<Response> {
  const u = user!;
  const today = localDateIn(u.timezone);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!from || !isValidDate(from)) throw badRequest('from must be YYYY-MM-DD', { field: 'from' });
  if (!to || !isValidDate(to)) throw badRequest('to must be YYYY-MM-DD', { field: 'to' });
  if (from > to) throw badRequest('from must not be after to', { field: 'from' });
  if (from > today) throw badRequest('from cannot be in the future', { field: 'from' });
  const through = to > today ? today : to;
  const db = env.DB;
  const profile = await profileStatement(db, u.id).first<{
    numbers_hidden: number;
  }>();
  if ((u.secret_hash || profile) && !unlocked) await requireProfileSecret(req, u.secret_hash, { db, userId: u.id });
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
  // Days left out of the reports are a mark, so they are only left out while day marking is on.
  const skipped = FEATURES.dayCompletion ? (results[4] as D1Result<{ local_date: string }>).results : [];
  return json(
    buildRangeReport({
      from,
      to,
      through,
      numbersHidden,
      skippedDates: skipped.map(d => d.local_date),
      items: rows.map(row => ({
        date: row.local_date,
        pending: row.status !== 'resolved',
        nutrients: itemNutrients(index, row),
      })),
    }),
  );
}

/** More items than this and a list is no longer something to read, and a total over fewer would not be the report's. */
const MAX_BREAKDOWN_ITEMS = 5000;

/**
 * `GET /reports/breakdown?from&to&nutrient`: the logged items behind one nutrient's total over a span of days, each with what it
 * contributed, and the total. The same days, items and arithmetic as `GET /reports/range` (and `GET /days/:date` for one day), so the
 * list always adds up to the figure the dashboard shows; the Worker and the app build it with one pure function (domain/report/breakdown).
 */
export async function breakdownResponse({ req, env, url, user, unlocked }: Ctx): Promise<Response> {
  const u = user!;
  const today = localDateIn(u.timezone);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const nutrient = url.searchParams.get('nutrient');
  if (!from || !isValidDate(from)) throw badRequest('from must be YYYY-MM-DD', { field: 'from' });
  if (!to || !isValidDate(to)) throw badRequest('to must be YYYY-MM-DD', { field: 'to' });
  if (from > to) throw badRequest('from must not be after to', { field: 'from' });
  if (from > today) throw badRequest('from cannot be in the future', { field: 'from' });
  if (!nutrient || !isNutrientKey(nutrient)) throw badRequest('nutrient must be one of the catalogue keys', { field: 'nutrient' });
  const through = to > today ? today : to;
  const db = env.DB;
  const profile = await profileStatement(db, u.id).first<{ numbers_hidden: number }>();
  if ((u.secret_hash || profile) && !unlocked) await requireProfileSecret(req, u.secret_hash, { db, userId: u.id });
  const numbersHidden = profile?.numbers_hidden === 1;
  const range = { from, to, through };
  if (numbersHidden) {
    // Hidden numbers stay hidden: no amount, no total, and no list that would give them away.
    return json({ ...buildBreakdown([], nutrient), range, display: { numbersHidden: true } });
  }
  const results = await db.batch([
    ...indexStatements(db),
    db
      .prepare(
        `SELECT id, local_date, meal, raw_name, food_id, quantity, unit, status FROM log_items
         WHERE user_id = ?1 AND local_date BETWEEN ?2 AND ?3 ORDER BY local_date, created_at, id LIMIT ?4`,
      )
      .bind(u.id, from, through, MAX_BREAKDOWN_ITEMS + 1),
    db.prepare(`SELECT local_date FROM day_status WHERE user_id = ?1 AND local_date BETWEEN ?2 AND ?3 AND status = 'skip'`).bind(u.id, from, through),
  ]);
  const index = indexFromResults(results.slice(0, 3));
  type Row = Pick<LogItemRow, 'id' | 'local_date' | 'meal' | 'raw_name' | 'food_id' | 'quantity' | 'unit' | 'status'>;
  const rows = (results[3] as D1Result<Row>).results;
  if (rows.length > MAX_BREAKDOWN_ITEMS) throw badRequest('Too many items to list: choose a shorter period', { field: 'to' });
  // Days left out of the reports are a mark, so they are only left out while day marking is on (the same rule as the range report).
  const skipped = new Set(FEATURES.dayCompletion ? (results[4] as D1Result<{ local_date: string }>).results.map((d) => d.local_date) : []);
  const inputs = rows
    .filter((r) => !skipped.has(r.local_date))
    .map((r) => ({
      id: r.id,
      date: r.local_date,
      meal: r.meal,
      rawName: r.raw_name,
      foodName: (r.food_id ? index.byId.get(r.food_id)?.displayName : undefined) ?? null,
      quantity: r.quantity,
      unit: r.unit,
      foodId: r.food_id,
      status: r.status,
      nutrients: itemNutrients(index, r),
    }));
  return json({ ...buildBreakdown(inputs, nutrient), range, display: { numbersHidden: false } });
}

export function registerReports(router: Router) {
  router.add('GET', '/reports/breakdown', 'user', breakdownResponse);
  router.add('GET', '/reports/range', 'user', rangeReportResponse);
  router.add('GET', '/reports/weekly', 'user', weeklyReportResponse);
}
