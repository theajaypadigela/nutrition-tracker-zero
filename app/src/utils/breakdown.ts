/**
 * What the breakdown screen shows and how it is grouped: the logged items behind one nutrient's total. The arithmetic is not here. It is the
 * Worker's own function (domain/report/breakdown.ts), used for a span of days by `GET /reports/breakdown` and for a day the app already has
 * by `breakdownOfDay`, so the list, the dashboard and the report cannot disagree. Only grouping and wording are the app's.
 */
import type { BreakdownItem, Day, Meal, NutrientBreakdown } from '@/api/types';
import { fill } from '@/i18n/fill';
import { strings } from '@/i18n/strings';
import { addDays } from './dates';
import { capitalize, formatAmount, formatNumber, formatQuantity } from './format';
import { fmtNum } from './nutrition';
import { buildBreakdown } from '../../../worker/src/domain/report/breakdown';
import type { NutrientKey } from '../../../worker/src/domain/nutrients';

const t = strings.breakdown;

/** The breakdown of a day the app already has: the same list the Worker would send for that one day. */
export function breakdownOfDay(day: Day, nutrient: string): NutrientBreakdown {
  const b = buildBreakdown(
    day.items.map(i => ({
      id: i.id,
      date: day.date,
      meal: i.meal,
      rawName: i.rawName,
      foodName: i.foodName,
      quantity: i.quantity,
      unit: i.unit,
      foodId: i.foodId,
      status: i.status,
      nutrients: i.nutrients,
    })),
    nutrient as NutrientKey,
  );
  return { ...b, nutrient, items: b.items as BreakdownItem[], range: { from: day.date, to: day.date, through: day.date }, display: { numbersHidden: false } };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** An amount exactly as stored, to two decimals with no trailing zeros: the figure the items add up with. */
export function exactAmount(value: number): string {
  return round2(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export type BreakdownOrigin = 'today' | 'report';

/**
 * The total as the dashboard it came from writes it, so "56 g" there reads "56 g" here. Today rounds grams to a tenth (a whole number from
 * 100) and energy to a whole number; the report's cards use `fmtNum`. A lower bound reads as the dashboard says it ("≥ 56 g", "At least 56 g").
 */
export function dashboardTotal(origin: BreakdownOrigin, nutrient: string, unit: string, total: number, lowerBound: boolean): string {
  if (origin === 'today') {
    const value = nutrient === 'calories' ? formatNumber(total) : formatAmount(total);
    return `${lowerBound ? '≥ ' : ''}${value} ${unit}`;
  }
  const figure = fmtNum(total, unit);
  return lowerBound ? fill(strings.report.periods.atLeast, { value: figure }) : figure;
}

/** The exact sum, written with the same words around it as the dashboard's figure ("≥ 56.83 g"), for comparing the two. */
export function exactTotal(origin: BreakdownOrigin, unit: string, total: number, lowerBound: boolean): string {
  const figure = `${exactAmount(total)} ${unit}`;
  if (origin === 'today') return `${lowerBound ? '≥ ' : ''}${figure}`;
  return lowerBound ? fill(strings.report.periods.atLeast, { value: figure }) : figure;
}

export interface BreakdownGroup {
  key: string;
  title: string;
  /** The items of the group, in the order they were logged. */
  items: BreakdownItem[];
  /** What the group's items add up to (exactly), or null when none of them has a value. */
  subtotal: number | null;
  /** Items in the group with no value for the nutrient. */
  missing: number;
}

function sumKnown(items: readonly BreakdownItem[]): { subtotal: number | null; missing: number } {
  let sum = 0;
  let known = 0;
  for (const i of items) {
    if (i.amount !== null) {
      sum += i.amount;
      known++;
    }
  }
  return { subtotal: known > 0 ? round2(sum) : null, missing: items.length - known };
}

const MEAL_ORDER: (Meal | null)[] = ['breakfast', 'lunch', 'snack', 'dinner', null];

/** One day's items by meal, in the order of the day; items logged with no meal come last, as "Other". */
export function groupByMeal(items: readonly BreakdownItem[]): BreakdownGroup[] {
  return MEAL_ORDER.map(meal => {
    const inMeal = items.filter(i => i.meal === meal);
    return { key: meal ?? 'other', title: meal ? capitalize(meal) : t.other, items: inMeal, ...sumKnown(inMeal) };
  }).filter(g => g.items.length > 0);
}

/** A span's items by day, oldest first, each day with its own subtotal. */
export function groupByDay(items: readonly BreakdownItem[], titleOf: (date: string) => string): BreakdownGroup[] {
  const days: string[] = [];
  const byDay = new Map<string, BreakdownItem[]>();
  for (const i of items) {
    if (!byDay.has(i.date)) {
      byDay.set(i.date, []);
      days.push(i.date);
    }
    byDay.get(i.date)!.push(i);
  }
  return days.sort().map(date => ({ key: date, title: titleOf(date), items: byDay.get(date)!, ...sumKnown(byDay.get(date)!) }));
}

/** The amounts logged of one food, in the units they were logged in: "7 piece", or "2 piece + 1 katori". */
export function quantityText(items: readonly BreakdownItem[]): string {
  const byUnit = new Map<string, number>();
  for (const i of items) byUnit.set(i.unit, (byUnit.get(i.unit) ?? 0) + i.quantity);
  return [...byUnit].map(([unit, quantity]) => formatQuantity(quantity, unit)).join(' + ');
}

/** The same food logged on several days, added together: what it came to in all, biggest contribution first. Unknown ones come last. */
export function groupByFood(items: readonly BreakdownItem[]): BreakdownGroup[] {
  const byFood = new Map<string, { title: string; items: BreakdownItem[] }>();
  for (const i of items) {
    const key = i.foodId ? `food:${i.foodId}` : `raw:${i.rawName.trim().toLowerCase()}`;
    const entry = byFood.get(key) ?? { title: i.foodName ?? i.rawName, items: [] };
    entry.items.push(i);
    byFood.set(key, entry);
  }
  return [...byFood]
    .map(([key, e]) => ({ key, title: e.title, items: e.items, ...sumKnown(e.items) }))
    .sort((a, b) => (b.subtotal ?? -1) - (a.subtotal ?? -1) || a.title.localeCompare(b.title));
}

/** Days with food in a span, and the average over them: the report's "Daily average" for the same figure (round(total / logged days)). */
export function dailyAverage(b: NutrientBreakdown): { days: number; average: number } | null {
  if (b.total === null) return null;
  const days = new Set(b.items.map(i => i.date)).size;
  return days > 0 ? { days, average: round2(b.total / days) } : null;
}

/** "Wed, Oct 14" for a group header (the span's own year is understood). */
export function dayTitle(date: string, today: string): string {
  if (date === today) return t.today;
  if (date === addDays(today, -1)) return t.yesterday;
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}
