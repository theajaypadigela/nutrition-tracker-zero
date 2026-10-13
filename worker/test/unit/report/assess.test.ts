/**
 * Assessing one nutrient (WEEKLY_BREAKDOWN_PLAN.md 5.4, 7.1, 7.3, 11.5): the lower-bound rule, coverage, and
 * the rule that zero is data and blank is not.
 */
import { describe, expect, it } from 'vitest';
import { assessNutrient, dayMeets, type AssessInput } from '../../../src/domain/report/assess';
import type { Target } from '../../../src/domain/targets/types';
import { day, item } from './helpers';

const minimum = (value: number): Target => ({ nutrient: 'protein', kind: 'minimum', unit: 'g', value, refType: 'estimate', window: 'week', evidence: 'A', basis: 'protein-per-kg', how: 'x', scored: true, verdicts: true, origin: 'recommended' });
const limit = (value: number): Target => ({ ...minimum(value), nutrient: 'sodium', kind: 'limit', unit: 'mg', refType: 'limit' });
const range = (value: number): Target => ({ ...minimum(value), nutrient: 'fat', kind: 'range', low: value * 0.67, high: value * 1.17, refType: 'range' });
const energy = (value: number): Target => ({ ...minimum(value), nutrient: 'calories', kind: 'energy', unit: 'kcal', refType: 'estimate' });
const assess = (over: Partial<AssessInput> & { target: Target | null }) =>
  assessNutrient({ mean: 50, coverage: 1, assessedDays: 5, verdicts: true, nutrient: over.target?.nutrient ?? 'protein', ...over });

describe('a minimum: a partial total can prove "enough", never "below"', () => {
  it('meets from 90%, is a little low from 75%, below under that, on complete data', () => {
    expect(assess({ target: minimum(60), mean: 54 }).assessment).toBe('meets');
    expect(assess({ target: minimum(60), mean: 53.9 }).assessment).toBe('close');
    expect(assess({ target: minimum(60), mean: 45 }).assessment).toBe('close');
    expect(assess({ target: minimum(60), mean: 44.9 }).assessment).toBe('below');
    expect(assess({ target: minimum(60), mean: 200 }).assessment).toBe('meets');
  });

  it('on partial data: meets is allowed, below is not', () => {
    expect(assess({ target: minimum(60), mean: 70, coverage: 0.6 })).toMatchObject({ assessment: 'meets', isLowerBound: true });
    expect(assess({ target: minimum(60), mean: 20, coverage: 0.6 })).toMatchObject({ assessment: 'unknown', isLowerBound: true });
    expect(assess({ target: minimum(60), mean: 20, coverage: 0.9 }).assessment).toBe('below'); // 90% counts as complete
  });

  it('says nothing under half coverage, and gives no mean', () => {
    expect(assess({ target: minimum(60), mean: 20, coverage: 0.49 })).toMatchObject({ assessment: 'unknown', mean: null });
  });
});

describe('a limit: a partial total can prove "over", never "within"', () => {
  it('is within at or under it, above it past it, and well above past 1.25 times it', () => {
    expect(assess({ target: limit(2300), mean: 2300 }).assessment).toBe('meets');
    expect(assess({ target: limit(2300), mean: 2301 }).assessment).toBe('over');
    expect(assess({ target: limit(2300), mean: 2875 }).assessment).toBe('over');
    expect(assess({ target: limit(2300), mean: 2876 }).assessment).toBe('well_over');
  });

  it('on partial data: over is allowed (even at low coverage), within is not', () => {
    expect(assess({ target: limit(2300), mean: 3100, coverage: 0.3 })).toMatchObject({ assessment: 'well_over', isLowerBound: true });
    expect(assess({ target: limit(2300), mean: 1800, coverage: 0.6 })).toMatchObject({ assessment: 'unknown', isLowerBound: true });
    expect(assess({ target: limit(2300), mean: 1800, coverage: 0.9 }).assessment).toBe('meets');
  });
});

