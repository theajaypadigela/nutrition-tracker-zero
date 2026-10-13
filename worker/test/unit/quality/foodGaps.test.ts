/**
 * "Foods with gaps" (WEEKLY_BREAKDOWN_PLAN.md Phase 4): ranked by share of logged energy, so the data gets filled where it matters.
 */
import { describe, expect, it } from 'vitest';
import { foodGaps, GAP_NUTRIENTS } from '../../../src/domain/quality/foodGaps';
import { buildIndex, type Food } from '../../../src/domain/match';
import { emptyNutrients, type NutrientKey } from '../../../src/domain/nutrients';

const food = (id: string, kcal: number, known: Partial<Record<NutrientKey, number>> = {}, over: Partial<Food> = {}): Food => ({
  id,
  name: id,
  displayName: id.toUpperCase(),
  baseUnit: 'serving',
  nutrients: { ...emptyNutrients(), calories: kcal, ...known },
  ...over,
});
const FULL: Partial<Record<NutrientKey, number>> = Object.fromEntries(GAP_NUTRIENTS.map((k) => [k, 1]));
const item = (id: string | null, quantity = 1, status = 'resolved') => ({ food_id: id, quantity, unit: 'serving', status });

describe('foods with gaps', () => {
  const index = buildIndex(
    [food('dal', 200, { protein: 10 }), food('rice', 400, { protein: 8, sodium: 5 }), food('tea', 40), food('curd', 100, FULL), food('pickle', 20, { protein: 0.2 })],
    [],
    [],
  );

  it('ranks the foods that are missing values by their share of the energy logged', () => {
    const r = foodGaps(index, [item('rice'), item('rice'), item('dal'), item('dal'), item('dal'), item('tea'), item('curd')]);
    // energy: rice 800, dal 600, tea 40, curd 100 (complete): total 1,540
    expect(r.foods.map((f) => f.foodId)).toEqual(['rice', 'dal', 'tea']);
    expect(r.foods[0]!.share).toBeCloseTo(800 / 1540, 9);
    expect(r.foods[1]!.share).toBeCloseTo(600 / 1540, 9);
    expect(r.foods.map((f) => f.items)).toEqual([2, 3, 1]);
  });

  it('names what each is missing, from the nutrients the report needs (not the vitamins)', () => {
    const r = foodGaps(index, [item('rice'), item('dal')]);
    expect(r.foods.find((f) => f.foodId === 'rice')!.missing).toEqual(['fiber', 'potassium', 'calcium', 'iron', 'magnesium', 'zinc', 'saturatedFat', 'addedSugar']);
    expect(r.foods.find((f) => f.foodId === 'dal')!.missing).toContain('sodium');
    expect(r.foods.find((f) => f.foodId === 'dal')!.missing).not.toContain('protein');
    expect(GAP_NUTRIENTS).not.toContain('vitaminD');
  });

  it('leaves out a food that has every value, and says how much of the energy those foods are', () => {
    const r = foodGaps(index, [item('curd'), item('curd'), item('rice')]);
    expect(r.foods.map((f) => f.foodId)).toEqual(['rice']);
    expect([r.loggedFoods, r.completeFoods]).toEqual([2, 1]);
    expect(r.completeShare).toBeCloseTo(200 / 600, 9); // curd 200 of 600 kcal
  });

  it('weights by quantity and by what a unit comes to, and ignores pending items and items with no food', () => {
    const idx = buildIndex([food('a', 100, {}), food('b', 100, {}, { baseUnit: 'katori' })], [], [{ food_id: 'b', unit: 'bowl', servings: 2 }]);
    const r = foodGaps(idx, [
      { food_id: 'a', quantity: 3, unit: 'serving', status: 'resolved' },
      { food_id: 'b', quantity: 1, unit: 'bowl', status: 'resolved' }, // 2 katori = 200 kcal
      { food_id: null, quantity: 1, unit: 'plate', status: 'pending_food' },
      { food_id: 'a', quantity: 1, unit: 'plate', status: 'pending_unit' },
    ]);
    expect(r.foods.map((f) => [f.foodId, Math.round(f.share * 100)])).toEqual([['a', 60], ['b', 40]]);
    expect(r.foods.map((f) => f.items)).toEqual([1, 1]); // the pending items are not counted
  });

  it('breaks ties by how often a food was logged, then by name, so the order never wobbles', () => {
    // a: one item of 200 kcal; b: four items of 50: the same share, and b was eaten more often.
    const idx = buildIndex([food('a', 100), food('b', 50), food('c', 100), food('d', 100)], [], []);
    const r = foodGaps(idx, [item('a', 2), item('b'), item('b'), item('b'), item('b')]);
    expect(r.foods.map((f) => f.foodId)).toEqual(['b', 'a']);
    // equal in every way: by name, whatever order they were logged in
    expect(foodGaps(idx, [item('d'), item('c')]).foods.map((f) => f.foodId)).toEqual(['c', 'd']);
    expect(foodGaps(idx, [item('c'), item('d')]).foods.map((f) => f.foodId)).toEqual(['c', 'd']);
  });

  it('carries where a food\'s numbers came from and when they were reviewed', () => {
    const idx = buildIndex([food('x', 100, {}, { source: 'label', reviewedAt: '2026-10-01T00:00:00.000Z' })], [], []);
    expect(foodGaps(idx, [item('x')]).foods[0]).toMatchObject({ source: 'label', reviewedAt: '2026-10-01T00:00:00.000Z', name: 'X' });
  });

  it('has an empty list and a zero share when nothing was logged', () => {
    expect(foodGaps(index, [])).toEqual({ foods: [], loggedFoods: 0, completeFoods: 0, completeShare: 0 });
  });

  it('keeps at most the limit asked for', () => {
    const many = Array.from({ length: 40 }, (_, i) => food(`f${i}`, 100 + i));
    const idx = buildIndex(many, [], []);
    expect(foodGaps(idx, many.map((f) => item(f.id)), 5).foods).toHaveLength(5);
    expect(foodGaps(idx, many.map((f) => item(f.id))).foods).toHaveLength(30);
  });
});
