/**
 * How much of a nutrient is known (WEEKLY_BREAKDOWN_PLAN.md 7.3, 11.5): coverage by energy, by items for a limit, and the rule that
 * zero is data and blank is not.
 */
import { describe, expect, it } from 'vitest';
import { itemAmount, totalsOf } from '../../../src/domain/intake/totals';
import { coverageOf, energyCoverage, itemCoverage } from '../../../src/domain/quality/coverage';
import { day, item } from '../report/helpers';

describe('coverage (plan 7.3)', () => {
  const pickle = [item(800, { sodium: 600 }), item(20, { sodium: null })]; // a pickle: few calories, a lot of sodium, no value entered

  it('is the share of logged energy from foods that have a value', () => {
    const t = totalsOf([day('d', pickle)], 'sodium');
    expect(energyCoverage(t)).toBeCloseTo(800 / 820, 12);
    expect(itemCoverage(t)).toBe(0.5);
  });

  it('for a limit is the LOWER of that and the share of items, so a pickle is not hidden behind a main meal', () => {
    const t = totalsOf([day('d', pickle)], 'sodium');
    expect(coverageOf(t, false)).toBeCloseTo(0.9756, 3);
    expect(coverageOf(t, true)).toBe(0.5);
  });

  it('zero is data and blank is not: a food entered with vitamin D 0 is known, a blank is unknown', () => {
    expect(itemAmount(item(100, { vitaminD: 0 }), 'vitaminD')).toBe(0);
    expect(itemAmount(item(100, { vitaminD: null }), 'vitaminD')).toBeNull();
    expect(itemAmount(item(100, {}), 'vitaminD')).toBeNull();
    const zero = totalsOf([day('d', [item(100, { vitaminD: 0 })])], 'vitaminD');
    const blank = totalsOf([day('d', [item(100, { vitaminD: null })])], 'vitaminD');
    expect([coverageOf(zero, false), coverageOf(blank, false)]).toEqual([1, 0]);
  });

  it('leaves pending items out of coverage: they are counted separately, and decide the day', () => {
    const t = totalsOf([day('d', [item(500, { protein: 20 }), item(null, {}, { pending: true })])], 'protein');
    expect(t).toMatchObject({ known: 20, itemsAll: 1, itemsKnown: 1 });
  });
});
