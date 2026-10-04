import { describe, expect, it } from 'vitest';
import { normalizeName } from '../../src/domain/normalize';

describe('normalizeName', () => {
  it.each([
    ['Idlis', 'idli'],
    ['chapatis', 'chapati'],
    ['Tomatoes', 'tomato'],
    ['sandwiches', 'sandwich'],
    ['berries', 'berry'],
    ['Cookies', 'cookie'],
    ['  Masala   Dosas! ', 'masala dosa'],
    ['Crème Brûlée', 'creme brulee'],
    ['egg-whites', 'egg white'],
    ['glass', 'glass'],
    ['hummus', 'hummus'],
    ['rice', 'rice'],
    ['oats', 'oats'],
    ['french fries', 'french fry'],
    ['peas', 'pea'],
    ['boxes', 'box'],
    ['bus', 'bus'],
    ['dal', 'dal'],
    ['', ''],
    ['!!!', ''],
  ])('%j → %j', (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });

  it('only singularizes the last word', () => {
    expect(normalizeName('peas pulao')).toBe('peas pulao');
  });

  it('is idempotent', () => {
    for (const s of ['Idlis', 'tomatoes', 'berries', 'french fries', 'Masala Dosas', 'oats', 'boxes', 'cookies', 'hummus', 'chips']) {
      const once = normalizeName(s);
      expect(normalizeName(once)).toBe(once);
    }
  });
});
