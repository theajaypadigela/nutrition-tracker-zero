import { normalizeName } from './normalize';
import { normalizeUnit, isMeal, type Meal } from './units';
import { resolveItem, type ItemStatus } from './intake/items';
import type { FoodIndex } from './match';

export interface ItemInput {
  rawName: string;
  normalizedName: string;
  quantity: number;
  unit: string;
  meal: Meal | null;
}

export const MAX_NAME = 80;
export const MAX_QUANTITY = 100_000;
const MAX_UNIT = 30;

export function parseQuantity(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value.trim()) : value;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= MAX_QUANTITY ? n : null;
}

export function parseMeal(value: unknown): Meal | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return undefined;
  let m = value.trim().toLowerCase();
  if (m === 'snacks') m = 'snack';
  return isMeal(m) ? m : undefined;
}

/** Validates one item; returns an error sentence (1-based position) on failure. */
export function parseItem(raw: unknown, position: number): ItemInput | string {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return `Item ${position} must be an object.`;
  const r = raw as Record<string, unknown>;
  const rawName = typeof r.name === 'string' ? r.name.trim().replace(/\s+/g, ' ') : '';
  if (rawName.length < 1 || rawName.length > MAX_NAME) return `Item ${position}: name must be 1-${MAX_NAME} characters.`;
  const normalizedName = normalizeName(rawName);
  if (!normalizedName) return `Item ${position}: name must contain letters or digits.`;
  const quantity = parseQuantity(r.quantity);
  if (quantity === null) return `Item ${position} (${rawName}): quantity must be a positive number.`;
  const unit = typeof r.unit === 'string' ? normalizeUnit(r.unit) : '';
  if (!unit || unit.length > MAX_UNIT) return `Item ${position} (${rawName}): unit is missing.`;
  const meal = parseMeal(r.meal);
  if (meal === undefined) return `Item ${position} (${rawName}): meal must be breakfast, lunch, snack or dinner.`;
  return { rawName, normalizedName, quantity, unit, meal };
}

export function parseItemList(raw: unknown, max = 50): { items: ItemInput[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'items must be a non-empty list.' };
  if (raw.length > max) return { error: `At most ${max} items per save.` };
  const items: ItemInput[] = [];
  for (let i = 0; i < raw.length; i++) {
    const parsed = parseItem(raw[i], i + 1);
    if (typeof parsed === 'string') return { error: parsed };
    items.push(parsed);
  }
  return { items };
}

export interface NewItem extends ItemInput {
  id: string;
  foodId: string | null;
  status: ItemStatus;
}

export function prepareItems(index: FoodIndex, inputs: ItemInput[]): NewItem[] {
  return inputs.map((input) => ({
    ...input,
    id: crypto.randomUUID(),
    ...resolveItem(index, input.normalizedName, input.unit),
  }));
}
