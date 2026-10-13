import { readNumber } from './foodData';

/** How far one tap of + or - moves an amount in this unit: a whole piece, half a katori, ten grams, a quarter of a kilo. */
export function stepFor(unit: string): number {
  switch (unit) {
    case 'piece':
    case 'slice':
    case 'tbsp':
    case 'tsp':
      return 1;
    case 'g':
    case 'ml':
      return 10;
    case 'kg':
    case 'l':
      return 0.25;
    case 'katori':
    case 'bowl':
    case 'plate':
    case 'cup':
    case 'glass':
    case 'serving':
      return 0.5;
    default:
      return 1;
  }
}

/** An amount as it is typed: no trailing zeros, at most two decimals. */
export const quantityText = (quantity: number): string => String(Math.round(quantity * 100) / 100);

/**
 * `text` moved one step up (+1) or down (-1) in `unit`. Going down stops at one step (an amount of nothing is removed, not set to 0);
 * what is not a number yet starts at one step either way.
 */
export function stepQuantity(text: string, unit: string, direction: 1 | -1): string {
  const step = stepFor(unit);
  const current = readNumber(text);
  if (current === null || current <= 0) return quantityText(step);
  if (direction > 0) return quantityText(current + step);
  return quantityText(current <= step ? current : Math.max(current - step, step));
}

/** Whether the amount is a number above 0. */
export function validQuantity(text: string): boolean {
  const n = readNumber(text);
  return n !== null && n > 0;
}
