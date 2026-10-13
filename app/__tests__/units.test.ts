import { ageOn } from '@/utils/dates';
import {
  activityFromSteps,
  cmToFeetInches,
  feetInchesToCm,
  heightCm,
  kgToLb,
  lbToKg,
  parseNumber,
  stonesPoundsToKg,
  weightKg,
  type HeightEntry,
  type WeightEntry,
} from '@/utils/units';

describe('unit conversions (plan 4.1: 1 lb = 0.45359237 kg, 1 in = 2.54 cm)', () => {
  it('converts pounds, stones and feet exactly as the Worker does, so the form and the server agree', () => {
    expect(lbToKg(100)).toBeCloseTo(45.359237, 9);
    expect(stonesPoundsToKg(10, 7)).toBeCloseTo(66.678, 3);
    expect(stonesPoundsToKg(0, 154.3236)).toBeCloseTo(70, 3);
    expect(feetInchesToCm(5, 7)).toBeCloseTo(170.18, 9);
    expect(feetInchesToCm(6, 0)).toBeCloseTo(182.88, 9);
    expect(feetInchesToCm(0, 63)).toBeCloseTo(160.02, 9);
  });

  it('round-trips', () => {
    expect(kgToLb(lbToKg(155))).toBeCloseTo(155, 9);
    const { feet, inches } = cmToFeetInches(170.18);
    expect([feet, inches]).toEqual([5, 7]);
    expect(cmToFeetInches(160)).toEqual({ feet: 5, inches: 3 });
  });
});

describe('what a person types', () => {
  it('accepts a decimal comma and spaces, and nothing else', () => {
    expect(parseNumber(' 70,5 ')).toBe(70.5);
    expect(parseNumber('70.5')).toBe(70.5);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('   ')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('1e999')).toBeNull();
    expect(parseNumber('70 kg')).toBeNull();
  });

  const h = (over: Partial<HeightEntry>): HeightEntry => ({ unit: 'cm', cm: '', feet: '', inches: '', ...over });
  const w = (over: Partial<WeightEntry>): WeightEntry => ({
    unit: 'kg',
    kg: '',
    lb: '',
    stones: '',
    stonePounds: '',
    ...over,
  });

  it('turns a height into centimetres, or null while it is incomplete', () => {
    expect(heightCm(h({ cm: '165' }))).toBe(165);
    expect(heightCm(h({ cm: '' }))).toBeNull();
    expect(heightCm(h({ unit: 'ftin', feet: '5', inches: '7' }))).toBeCloseTo(170.18, 9);
    expect(heightCm(h({ unit: 'ftin', feet: '5', inches: '' }))).toBeCloseTo(152.4, 9); // inches left empty is zero
    expect(heightCm(h({ unit: 'ftin', feet: '', inches: '7' }))).toBeNull();
  });

  it('turns a weight into kilograms, or null while it is incomplete', () => {
    expect(weightKg(w({ kg: '62,5' }))).toBe(62.5);
    expect(weightKg(w({ unit: 'lb', lb: '154' }))).toBeCloseTo(69.853, 3);
    expect(weightKg(w({ unit: 'st', stones: '10', stonePounds: '7' }))).toBeCloseTo(66.678, 3);
    expect(weightKg(w({ unit: 'st', stones: '10', stonePounds: '' }))).toBeCloseTo(63.503, 3);
    expect(weightKg(w({ unit: 'lb', lb: '' }))).toBeNull();
    expect(weightKg(w({ unit: 'st', stones: '', stonePounds: '7' }))).toBeNull();
  });

  it('suggests an activity card from steps, and only that: the bands are not calibrated to the categories', () => {
    expect([0, 4999, 5000, 9999, 10000, 12499, 12500, 30000].map(activityFromSteps)).toEqual([
      'inactive',
      'inactive',
      'low_active',
      'low_active',
      'active',
      'active',
      'very_active',
      'very_active',
    ]);
  });
});

describe("age, by the Worker's rule (plan 4.1)", () => {
  it('is the year difference, minus one while the birth month has not been reached', () => {
    expect(ageOn('2026-10-12', 1996, 3)).toBe(30);
    expect(ageOn('2026-10-12', 1996, 10)).toBe(30);
    expect(ageOn('2026-10-12', 1996, 11)).toBe(29);
  });

  it('assumes a July birthday when there is no month, so the 19th birthday edge is the same on the phone and the server', () => {
    expect(ageOn('2026-06-30', 2007, null)).toBe(18);
    expect(ageOn('2026-07-01', 2007, null)).toBe(19);
    expect(ageOn('2026-10-12', 2007, 10)).toBe(19);
    expect(ageOn('2026-10-12', 2007, 11)).toBe(18);
  });
});
