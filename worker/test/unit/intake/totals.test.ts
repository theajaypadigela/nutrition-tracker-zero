/** Adding up what was logged (WEEKLY_BREAKDOWN_PLAN.md 5.2): the foods that supplied the most of a nutrient. */
import { describe, expect, it } from 'vitest';
import { topSources } from '../../../src/domain/intake/totals';
import { day, item } from '../report/helpers';

describe('top sources', () => {
  it('names up to three foods by their share of the known total', () => {
    const days = [day('d', [item(100, { sodium: 600 }, { foodId: 'a', name: 'mango pickle' }), item(100, { sodium: 300 }, { foodId: 'b', name: 'papad' }), item(100, { sodium: 100 }, { foodId: 'c', name: 'rice' }), item(100, { sodium: 50 }, { foodId: 'd', name: 'tea' }), item(100, { sodium: null }, { foodId: 'e', name: 'unknown' })])];
    const top = topSources(days, 'sodium');
    expect(top.map((t) => t.name)).toEqual(['mango pickle', 'papad', 'rice']);
    expect(top[0]!.share).toBeCloseTo(600 / 1050, 12);
    expect(topSources(days, 'zinc')).toEqual([]);
  });
});
