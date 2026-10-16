import { describe, expect, it } from 'vitest';
import { sumNutrients } from '../../src/domain/intake/items';
import { NUTRIENT_KEYS, emptyNutrients, round, type NutrientValues } from '../../src/domain/nutrients';
import { buildBreakdown, type BreakdownInput } from '../../src/domain/report/breakdown';
import { buildRangeReport } from '../../src/domain/report/range';

const item = (id: string, nutrients: Partial<NutrientValues>, over: Partial<BreakdownInput> = {}): BreakdownInput => ({
  id,
  date: '2026-10-17',
  meal: 'breakfast',
  rawName: id,
  foodName: null,
  quantity: 1,
  unit: 'piece',
  foodId: id,
  status: 'resolved',
  nutrients: { ...emptyNutrients(), ...nutrients },
  ...over,
});

describe('buildBreakdown', () => {
  it('lists each item with what it contributed and adds them up: the example from the request', () => {
    const b = buildBreakdown(
      [item('Idli', { protein: 6 }), item('Paneer curry', { protein: 18 }), item('Rice and dal', { protein: 12 }), item('Eggs', { protein: 20 })],
      'protein',
    );
    expect(b.items.map((i) => [i.rawName, i.amount])).toEqual([['Idli', 6], ['Paneer curry', 18], ['Rice and dal', 12], ['Eggs', 20]]);
    expect(b.total).toBe(56);
    expect(b).toMatchObject({ knownItems: 4, missingItems: 0, isLowerBound: false });
    expect(b.items.reduce((s, i) => s + (i.amount ?? 0), 0)).toBe(b.total);
  });

  it('counts an item without a value as unknown, never as zero, and makes the total a minimum', () => {
    const b = buildBreakdown([item('a', { protein: 5 }), item('b', { protein: null }), item('c', { protein: 0 })], 'protein');
    expect(b.items.map((i) => i.amount)).toEqual([5, null, 0]);
    expect(b).toMatchObject({ total: 5, knownItems: 2, missingItems: 1, isLowerBound: true });
  });

  it('treats a pending item (no nutrients at all) as unknown for every nutrient', () => {
    const pending = item('quinoa', {}, { status: 'pending_food', foodId: null });
    for (const key of NUTRIENT_KEYS) {
      const b = buildBreakdown([pending, item('x', { [key]: 3 })], key);
      expect(b).toMatchObject({ total: 3, knownItems: 1, missingItems: 1, isLowerBound: true });
    }
  });

  it('has no total when nothing is known, and none of an empty list', () => {
    expect(buildBreakdown([item('a', { protein: null })], 'protein')).toMatchObject({ total: null, knownItems: 0, missingItems: 1, isLowerBound: false });
    expect(buildBreakdown([], 'protein')).toMatchObject({ total: null, knownItems: 0, missingItems: 0, isLowerBound: false, items: [] });
  });

  it('rounds the total like the dashboard does, so floating point never shows through', () => {
    const b = buildBreakdown([item('a', { protein: 0.1 }), item('b', { protein: 0.2 }), item('c', { protein: 0.07 })], 'protein');
    expect(b.total).toBe(0.37);
  });

  it('keeps the order it was given and carries what the list needs to show and to edit an item', () => {
    const b = buildBreakdown(
      [item('1', { fat: 2 }, { date: '2026-10-16', meal: null, foodName: 'Ghee', quantity: 1.5, unit: 'tsp' }), item('2', { fat: 1 }, { date: '2026-10-17' })],
      'fat',
    );
    expect(b.items[0]).toEqual({ id: '1', date: '2026-10-16', meal: null, rawName: '1', foodName: 'Ghee', quantity: 1.5, unit: 'tsp', foodId: '1', status: 'resolved', amount: 2 });
    expect(b.items.map((i) => i.id)).toEqual(['1', '2']);
  });
});

/** A small deterministic generator, so a failure can be reproduced. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

describe('buildBreakdown agrees with the dashboard, for every nutrient', () => {
  it('has the total of a day (sumNutrients) and of a range (buildRangeReport) over 300 random days', () => {
    const rand = lcg(20261017);
    for (let round_ = 0; round_ < 300; round_++) {
      const n = 1 + Math.floor(rand() * 12);
      const inputs: BreakdownInput[] = Array.from({ length: n }, (_, i) => {
        const pending = rand() < 0.15;
        const nutrients = emptyNutrients();
        if (!pending) {
          for (const key of NUTRIENT_KEYS) {
            // some values unknown, some zero, some with awkward decimals and quantities
            const r = rand();
            nutrients[key] = r < 0.2 ? null : r < 0.3 ? 0 : round(rand() * (key === 'calories' ? 600 : 40) * (1 + Math.floor(rand() * 3) / 4), 2);
          }
        }
        return item(`i${i}`, nutrients, { date: `2026-10-${String(10 + Math.floor(rand() * 3)).padStart(2, '0')}`, status: pending ? 'pending_food' : 'resolved', foodId: pending ? null : `f${i}` });
      });
      const day = sumNutrients(inputs.map((i) => i.nutrients as NutrientValues));
      const range = buildRangeReport({
        from: '2026-10-10',
        to: '2026-10-12',
        through: '2026-10-12',
        numbersHidden: false,
        skippedDates: [],
        items: inputs.map((i) => ({ date: i.date, pending: i.status !== 'resolved', nutrients: i.nutrients as NutrientValues })),
      });
      for (const key of NUTRIENT_KEYS) {
        const b = buildBreakdown(inputs, key);
        const asDay = day[key];
        // the sum of the amounts shown is the total shown (nothing is hidden or added)
        expect(round(b.items.reduce((s, i) => s + (i.amount ?? 0), 0))).toBe(b.total ?? 0);
        expect(b.total ?? 0).toBe(asDay.value);
        expect(b.missingItems).toBe(asDay.missingItems);
        const r = range.nutrients.find((x) => x.nutrient === key)!;
        expect(b.total).toBe(r.total);
        expect(b.missingItems).toBe(r.missingItems);
        expect(b.knownItems).toBe(r.knownItems);
        expect(b.isLowerBound).toBe(r.isLowerBound);
      }
    }
  });
});
