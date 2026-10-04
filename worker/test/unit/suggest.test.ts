import { describe, expect, it } from 'vitest';
import { dice, suggest, tokenSet } from '../../src/domain/suggest';
import { sampleIndex } from './helpers';

describe('similarity', () => {
  it('dice', () => {
    expect(dice('rice', 'rice')).toBe(1);
    expect(dice('rice', 'ryce')).toBeGreaterThan(0.3);
    expect(dice('rice', 'milk')).toBeLessThan(0.2);
  });
  it('tokenSet', () => {
    expect(tokenSet('masala dosa', 'dosa')).toBe(0.5);
    expect(tokenSet('jeera rice', 'rice jeera')).toBe(1);
  });
});

describe('suggest', () => {
  const index = sampleIndex();
  it('offers close names and aliases, one per food, best first', () => {
    const s = suggest(index, 'brown rice');
    expect(s[0]).toMatchObject({ foodId: 'rice' });
    expect(s.filter((x) => x.foodId === 'rice')).toHaveLength(1);
  });
  it('finds typos', () => {
    expect(suggest(index, 'idly')[0]?.foodId).toBe('idli');
  });
  it('returns nothing below the threshold and at most 3', () => {
    expect(suggest(index, 'paneer butter masala')).toEqual([]);
    expect(suggest(index, 'rice dal milk idli', 3, 0).length).toBeLessThanOrEqual(3);
  });
});
