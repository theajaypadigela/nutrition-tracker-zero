import { badRequest } from './http';
import { NUTRIENTS, type NutrientKey } from './domain/nutrients';

export function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw badRequest('Body must be a JSON object');
  return body as Record<string, unknown>;
}

export function trimmedString(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== 'string') throw badRequest(`${field} must be a string`);
  const s = value.trim().replace(/\s+/g, ' ');
  if (s.length < min || s.length > max) throw badRequest(`${field} must be ${min}-${max} characters`);
  return s;
}

export function positiveInt(value: string | undefined, field: string): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw badRequest(`${field} must be a positive integer`);
  return n;
}

const MAX_NUTRIENT = 100_000;

/**
 * Parses `{calories: 120, protein: 3.5, iron: null, …}`. Unknown keys are rejected; null clears an
 * optional nutrient. With `requireCalories`, calories must be present and non-null.
 */
export function parseNutrients(
  raw: unknown,
  requireCalories: boolean,
): Partial<Record<NutrientKey, number | null>> {
  const obj = asObject(raw ?? {});
  const out: Partial<Record<NutrientKey, number | null>> = {};
  const known = new Set<string>(NUTRIENTS.map((n) => n.key));
  for (const [key, value] of Object.entries(obj)) {
    if (!known.has(key)) throw badRequest(`Unknown nutrient: ${key}`);
    if (value === null || value === '') {
      if (key === 'calories') throw badRequest('calories is required');
      out[key as NutrientKey] = null;
      continue;
    }
    const n = typeof value === 'string' ? Number(value) : value;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > MAX_NUTRIENT) {
      throw badRequest(`${key} must be a number between 0 and ${MAX_NUTRIENT}`);
    }
    out[key as NutrientKey] = n;
  }
  if (requireCalories && typeof out.calories !== 'number') throw badRequest('calories is required');
  return out;
}

export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed|SQLITE_CONSTRAINT/i.test(err.message);
}
