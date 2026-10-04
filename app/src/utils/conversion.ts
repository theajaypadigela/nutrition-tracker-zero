/** Turns the number a person types into servings of a food's base unit (PLAN.md §8). */

const WEIGHT: Record<string, number> = { g: 1, kg: 1000 };
const VOLUME: Record<string, number> = { ml: 1, l: 1000 };

type Mode =
  /** base "100 g": 1 katori weighs X g → servings = X / 100 */
  | { kind: 'per100'; measure: 'g' | 'ml' }
  /** count base, metric unit: one piece weighs X g → servings per 1 unit = factor / X */
  | { kind: 'weightHelper'; measure: 'g' | 'ml'; factor: number }
  | { kind: 'direct' };

export function conversionMode(baseUnit: string, unit: string): Mode {
  if (baseUnit === '100 g' && !(unit in WEIGHT)) return { kind: 'per100', measure: 'g' };
  if (baseUnit === '100 ml' && !(unit in VOLUME)) return { kind: 'per100', measure: 'ml' };
  if (unit in WEIGHT && !baseUnit.startsWith('100 ')) return { kind: 'weightHelper', measure: 'g', factor: WEIGHT[unit]! };
  if (unit in VOLUME && !baseUnit.startsWith('100 ')) return { kind: 'weightHelper', measure: 'ml', factor: VOLUME[unit]! };
  return { kind: 'direct' };
}

/** servings of the base unit in one `unit`, from the number the user typed. */
export function servingsFrom(mode: Mode, value: number): number {
  if (mode.kind === 'per100') return value / 100;
  if (mode.kind === 'weightHelper') return mode.factor / value;
  return value;
}
