import { describe, expect, it } from 'vitest';
import { normalizeBaseUnit, normalizeUnit } from '../../src/domain/units';

describe('normalizeUnit', () => {
  it.each([
    ['grams', 'g'],
    ['GM', 'g'],
    ['Katoris', 'katori'],
    ['thali', 'plate'],
    ['pcs', 'piece'],
    ['Tablespoons', 'tbsp'],
    ['tea spoon', 'tsp'],
    ['litres', 'l'],
    ['glasses', 'glass'],
    ['handfuls', 'handful'],
    ['pouches', 'pouch'],
    ['  bowl. ', 'bowl'],
    ['', ''],
  ])('%j → %j', (input, expected) => {
    expect(normalizeUnit(input)).toBe(expected);
  });
});

describe('normalizeBaseUnit', () => {
  it.each([
    ['100g', '100 g'],
    ['100 grams', '100 g'],
    ['per 100 ml', '100 ml'],
    ['katoris', 'katori'],
    ['Piece', 'piece'],
    ['g', null],
    ['200 g', null],
    ['handful', null],
  ])('%j → %j', (input, expected) => {
    expect(normalizeBaseUnit(input)).toBe(expected);
  });
});
