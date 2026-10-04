import { describe, expect, it } from 'vitest';
import { parseItemList } from '../../src/domain/items';

describe('parseItemList', () => {
  it('normalizes names, units, meals and numeric strings', () => {
    const r = parseItemList([{ name: ' Idlis ', quantity: '3', unit: 'pieces', meal: 'Breakfast' }, { name: 'tea', quantity: 1, unit: 'cup', meal: 'snacks' }]);
    expect(r).toEqual({
      items: [
        { rawName: 'Idlis', normalizedName: 'idli', quantity: 3, unit: 'piece', meal: 'breakfast' },
        { rawName: 'tea', normalizedName: 'tea', quantity: 1, unit: 'cup', meal: 'snack' },
      ],
    });
  });
  it('keeps unknown units raw (they become pending_unit)', () => {
    const r = parseItemList([{ name: 'almonds', quantity: 1, unit: 'Handfuls' }]);
    expect('items' in r && r.items[0]!.unit).toBe('handful');
  });
  it.each([
    [[], /non-empty/],
    ['nope', /non-empty/],
    [Array.from({ length: 51 }, () => ({ name: 'x', quantity: 1, unit: 'g' })), /At most 50/],
    [[{ name: '', quantity: 1, unit: 'g' }], /Item 1: name/],
    [[{ name: 'x'.repeat(81), quantity: 1, unit: 'g' }], /name must be 1-80/],
    [[{ name: 'rice', quantity: 0, unit: 'g' }], /quantity must be a positive/],
    [[{ name: 'rice', quantity: 'lots', unit: 'g' }], /quantity/],
    [[{ name: 'rice', quantity: 1 }], /unit is missing/],
    [[{ name: 'rice', quantity: 1, unit: 'g', meal: 'brunch' }], /meal must be/],
  ])('rejects %#', (input, message) => {
    const r = parseItemList(input);
    expect('error' in r && r.error).toMatch(message);
  });
});
