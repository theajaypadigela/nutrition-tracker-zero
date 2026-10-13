/**
 * What is missing or uncertain in a week's figures (WEEKLY_BREAKDOWN_PLAN.md 7.4, 7.7, 7.8): foods without the values the report
 * reads, amounts worth a second look, and where the numbers come from. It describes and corrects nothing.
 */
import { describe, expect, it } from 'vitest';
import { GAP_NUTRIENTS } from '../../../src/domain/quality/foodGaps';
import { MAX_AMOUNTS_SHOWN, weekQuality } from '../../../src/domain/quality/week';
import type { NutrientKey } from '../../../src/domain/nutrients';
import { day, item } from '../report/helpers';

/** Every value the report reads, so a food has no gaps. */
const full = Object.fromEntries(GAP_NUTRIENTS.map((k) => [k, 1])) as Partial<Record<NutrientKey, number>>;
const D1 = '2026-10-05';
const D2 = '2026-10-06';

describe('foods with gaps', () => {
  it('counts the distinct foods behind the counted days that lack a value, with their share of the energy, largest first', () => {
    const counted = [
      day(D1, [item(600, full, { foodId: 'thali', name: 'Thali', source: 'recipe' }), item(300, { ...full, zinc: null }, { foodId: 'dosa', name: 'Dosa' }), item(100, { protein: 3 }, { foodId: 'tea', name: 'Tea' })]),
      day(D2, [item(300, { ...full, zinc: null }, { foodId: 'dosa', name: 'Dosa' })]),
    ];
    const q = weekQuality({ counted, open: counted });
    expect(q.foodsWithGaps.count).toBe(2);
    expect(q.foodsWithGaps.energyShare).toBeCloseTo(700 / 1300, 12);
    expect(q.foodsWithGaps.names).toEqual(['Dosa', 'Tea']);
    // Zinc is missing on Dosa and Tea (700 kcal); Tea also lacks everything but protein (100 kcal): zinc first, then the catalogue's order.
    expect(q.foodsWithGaps.missing).toEqual(['zinc', 'fiber', 'sodium']);
  });

  it('treats an absent value like a blank one, and a zero as known', () => {
    const counted = [day(D1, [item(100, { ...full, sodium: 0 }, { foodId: 'a', name: 'A' }), item(100, { protein: 1 }, { foodId: 'b', name: 'B' })])];
    expect(weekQuality({ counted, open: [] }).foodsWithGaps).toMatchObject({ count: 1, names: ['B'] });
  });

  it('leaves pending items and days that do not count out', () => {
    const counted = [day(D1, [item(500, full, { foodId: 'a', name: 'A' }), item(null, {}, { pending: true, name: 'mystery' })])];
    const q = weekQuality({ counted, open: counted });
    expect(q.foodsWithGaps).toEqual({ count: 0, energyShare: 0, names: [], missing: [] });
    expect(weekQuality({ counted: [], open: [] }).foodsWithGaps).toEqual({ count: 0, energyShare: 0, names: [], missing: [] });
  });
});

describe('where the numbers come from', () => {
  it('splits the logged energy by the source recorded on each food, with "none" when nobody said', () => {
    const counted = [day(D1, [item(500, full, { source: 'label' }), item(300, full, { source: 'estimate' }), item(200, full)])];
    expect(weekQuality({ counted, open: [] }).valueSources).toEqual({ label: 0.5, database: 0, recipe: 0, estimate: 0.3, none: 0.2 });
  });

  it('is all zero with nothing logged', () => {
    expect(Object.values(weekQuality({ counted: [], open: [] }).valueSources)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('amounts to check', () => {
  it('lists unusual amounts on any open day, the most unusual first, pending ones included', () => {
    const open = [
      day(D1, [item(300, full, { name: 'Rice', quantity: 2, unit: 'katori' }), item(2600, full, { name: 'Roti', quantity: 20, unit: 'piece' })]),
      day(D2, [item(null, {}, { pending: true, name: 'Kheer', quantity: 12, unit: 'katori' }), item(5000, full, { name: 'Biryani', quantity: 2, unit: 'kg' })]),
    ];
    const q = weekQuality({ counted: [], open });
    // By how far past its edge each is: 5,000 kcal is 2.5 times the energy edge, 12 katoris twice theirs, 2,600 kcal 1.3 times.
    expect(q.amountsToCheck.map((a) => [a.name, a.reason])).toEqual([
      ['Biryani', 'large_energy'],
      ['Kheer', 'many_servings'],
      ['Roti', 'large_energy'],
    ]);
    expect(q.amountsToCheck[1]).toEqual({ date: D2, name: 'Kheer', quantity: 12, unit: 'katori', kcal: null, reason: 'many_servings' });
  });

  it('shows at most five, and ignores items without a recorded amount', () => {
    const many = Array.from({ length: 8 }, (_, i) => item(3000 + i, full, { name: `big ${i}`, quantity: 1, unit: 'plate' }));
    const q = weekQuality({ counted: [], open: [day(D1, [...many, item(9000, full, { name: 'no amount' })])] });
    expect(q.amountsToCheck).toHaveLength(MAX_AMOUNTS_SHOWN);
    expect(q.amountsToCheck.map((a) => a.name)).not.toContain('no amount');
  });
});
