/**
 * The nutrients of migration 0003 in the targets (WEEKLY_BREAKDOWN_PLAN.md 4.4, 4.6, Phase 4): saturated fat and added sugars as
 * limits of 10% of the energy target, vitamin B12 and folate from the consolidated NASEM tables, judged over four weeks.
 */
import { describe, expect, it } from 'vitest';
import { NUTRIENTS } from '../../../src/domain/nutrients';
import { energyLimitGrams, genericReference, microReference } from '../../../src/domain/reference/nasem';
import { SOURCES } from '../../../src/domain/reference/sources';
import { computeTargets, genericTargetSet } from '../../../src/domain/targets/engine';
import type { HealthProfileInput } from '../../../src/domain/targets/types';

const ASHA: HealthProfileInput = {
  birthYear: 1996,
  birthMonth: 6,
  sexForCalc: 'female',
  heightCm: 160,
  weightKg: 60,
  activity: 'low_active',
  goal: 'general_health',
  pace: 'standard',
  pattern: 'omnivore',
  referenceSet: 'nasem',
};
const set = (over: Partial<HealthProfileInput> = {}, safety?: Parameters<typeof computeTargets>[2]) => computeTargets({ ...ASHA, ...over }, '2026-10-05', safety);
const target = (s: ReturnType<typeof set>, key: string) => s.targets.find((t) => t.nutrient === key)!;

describe('saturated fat and added sugars: limits of 10% of the energy target (plan 4.4)', () => {
  it('are worked out from the person\'s own energy target, in whole grams', () => {
    const s = set();
    expect(target(s, 'calories').value).toBe(2150);
    expect(target(s, 'saturatedFat')).toMatchObject({ kind: 'limit', value: 24, unit: 'g', window: 'week', refType: 'limit', evidence: 'R', basis: 'who-saturated-fat', origin: 'recommended', verdicts: true });
    expect(target(s, 'addedSugar')).toMatchObject({ kind: 'limit', value: 54, unit: 'g', window: 'week', refType: 'limit', evidence: 'R', basis: 'who-sugars' });
  });

  it('follow the goal: a lower energy target, a lower limit', () => {
    // Asha's BMI is 23.4, where a loss goal is not offered; a person at BMI 31 gets one.
    const heavy = { heightCm: 165, weightKg: 85 };
    const keep = target(set(heavy), 'calories').value;
    const lose = set({ ...heavy, goal: 'lose' });
    const e = target(lose, 'calories').value;
    expect(e).toBeLessThan(keep);
    expect(target(lose, 'saturatedFat').value).toBe(Math.round((0.1 * e) / 9));
    expect(target(lose, 'addedSugar').value).toBe(Math.round((0.1 * e) / 4));
    expect(target(lose, 'saturatedFat').value).toBeLessThan(target(set(heavy), 'saturatedFat').value);
  });

  it('say how they were worked out, in plain words, and name the aspiration of under 5% for sugars', () => {
    const s = set();
    expect(target(s, 'saturatedFat').how).toBe('At most 10% of your energy target from saturated fat, about 24 g a day (WHO, 2023).');
    expect(target(s, 'addedSugar').how).toMatch(/^At most 10% of your energy target from added \(free\) sugars, about 54 g a day\. WHO says under 5%, about 27 g, may bring further benefit\./);
    expect(target(s, 'addedSugar').how).toMatch(/Total sugars have no limit/);
  });

  it('are the generic reference of a 2,000 kcal diet when there is no profile', () => {
    expect(genericReference('saturatedFat')).toBe(22);
    expect(genericReference('addedSugar')).toBe(50);
    const g = genericTargetSet('2026-10-05');
    expect(target(g, 'saturatedFat')).toMatchObject({ kind: 'limit', value: 22, basis: 'who-saturated-fat', origin: 'recommended' });
    expect(target(g, 'addedSugar')).toMatchObject({ kind: 'limit', value: 50, basis: 'who-sugars' });
    expect(target(g, 'saturatedFat').how).toMatch(/general reference, not personal/i);
  });

  it('have no target for total sugars still: no authority limits them', () => {
    expect(set().targets.find((t) => t.nutrient === 'sugar')).toBeUndefined();
    expect(genericReference('sugar')).toBeNull();
  });

  it('are in a reference-only set nowhere: a gate that fires leaves no targets', () => {
    expect(set({}, { safety: { pregnantOrBreastfeeding: true, eatingDisorder: false, clinicianDiet: false, dietInteractingMedicine: false } }).targets).toEqual([]);
  });

  it('round the same way the helper does', () => {
    expect([energyLimitGrams('saturatedFat', 2000), energyLimitGrams('addedSugar', 2000), energyLimitGrams('addedSugar', 1500)]).toEqual([22, 50, 38]);
  });
});

describe('vitamin B12 and folate (plan 4.6)', () => {
  it('are reference intakes for every adult age band, from the consolidated NASEM tables', () => {
    for (const sex of ['female', 'male', 'average'] as const) {
      for (const band of ['19-30', '31-50', '51-70', '>70'] as const) {
        expect(microReference('vitaminB12', sex, band)).toMatchObject({ value: 2.4, type: 'RDA', ear: 2 });
        expect(microReference('folate', sex, band)).toMatchObject({ value: 400, type: 'RDA', ear: 320 });
      }
    }
  });

  it('are minimums judged over four weeks, with no upper level compared to food (folic acid\'s is for supplements only)', () => {
    const s = set();
    expect(target(s, 'vitaminB12')).toMatchObject({ kind: 'minimum', value: 2.4, unit: 'mcg', window: 'four_weeks', refType: 'RDA', basis: 'nasem-dri-appendix-j' });
    expect(target(s, 'folate')).toMatchObject({ kind: 'minimum', value: 400, unit: 'mcg DFE', window: 'four_weeks', refType: 'RDA' });
    expect(target(s, 'vitaminB12').upperLevel).toBeUndefined();
    expect(target(s, 'folate').upperLevel).toBeUndefined();
    expect(microReference('folate', 'female', '19-30')).toMatchObject({ upperLevel: 1000, upperScope: 'supplements_only' });
  });

  it('carry a note that supplements and fortified foods may be missing from the log', () => {
    const s = set();
    expect(target(s, 'vitaminB12').how).toMatch(/Supplements and fortified foods may not be in your log\./);
    expect(target(s, 'folate').how).toMatch(/dietary folate equivalents/);
  });

  it('are the generic reference of an average adult', () => {
    expect([genericReference('vitaminB12'), genericReference('folate')]).toEqual([2.4, 400]);
    const g = genericTargetSet('2026-10-05');
    expect(target(g, 'vitaminB12')).toMatchObject({ window: 'four_weeks', basis: 'nasem-dri-appendix-j', value: 2.4 });
  });
});

describe('the catalogue and the registry agree', () => {
  it('has the four new nutrients, with the columns of migration 0003', () => {
    const cols = Object.fromEntries(NUTRIENTS.map((n) => [n.key, n.column]));
    expect([cols.saturatedFat, cols.addedSugar, cols.vitaminB12, cols.folate]).toEqual(['saturated_fat_g', 'added_sugar_g', 'vitamin_b12_mcg', 'folate_mcg']);
    expect(NUTRIENTS).toHaveLength(21);
  });

  it('points every new target at a source with a title and a link', () => {
    const s = set();
    for (const key of ['saturatedFat', 'addedSugar', 'vitaminB12', 'folate']) {
      const src = SOURCES[target(s, key).basis as keyof typeof SOURCES];
      expect(src, key).toBeDefined();
      expect(src.url, key).toMatch(/^https:\/\//);
    }
  });
});
