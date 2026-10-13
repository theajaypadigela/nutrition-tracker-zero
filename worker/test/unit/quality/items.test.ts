/**
 * An amount worth a second look (WEEKLY_BREAKDOWN_PLAN.md 7.7): a voice call that heard "twenty" for "two", kilograms for katoris,
 * or a slip of the thumb. A prompt, never a rejection, and quiet for an ordinary or a generous meal.
 */
import { describe, expect, it } from 'vitest';
import { MAX_COUNT, MAX_COUNT_OTHER, MAX_ITEM_KCAL, MAX_METRIC, amountSeverity, checkAmount } from '../../../src/domain/quality/items';

const at = (quantity: number, unit: string, kcal: number | null = null) => checkAmount({ quantity, unit, kcal });

describe('checkAmount', () => {
  it('is quiet for ordinary and generous helpings', () => {
    expect(at(2, 'katori', 300)).toBeNull();
    expect(at(4, 'piece', 156)).toBeNull(); // four idlis
    expect(at(6, 'katori', 900)).toBeNull(); // at the edge, not past it
    expect(at(3, 'glass', 0)).toBeNull(); // water
    expect(at(250, 'g', 330)).toBeNull();
    expect(at(1.5, 'kg', null)).toBeNull();
    expect(at(2, 'l', 0)).toBeNull();
    expect(at(1, 'plate', 1600)).toBeNull(); // a big thali is not a typo
  });

  it('asks about a single item with more energy than any one dish has', () => {
    expect(at(1, 'plate', MAX_ITEM_KCAL + 1)).toBe('large_energy');
    expect(at(20, 'piece', 2600)).toBe('large_energy'); // twenty rotis: energy first, it is what moves the figures
  });

  it('asks about counts past the edge of their unit, even while the food is still unknown', () => {
    expect(at(MAX_COUNT.katori! + 1, 'katori')).toBe('many_servings');
    expect(at(20, 'bowl')).toBe('many_servings');
    expect(at(MAX_COUNT.piece! + 1, 'piece')).toBe('many_servings');
    expect(at(MAX_COUNT.piece!, 'piece')).toBeNull();
    expect(at(MAX_COUNT_OTHER + 1, 'handful')).toBe('many_servings');
    expect(at(MAX_COUNT_OTHER, 'ladle')).toBeNull();
  });

  it('asks about a weight or a volume past what one item plausibly is', () => {
    expect(at(MAX_METRIC.g! + 1, 'g')).toBe('large_weight');
    expect(at(2, 'kg')).toBe('large_weight');
    expect(at(3500, 'ml')).toBe('large_weight');
    expect(at(4, 'l')).toBe('large_weight');
  });

  it('ranks how unusual an amount is, for ordering several', () => {
    expect(amountSeverity({ quantity: 1, unit: 'plate', kcal: 4000 })).toBe(2);
    expect(amountSeverity({ quantity: 12, unit: 'katori', kcal: null })).toBe(2);
    expect(amountSeverity({ quantity: 3, unit: 'kg', kcal: null })).toBe(2);
  });
});
