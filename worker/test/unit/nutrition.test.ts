import { describe, expect, it } from 'vitest';
import { matchName } from '../../src/domain/match';
import { factor, itemNutrients, resolveItem, sumNutrients } from '../../src/domain/nutrition';
import { planChanges } from '../../src/domain/resolve';
import { sampleIndex } from './helpers';

const index = sampleIndex();
const f = (id: string) => index.byId.get(id)!;

describe('matchName', () => {
  it('matches names and aliases exactly, never fuzzily', () => {
    expect(matchName(index, 'rice')?.id).toBe('rice');
    expect(matchName(index, 'chawal')?.id).toBe('rice');
    expect(matchName(index, 'toor dal')?.id).toBe('dal');
    expect(matchName(index, 'ric')).toBeUndefined();
    expect(matchName(index, 'brown rice')).toBeUndefined();
  });
});

describe('factor', () => {
  it('is 1 for the base unit', () => expect(factor(index, f('dal'), 'katori')).toBe(1));
  it('uses a stored conversion', () => expect(factor(index, f('rice'), 'katori')).toBe(1.5));
  it('applies metric rules onto 100 g / 100 ml bases', () => {
    expect(factor(index, f('rice'), 'g')).toBe(0.01);
    expect(factor(index, f('rice'), 'kg')).toBe(10);
    expect(factor(index, f('milk'), 'ml')).toBe(0.01);
    expect(factor(index, f('milk'), 'l')).toBe(10);
  });
  it('does not apply metric rules across dimensions', () => {
    expect(factor(index, f('milk'), 'g')).toBeNull();
    expect(factor(index, f('rice'), 'ml')).toBeNull();
  });
  it('derives kg from a stored g conversion (weight helper)', () => {
    expect(factor(index, f('idli'), 'g')).toBeCloseTo(0.025);
    expect(factor(index, f('idli'), 'kg')).toBeCloseTo(25);
  });
  it('fixes the old "1 cup vs 100 g = ×0.01" bug: unknown units are pending, not guessed', () => {
    expect(factor(index, f('rice'), 'cup')).toBeNull();
  });
});

describe('resolveItem', () => {
  it('resolves, pends on food, pends on unit', () => {
    expect(resolveItem(index, 'chawal', 'katori')).toEqual({ foodId: 'rice', status: 'resolved' });
    expect(resolveItem(index, 'poha', 'plate')).toEqual({ foodId: null, status: 'pending_food' });
    expect(resolveItem(index, 'dal', 'cup')).toEqual({ foodId: 'dal', status: 'pending_unit' });
  });
});

describe('nutrition at read time', () => {
  it('scales by quantity × factor', () => {
    const n = itemNutrients(index, { food_id: 'rice', quantity: 2, unit: 'katori', status: 'resolved' });
    expect(n.calories).toBe(390);
    expect(n.protein).toBe(8.1);
    expect(n.fat).toBeNull();
  });

  it('gives nothing for pending items', () => {
    const n = itemNutrients(index, { food_id: 'dal', quantity: 1, unit: 'cup', status: 'pending_unit' });
    expect(n.calories).toBeNull();
  });

  it('sums values and counts missing items per nutrient', () => {
    const items = [
      itemNutrients(index, { food_id: 'rice', quantity: 200, unit: 'g', status: 'resolved' }),
      itemNutrients(index, { food_id: 'idli', quantity: 3, unit: 'piece', status: 'resolved' }),
      itemNutrients(index, { food_id: null, quantity: 1, unit: 'plate', status: 'pending_food' }),
    ];
    const totals = sumNutrients(items);
    expect(totals.calories).toEqual({ value: 377, missingItems: 1 });
    expect(totals.protein).toEqual({ value: 11.4, missingItems: 1 });
    expect(totals.carbs).toEqual({ value: 56, missingItems: 2 });
    expect(totals.zinc).toEqual({ value: 0, missingItems: 3 });
  });
});

describe('planChanges', () => {
  it('only reports items whose food or status changes', () => {
    const changes = planChanges(index, [
      { id: '1', normalized_name: 'chawal', unit: 'katori', food_id: null, status: 'pending_food' },
      { id: '2', normalized_name: 'rice', unit: 'g', food_id: 'rice', status: 'resolved' },
      { id: '3', normalized_name: 'rice', unit: 'cup', food_id: 'rice', status: 'resolved' },
      { id: '4', normalized_name: 'poha', unit: 'plate', food_id: null, status: 'pending_food' },
    ]);
    expect(changes).toEqual([
      { id: '1', foodId: 'rice', status: 'resolved' },
      { id: '3', foodId: 'rice', status: 'pending_unit' },
    ]);
  });
});