describe('a range, energy, and the cases with no verdict', () => {
  it('judges a macronutrient by its SHARE of the energy logged, so under-logging does not move it', () => {
    expect(assess({ target: range(72), mean: 60, share: 0.3 }).assessment).toBe('in_range');
    expect(assess({ target: range(72), mean: 60, share: 0.19 }).assessment).toBe('outside');
    expect(assess({ target: range(72), mean: 60, share: 0.36 }).assessment).toBe('outside');
    expect(assess({ target: range(72), mean: 60, share: 0.2 }).assessment).toBe('in_range');
    expect(assess({ target: range(72), mean: 60, share: 0.35 }).assessment).toBe('in_range');
    // Partial: a share already above the range proves it; inside the range proves nothing.
    expect(assess({ target: range(72), mean: 60, share: 0.4, coverage: 0.6 }).assessment).toBe('outside');
    expect(assess({ target: range(72), mean: 60, share: 0.3, coverage: 0.6 }).assessment).toBe('unknown');
  });

  it('judges fat by the range its own set gives: 15% to 35% on ICMR-NIN, 20% to 35% on the National Academies, and the latter for a target that carries none', () => {
    const indian = { ...range(72), shareRange: { low: 0.15, high: 0.35 } };
    const american = { ...range(72), shareRange: { low: 0.2, high: 0.35 } };
    for (const [target, share, expected] of [
      [indian, 0.17, 'in_range'],
      [indian, 0.15, 'in_range'],
      [indian, 0.14, 'outside'],
      [indian, 0.36, 'outside'],
      [american, 0.17, 'outside'],
      [range(72), 0.17, 'outside'], // stored before targets carried a range
    ] as const) {
      expect([share, assess({ target, mean: 60, share }).assessment]).toEqual([share, expected]);
    }
    // A day is held to the same range.
    expect(dayMeets({ target: indian, value: 40, complete: true, share: 0.17, nutrient: 'fat' })).toBe(true);
    expect(dayMeets({ target: american, value: 40, complete: true, share: 0.17, nutrient: 'fat' })).toBe(false);
    // A partial total that is already above the range still proves it, on either set.
    expect(assess({ target: indian, mean: 60, share: 0.4, coverage: 0.6 }).assessment).toBe('outside');
  });

  it('judges energy near, above or below a personal target, within 10%', () => {
    const e = (mean: number, coverage = 1) => assess({ target: energy(2000), mean, coverage, nutrient: 'calories' }).assessment;
    expect([e(2200), e(1800), e(2201), e(1799)]).toEqual(['meets', 'meets', 'over', 'below']);
    expect(e(1500, 0.7)).toBe('unknown');
  });

  it('shows the amount, without a verdict, when there is no target or verdicts are off', () => {
    expect(assess({ target: null }).assessment).toBe('amount_only');
    expect(assess({ target: { ...minimum(60), verdicts: false }, verdicts: false }).assessment).toBe('amount_only');
    expect(assess({ target: minimum(60), assessedDays: 0, mean: 0 })).toMatchObject({ assessment: 'unknown', mean: null });
  });
});

describe('days meeting a target', () => {
  it('uses the same rule per day, and a limit is only "within" on a day with complete data', () => {
    expect(dayMeets({ target: minimum(60), value: 54, complete: false, nutrient: 'protein' })).toBe(true);
    expect(dayMeets({ target: minimum(60), value: 53, complete: true, nutrient: 'protein' })).toBe(false);
    expect(dayMeets({ target: limit(2300), value: 2000, complete: true, nutrient: 'sodium' })).toBe(true);
    expect(dayMeets({ target: limit(2300), value: 2000, complete: false, nutrient: 'sodium' })).toBe(false);
    expect(dayMeets({ target: limit(2300), value: 2400, complete: true, nutrient: 'sodium' })).toBe(false);
    expect(dayMeets({ target: range(72), value: 70, complete: true, share: 0.3, nutrient: 'fat' })).toBe(true);
  });
});
