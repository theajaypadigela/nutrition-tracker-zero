/**
 * The words of a problem found in a food's numbers (WEEKLY_BREAKDOWN_PLAN.md 7.4): the Worker sends an id and numbers, the app words them.
 */
import type { FoodIssue, Meta } from '@/api/types';
import { issueText, issueTexts } from '@/utils/foodIssues';
import metaJson from './fixtures/meta.json';

const META = metaJson as unknown as Meta;
const issue = (id: string, params: FoodIssue['params'], nutrient?: string, severity: FoodIssue['severity'] = 'error'): FoodIssue => ({ id, severity, params, ...(nutrient ? { nutrient } : {}) });
const text = (i: FoodIssue) => issueText(i, META.nutrients);

describe('the words of a food issue', () => {
  it('says each hard rule with the numbers that broke it', () => {
    expect(text(issue('sugar_over_carbs', { sugar: 14, carbs: 10 }))).toBe('Sugars (14 g) are more than carbohydrate (10 g). Sugars are part of carbohydrate.');
    expect(text(issue('fibre_over_carbs', { fiber: 12, carbs: 10 }))).toBe('Fibre (12 g) is more than carbohydrate (10 g). Fibre is part of carbohydrate.');
    expect(text(issue('sat_fat_over_fat', { saturatedFat: 11, fat: 8 }))).toBe('Saturated fat (11 g) is more than total fat (8 g).');
    expect(text(issue('added_over_sugar', { addedSugar: 14, sugar: 10 }))).toBe('Added sugars (14 g) are more than total sugars (10 g).');
    expect(text(issue('macros_over_100g', { total: 105, base: '100 g' }))).toBe('Protein, carbohydrate and fat add up to 105 g in 100 g, which cannot be much more than 100 g.');
    expect(text(issue('calories_over_900', { calories: 950, base: '100 g' }))).toBe('950 kcal in 100 g is more than pure fat has, about 900. Please check the number.');
    expect(text(issue('sodium_over_40000', { sodium: 45000, base: '100 g' }))).toBe('45,000 mg of sodium in 100 g is more than pure salt has, about 39,000. Please check the number.');
  });

  it('says each soft rule as a question, never as a verdict', () => {
    expect(text(issue('calories_vs_macros', { calories: 500, expected: 50 }, 'calories', 'warning'))).toBe(
      'Protein, carbohydrate and fat suggest about 50 kcal, but the calories say 500. Labels can differ a little. Please check the calories.',
    );
    expect(text(issue('serving_calories_high', { calories: 1800, base: 'katori' }, 'calories', 'warning'))).toBe('1,800 kcal in one katori is a lot. Is that right?');
    expect(text(issue('serving_sodium_high', { sodium: 5200, base: 'bowl' }, 'sodium', 'warning'))).toBe('5,200 mg of sodium in one bowl is a lot. Is that right?');
    expect(text(issue('unit_weight_implausible', { unit: 'piece', amount: 4000, base: '100 g' }, undefined, 'warning'))).toBe('One piece comes to 4,000 g (or ml) here. Is that right?');
  });

  it('names the nutrient and its unit for a vitamin or mineral far above its reference', () => {
    expect(text(issue('serving_nutrient_high', { nutrient: 'iron', value: 140, reference: 13, base: 'piece' }, 'iron', 'warning'))).toBe(
      'Iron: 140 mg in one piece is more than ten times the daily reference of 13 mg. Is that right?',
    );
    expect(text(issue('serving_nutrient_high', { nutrient: 'vitaminB12', value: 30, reference: 2.4, base: 'cup' }, 'vitaminB12', 'warning'))).toBe(
      'Vitamin B12: 30 mcg in one cup is more than ten times the daily reference of 2.4 mcg. Is that right?',
    );
  });

  it('never leaves a hole, and never goes blank for an id from a newer Worker', () => {
    expect(text(issue('from_the_future', { x: 1 }))).toBe('from the future');
    const ids = ['sugar_over_carbs', 'fibre_over_carbs', 'sat_fat_over_fat', 'added_over_sugar', 'macros_over_100g', 'calories_over_900', 'sodium_over_40000', 'calories_vs_macros', 'serving_calories_high', 'serving_sodium_high', 'serving_nutrient_high', 'unit_weight_implausible'];
    for (const id of ids) {
      const t = text(issue(id, { sugar: 1, carbs: 1, fiber: 1, saturatedFat: 1, fat: 1, addedSugar: 1, total: 1, base: 'piece', calories: 1, sodium: 1, expected: 1, nutrient: 'iron', value: 1, reference: 1, unit: 'piece', amount: 1 }, 'iron'));
      expect([id, /[{}]/.test(t)]).toEqual([id, false]);
    }
  });

  it('lists each distinct sentence once', () => {
    const a = issue('sugar_over_carbs', { sugar: 14, carbs: 10 });
    expect(issueTexts([a, a, issue('sat_fat_over_fat', { saturatedFat: 11, fat: 8 })], META.nutrients)).toHaveLength(2);
  });
});
