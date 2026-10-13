/**
 * An amount worth a second look (WEEKLY_BREAKDOWN_PLAN.md 7.7, typos): most often a voice call that heard "twenty" for "two" or
 * kilograms for katoris, or a slip of the thumb. One wrong amount moves every figure of the week, so it is worth a prompt. It is
 * only a prompt: the item still counts, because a festival meal can be large, and only the person knows.
 *
 * The edges are design choices [A]: well past an ordinary helping, so a big meal does not trip them, and they are a prompt, never
 * a rejection. A pending item has no energy yet, so the count and weight rules are what can catch it.
 */

export type AmountCheck = 'large_energy' | 'many_servings' | 'large_weight';

/** More energy than this in one logged item is unusual for any single dish (a whole large pizza is about 2,000 kcal). */
export const MAX_ITEM_KCAL = 2000;

/** More of these in one item is unusual: helpings of a cooked dish, drinks, spoonfuls, pieces. */
export const MAX_COUNT: Readonly<Record<string, number>> = {
  katori: 6,
  bowl: 6,
  plate: 4,
  serving: 6,
  cup: 8,
  glass: 8,
  tbsp: 15,
  tsp: 20,
  slice: 12,
  piece: 30,
};
/** Any other unit (a handful, a ladle, a packet) past this many. */
export const MAX_COUNT_OTHER = 10;

/** More than 1.5 kg of a food, or 3 litres of a drink, in one item. */
export const MAX_METRIC: Readonly<Record<string, number>> = { g: 1500, kg: 1.5, ml: 3000, l: 3 };

export interface AmountInput {
  quantity: number;
  unit: string;
  /** The item's energy, or null while it is pending. */
  kcal: number | null;
}

/** Why an amount is worth a check, or null when it looks ordinary. Energy first: it is the figure a wrong amount moves most. */
export function checkAmount(item: AmountInput): AmountCheck | null {
  if (item.kcal !== null && item.kcal > MAX_ITEM_KCAL) return 'large_energy';
  const metric = MAX_METRIC[item.unit];
  if (metric !== undefined) return item.quantity > metric ? 'large_weight' : null;
  return item.quantity > (MAX_COUNT[item.unit] ?? MAX_COUNT_OTHER) ? 'many_servings' : null;
}

/** How unusual a flagged amount is, for ordering several: energy over the limit, else how far past its edge the count is. */
export function amountSeverity(item: AmountInput): number {
  if (item.kcal !== null && item.kcal > MAX_ITEM_KCAL) return item.kcal / MAX_ITEM_KCAL;
  const edge = MAX_METRIC[item.unit] ?? MAX_COUNT[item.unit] ?? MAX_COUNT_OTHER;
  return item.quantity / edge;
}
