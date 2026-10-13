/**
 * Checking the food data itself (WEEKLY_BREAKDOWN_PLAN.md 7.4, Phase 4): hard rules refuse impossible values, soft rules ask about
 * probable typos, and an unknown value (null) is never checked while a zero is.
 */
import { describe, expect, it } from 'vitest';
import { checkFood } from '../../../src/domain/quality/foodChecks';
import type { NutrientKey } from '../../../src/domain/nutrients';

const check = (baseUnit: string, nutrients: Partial<Record<NutrientKey, number | null>>, units: { unit: string; servings: number }[] = []) => checkFood({ baseUnit, nutrients, units });
const ids = (r: ReturnType<typeof check>) => ({ errors: r.errors.map((e) => e.id), warnings: r.warnings.map((w) => w.id) });
const none = { errors: [], warnings: [] };

// An idli: 4P + 4C + 9F = 4×2 + 4×10 + 9×0.2 = 49.8, so 50 kcal reads right.
const IDLI = { calories: 50, protein: 2, carbs: 10, fat: 0.2 };

describe('a food that adds up raises nothing', () => {
  it('a plain food with a few values', () => expect(ids(check('piece', IDLI))).toEqual(none));
  it('a food with only calories: nothing to compare', () => expect(ids(check('katori', { calories: 180 }))).toEqual(none));
  it('every value unknown but calories, or null: unknown is never checked', () => {
    expect(ids(check('piece', { calories: 50, sugar: null, carbs: null, fat: null, protein: null }))).toEqual(none);
  });
  it('rounding on a pack label is no error: half a gram of slack', () => {
    expect(ids(check('piece', { calories: 50, carbs: 10, sugar: 10.4 }))).toEqual(none);
    expect(ids(check('piece', { calories: 50, carbs: 10, sugar: 10.6 })).errors).toEqual(['sugar_over_carbs']);
  });
});

describe('hard rules: the values cannot all be true', () => {
  it('sugars over carbohydrate', () => {
    const r = check('piece', { calories: 80, carbs: 10, sugar: 14 });
    expect(r.errors).toEqual([{ id: 'sugar_over_carbs', severity: 'error', nutrient: 'sugar', params: { sugar: 14, carbs: 10 } }]);
  });
  it('fibre over carbohydrate', () => expect(ids(check('piece', { calories: 80, carbs: 10, fiber: 12 })).errors).toEqual(['fibre_over_carbs']));
  it('saturated fat over total fat', () => expect(ids(check('piece', { calories: 120, fat: 8, saturatedFat: 11 })).errors).toEqual(['sat_fat_over_fat']));
  it('added sugars over total sugars', () => expect(ids(check('piece', { calories: 120, carbs: 30, sugar: 10, addedSugar: 14 })).errors).toEqual(['added_over_sugar']));

  describe('a part over a whole of 0: the whole was not filled in, so nothing is said', () => {
    // The food form saves an empty field as 0. Someone who knows a food's fibre but not its carbohydrate must still be able to save it.
    it('fibre, sugars, saturated fat and added sugars with the whole left empty', () => {
      expect(ids(check('piece', { calories: 100, carbs: 0, fiber: 3 }))).toEqual(none);
      expect(ids(check('piece', { calories: 100, carbs: 0, sugar: 12 }))).toEqual(none);
      expect(ids(check('piece', { calories: 100, fat: 0, saturatedFat: 4 }))).toEqual(none);
      expect(ids(check('piece', { calories: 100, carbs: 20, sugar: 0, addedSugar: 5 }))).toEqual(none);
    });

    it('a food with every value filled in is still checked, and a whole just above 0 is a whole', () => {
      expect(ids(check('piece', { calories: 100, carbs: 0.6, fiber: 3 })).errors).toEqual(['fibre_over_carbs']);
      expect(ids(check('piece', { calories: 80, carbs: 10, sugar: 14 })).errors).toEqual(['sugar_over_carbs']);
    });

    it('a null whole is still unknown, as before', () => {
      expect(ids(check('piece', { calories: 100, carbs: null, fiber: 3 }))).toEqual(none);
    });
  });

  it('over 100 g of protein, carbohydrate and fat in 100 g', () => {
    const r = check('100 g', { calories: 400, protein: 40, carbs: 40, fat: 25 });
    expect(r.errors[0]).toMatchObject({ id: 'macros_over_100g', params: { total: 105, base: '100 g' } });
    expect(ids(check('100 ml', { calories: 400, protein: 40, carbs: 40, fat: 22 })).errors).toEqual([]); // 102 g is allowed
  });
  it('over 900 kcal in 100 g (pure fat is about 900)', () => {
    expect(ids(check('100 g', { calories: 950, fat: 99 })).errors).toEqual(['calories_over_900']);
    expect(ids(check('100 g', { calories: 900, fat: 99 })).errors).toEqual([]);
  });
  it('over 40,000 mg of sodium in 100 g (pure salt is about 39,000)', () => {
    expect(ids(check('100 g', { calories: 0, sodium: 45000 })).errors).toEqual(['sodium_over_40000']);
    expect(ids(check('100 g', { calories: 0, sodium: 39000 })).errors).toEqual([]);
  });
  it('the per-100 g limits do not apply to a serving: a katori of ghee-rich food can be 950 kcal', () => {
    expect(ids(check('katori', { calories: 950, fat: 99, protein: 1, carbs: 1 })).errors).toEqual([]);
  });
  it('reports every rule that broke, not only the first', () => {
    expect(ids(check('100 g', { calories: 950, carbs: 10, sugar: 20, fiber: 15, protein: 50, fat: 60 })).errors).toEqual(['sugar_over_carbs', 'fibre_over_carbs', 'macros_over_100g', 'calories_over_900']);
  });
});

