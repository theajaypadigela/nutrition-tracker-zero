/**
 * What a person logs, ranked for the log screen's suggestions. Everything here comes from that person's own log, so two people never
 * see each other's habits. One entry per food: a food and every name that resolves to it are one entry. For each meal an entry says
 * on how many days the food was logged there and carries a score that rewards both how often and how lately, so the screen can sort a
 * meal's list by that meal's score: what someone has for breakfast never leads their lunch list.
 *
 * Pure: the route reads the rows and the food index; nothing here reaches for the database.
 */
import type { FoodIndex } from './match';
import { daysBetween } from './time';
import { isMeal, type Meal } from './units';

/** How far back the log is read. Older days barely move a score anyway (see HALF_LIFE_DAYS). */
export const HISTORY_WINDOW_DAYS = 180;
/** The most rows the route reads: a person who logs a dozen foods a day still has the whole window. */
export const MAX_HISTORY_ROWS = 3000;
/** The most foods returned, best first. */
export const MAX_HISTORY_FOODS = 400;
/**
 * A day's log counts half as much for every 21 days it goes back. A food eaten often and lately therefore outranks one eaten just as
 * often months ago, and a food tried once yesterday does not outrank one eaten every week for a year.
 */
export const HALF_LIFE_DAYS = 21;

/** The columns of `log_items` this reads. */
export interface HistoryRow {
  local_date: string;
  meal: string | null;
  raw_name: string;
  normalized_name: string;
  food_id: string | null;
  quantity: number;
  unit: string;
  /** Breaks a tie between two rows of one day (which name was logged last). */
  created_at?: string;
}

export interface MealHistory {
  /** Days the food was logged for this meal (twice in one day is one day). */
  days: number;
  /** Frequency and recency in one number: each day adds 0.5^(age in days / HALF_LIFE_DAYS). Higher means more likely. */
  score: number;
  lastDate: string;
  /** The amount logged most often (the latest on a tie), so one tap can fill it in. */
  quantity: number;
  unit: string;
}

export interface HistoryFood {
  foodId: string | null;
  /** What logging it again resolves by: the food's name, or the normalized name still waiting for its values. */
  name: string;
  /** How to show it, and what to send when it is logged again. */
  displayName: string;
  days: number;
  score: number;
  lastDate: string;
  quantity: number;
  unit: string;
  /** Only the meals it was logged for. */
  meals: Partial<Record<Meal, MealHistory>>;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** What one day's log is worth `ageDays` later. A day that is not yet over, or is in the future, counts in full. */
export function dayWeight(ageDays: number): number {
  return 0.5 ** (Math.max(0, ageDays) / HALF_LIFE_DAYS);
}

interface Amount {
  quantity: number;
  unit: string;
  count: number;
  last: string;
}

interface Bucket {
  dates: Set<string>;
  amounts: Map<string, Amount>;
}

const newBucket = (): Bucket => ({ dates: new Set(), amounts: new Map() });

function add(bucket: Bucket, row: HistoryRow) {
  bucket.dates.add(row.local_date);
  const key = `${row.quantity}\u0000${row.unit}`;
  const seen = bucket.amounts.get(key);
  if (seen) {
    seen.count++;
    if (row.local_date > seen.last) seen.last = row.local_date;
  } else {
    bucket.amounts.set(key, { quantity: row.quantity, unit: row.unit, count: 1, last: row.local_date });
  }
}

function summarize(bucket: Bucket, today: string): MealHistory {
  let score = 0;
  let lastDate = '';
  for (const date of bucket.dates) {
    score += dayWeight(daysBetween(date, today));
    if (date > lastDate) lastDate = date;
  }
  let usual: Amount | undefined;
  for (const a of bucket.amounts.values()) {
    if (!usual || a.count > usual.count || (a.count === usual.count && a.last > usual.last)) usual = a;
  }
  return { days: bucket.dates.size, score: round3(score), lastDate, quantity: usual!.quantity, unit: usual!.unit };
}

interface Entry {
  foodId: string | null;
  name: string;
  displayName: string;
  /** The date and time of the row `displayName` came from: the latest wins. */
  namedAt: string;
  all: Bucket;
  meals: Map<Meal, Bucket>;
}

/**
 * The person's foods, best first: by score over all their days, then days, then how lately, then name. `rows` may come in any order;
 * `today` is the person's own date ('YYYY-MM-DD'), the day ages are counted from.
 */
export function buildFoodHistory(index: FoodIndex, rows: readonly HistoryRow[], today: string): HistoryFood[] {
  const entries = new Map<string, Entry>();
  for (const row of rows) {
    // A row that points at a food joins every other row for that food, whatever it was called when it was logged.
    const food = row.food_id ? index.byId.get(row.food_id) : undefined;
    const key = food ? `food:${food.id}` : `name:${row.normalized_name}`;
    let entry = entries.get(key);
    if (!entry) {
      entry = {
        foodId: food?.id ?? null,
        name: food?.name ?? row.normalized_name,
        displayName: food?.displayName ?? row.raw_name,
        namedAt: '',
        all: newBucket(),
        meals: new Map(),
      };
      entries.set(key, entry);
    }
    // A food shows under its own name; a name still waiting for values shows as it was last typed.
    const stamp = `${row.local_date} ${row.created_at ?? ''}`;
    if (!food && stamp >= entry.namedAt) {
      entry.namedAt = stamp;
      entry.displayName = row.raw_name;
    }
    add(entry.all, row);
    if (row.meal !== null && isMeal(row.meal)) {
      let bucket = entry.meals.get(row.meal);
      if (!bucket) entry.meals.set(row.meal, (bucket = newBucket()));
      add(bucket, row);
    }
  }

  const foods: HistoryFood[] = [];
  for (const entry of entries.values()) {
    const meals: HistoryFood['meals'] = {};
    for (const [meal, bucket] of entry.meals) meals[meal] = summarize(bucket, today);
    foods.push({ foodId: entry.foodId, name: entry.name, displayName: entry.displayName, ...summarize(entry.all, today), meals });
  }
  // Plain comparisons, not `localeCompare`: the names are normalized already, and the first `localeCompare` of a cold request loads the
  // locale data, which is a large share of a free plan's CPU time.
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return foods
    .sort((a, b) => b.score - a.score || b.days - a.days || compare(b.lastDate, a.lastDate) || compare(a.name, b.name))
    .slice(0, MAX_HISTORY_FOODS);
}
