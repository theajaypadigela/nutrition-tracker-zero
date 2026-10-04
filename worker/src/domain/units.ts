import { singularize } from './normalize';

/** Units the assistant and forms may log (the tool enum). */
export const LOGGED_UNITS = [
  'piece', 'slice', 'katori', 'bowl', 'plate', 'cup', 'glass', 'tbsp', 'tsp', 'serving', 'g', 'kg', 'ml', 'l',
] as const;

/** Units a food's nutrients can be expressed per. */
export const BASE_UNITS = [
  'piece', 'slice', 'katori', 'bowl', 'plate', 'cup', 'glass', 'tbsp', 'tsp', 'serving', '100 g', '100 ml',
] as const;

export const MEALS = ['breakfast', 'lunch', 'snack', 'dinner'] as const;

export type LoggedUnit = (typeof LOGGED_UNITS)[number];
export type BaseUnit = (typeof BASE_UNITS)[number];
export type Meal = (typeof MEALS)[number];

const ALIASES: Record<string, string> = {};
function alias(canonical: string, ...spoken: string[]) {
  for (const s of [canonical, ...spoken]) ALIASES[s] = canonical;
}
// Logged units.
alias('g', 'gram', 'grams', 'gm', 'gms', 'gr', 'grm', 'grms');
alias('kg', 'kgs', 'kilogram', 'kilograms', 'kilo', 'kilos');
alias('ml', 'mls', 'milliliter', 'milliliters', 'millilitre', 'millilitres');
alias('l', 'ltr', 'ltrs', 'liter', 'liters', 'litre', 'litres');
alias('cup', 'cups', 'cupful', 'cupfuls');
alias('tbsp', 'tbsps', 'tablespoon', 'tablespoons', 'table spoon', 'table spoons', 'tbl', 'tbs');
alias('tsp', 'tsps', 'teaspoon', 'teaspoons', 'tea spoon', 'tea spoons');
alias('piece', 'pieces', 'pc', 'pcs', 'item', 'items', 'whole', 'nos', 'no', 'number', 'numbers', 'unit', 'units');
alias('serving', 'servings', 'portion', 'portions', 'helping', 'helpings');
alias('bowl', 'bowls');
alias('katori', 'katoris', 'katoree', 'vati', 'vatis', 'wati');
alias('plate', 'plates', 'thali', 'thalis');
alias('slice', 'slices');
alias('glass', 'glasses');
// Not loggable by the assistant, but normalized so pending conversions group together.
alias('scoop', 'scoops');
alias('handful', 'handfuls');
alias('packet', 'packets', 'pack', 'packs');
alias('can', 'cans', 'tin', 'tins');
alias('bottle', 'bottles');
alias('spoon', 'spoons', 'spoonful', 'spoonfuls');
alias('ladle', 'ladles');
alias('oz', 'ounce', 'ounces');
alias('lb', 'lbs', 'pound', 'pounds');

function clean(raw: string): string {
  return raw.toLowerCase().replace(/[.]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Maps a spoken or typed unit to its canonical form. Unknown units come back cleaned and
 * singularized (never empty for non-blank input) so they can be stored as `pending_unit`.
 */
export function normalizeUnit(raw: string): string {
  const cleaned = clean(raw);
  if (!cleaned) return '';
  const known = ALIASES[cleaned];
  if (known) return known;
  const words = cleaned.split(' ');
  words[words.length - 1] = singularize(words[words.length - 1]!);
  const singular = words.join(' ');
  return ALIASES[singular] ?? singular;
}

export function isLoggedUnit(unit: string): unit is LoggedUnit {
  return (LOGGED_UNITS as readonly string[]).includes(unit);
}

/** Accepts "100g", "100 grams", "per 100 ml", "katoris", … Returns null when it isn't a base unit. */
export function normalizeBaseUnit(raw: string): BaseUnit | null {
  const cleaned = clean(raw).replace(/^per /, '');
  const metric = /^100 ?(.+)$/.exec(cleaned);
  if (metric) {
    const unit = normalizeUnit(metric[1]!);
    if (unit === 'g') return '100 g';
    if (unit === 'ml') return '100 ml';
    return null;
  }
  const unit = normalizeUnit(cleaned);
  return (BASE_UNITS as readonly string[]).includes(unit) ? (unit as BaseUnit) : null;
}

export function isMeal(value: unknown): value is Meal {
  return typeof value === 'string' && (MEALS as readonly string[]).includes(value);
}

/** Fixed metric conversions onto a "100 g" / "100 ml" base (PLAN.md §7). */
export const METRIC_FACTORS: Record<string, { base: BaseUnit; factor: number }> = {
  g: { base: '100 g', factor: 0.01 },
  kg: { base: '100 g', factor: 10 },
  ml: { base: '100 ml', factor: 0.01 },
  l: { base: '100 ml', factor: 10 },
};