describe('soft rule: calories against 4 protein + 4 carbohydrate + 9 fat (21 CFR 101.9)', () => {
  it('a typo of ten times the calories raises a warning before saving (Phase 4 exit criterion)', () => {
    const r = check('piece', { ...IDLI, calories: 500 });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([{ id: 'calories_vs_macros', severity: 'warning', nutrient: 'calories', params: { calories: 500, expected: 50 } }]);
  });
  it('also a tenth of the calories, and a missing zero', () => {
    expect(ids(check('piece', { ...IDLI, calories: 5 })).warnings).toEqual([]); // under 20 kcal rounding dominates
    expect(ids(check('piece', { calories: 20, protein: 20, carbs: 100, fat: 5 })).warnings).toEqual(['calories_vs_macros']);
  });
  it('allows the 20% a label may differ by, and warns outside 75% to 125%', () => {
    const warns = (kcal: number) => ids(check('piece', { calories: kcal, protein: 10, carbs: 20, fat: 5 })).warnings.length > 0; // expected 165
    expect([warns(123), warns(124), warns(165), warns(206), warns(207)]).toEqual([true, false, false, false, true]);
    expect([warns(200), warns(130)]).toEqual([false, false]);
  });
  it('needs all three macros to compare: a missing one is unknown, so there is nothing to say', () => {
    expect(ids(check('piece', { calories: 500, protein: 2, carbs: 10 }))).toEqual(none);
  });
  it('a zero is data: 300 kcal with protein, carbohydrate and fat all zero cannot be right', () => {
    expect(ids(check('piece', { calories: 300, protein: 0, carbs: 0, fat: 0 })).warnings).toEqual(['calories_vs_macros']);
  });
});

describe('soft rules: an implausible serving', () => {
  it('over 1,500 kcal in one katori, cup, piece or slice', () => {
    expect(ids(check('katori', { calories: 1800 })).warnings).toEqual(['serving_calories_high']);
    expect(ids(check('plate', { calories: 1500 })).warnings).toEqual([]);
    expect(ids(check('100 g', { calories: 800 })).warnings).toEqual([]); // dense per 100 g is allowed
  });
  it('over 5,000 mg of sodium in one serving', () => expect(ids(check('bowl', { calories: 200, sodium: 5200 })).warnings).toEqual(['serving_sodium_high']));
  it('a vitamin or mineral over ten times its daily reference in one serving', () => {
    const r = check('piece', { calories: 90, iron: 140, vitaminB12: 30, zinc: 9, folate: 300 });
    expect(r.warnings.map((w) => w.nutrient).sort()).toEqual(['iron', 'vitaminB12']);
    expect(r.warnings.find((w) => w.nutrient === 'iron')).toMatchObject({ id: 'serving_nutrient_high', params: { value: 140, reference: 13 } });
  });
  it('an implausible weight for a unit conversion on a per-100 g food', () => {
    expect(ids(check('100 g', { calories: 200 }, [{ unit: 'piece', servings: 30 }])).warnings).toEqual(['unit_weight_implausible']);
    expect(ids(check('100 g', { calories: 200 }, [{ unit: 'piece', servings: 0.01 }])).warnings).toEqual(['unit_weight_implausible']);
    expect(ids(check('100 g', { calories: 200 }, [{ unit: 'piece', servings: 0.5 }])).warnings).toEqual([]);
    expect(check('100 g', { calories: 200 }, [{ unit: 'piece', servings: 30 }]).warnings[0]!.params).toEqual({ unit: 'piece', amount: 3000, base: '100 g' });
  });
});

describe('soft rules: raw or dry food measured in a cooked helping (plan 7.7)', () => {
  const raw = (baseUnit: string, units: { unit: string; servings: number }[] = []) => checkFood({ baseUnit, nutrients: { calories: 350 }, units, form: 'raw' });

  it('asks about each katori, bowl, plate or serving of food whose numbers are for it raw', () => {
    const r = raw('100 g', [{ unit: 'katori', servings: 0.5 }, { unit: 'bowl', servings: 0.8 }, { unit: 'cup', servings: 0.9 }]);
    expect(r.warnings.filter((w) => w.id === 'raw_serving_unit').map((w) => w.params.unit)).toEqual(['katori', 'bowl']);
    expect(raw('katori').warnings.map((w) => w.id)).toEqual(['raw_serving_unit']);
  });

  it('is quiet for food as eaten, when nobody said, and for raw food in grams, spoons or pieces', () => {
    const units = [{ unit: 'katori', servings: 1.5 }];
    expect(checkFood({ baseUnit: '100 g', nutrients: { calories: 130 }, units, form: 'as_eaten' }).warnings).toEqual([]);
    expect(checkFood({ baseUnit: '100 g', nutrients: { calories: 130 }, units }).warnings).toEqual([]);
    expect(raw('100 g', [{ unit: 'tbsp', servings: 0.15 }, { unit: 'piece', servings: 0.5 }]).warnings).toEqual([]);
  });

  it('never refuses a save over it', () => expect(raw('plate').errors).toEqual([]));
});
