/**
 * The food-data format: reading what a chat assistant wrote into the form's fields, the prompt that asks for it, and what an empty field
 * means (0). The same functions serve a form that was typed and one that was pasted into, so both must make the same food.
 */
import type { Meta, NutrientInfo } from '@/api/types';
import {
  buildNutrients,
  buildPrompt,
  dataIssueText,
  emptinessIssues,
  fieldName,
  groupNutrients,
  parseFoodData,
  readBaseUnit,
  readNumber,
  typedNutrients,
  withoutGuesses,
  type DataIssue,
  type ParseResult,
} from '@/utils/foodData';
import metaJson from './fixtures/meta.json';

const NUTRIENTS = (metaJson as unknown as Meta).nutrients;
const BASE_UNITS = ['piece', 'slice', 'katori', 'bowl', 'plate', 'cup', 'glass', 'tbsp', 'tsp', 'serving', '100 g', '100 ml'];
const parse = (text: string): ParseResult => parseFoodData(text, NUTRIENTS, BASE_UNITS);

/** The data of a successful read, or a failure of the test. */
function read(text: string) {
  const result = parse(text);
  if (!result.ok) throw new Error(`expected the data to read, got: ${result.issues.map(dataIssueText).join(' | ')}`);
  return result;
}
const issuesOf = (text: string): DataIssue[] => {
  const result = parse(text);
  if (result.ok) throw new Error('expected the data not to read');
  return result.issues;
};
const ids = (text: string) => issuesOf(text).map(i => i.id);

describe('field names', () => {
  it('are the nutrient key in snake case and the unit it is counted in', () => {
    const names = Object.fromEntries(NUTRIENTS.map(n => [n.key, fieldName(n)]));
    expect(names).toMatchObject({
      calories: 'calories_kcal',
      protein: 'protein_g',
      carbs: 'carbs_g',
      saturatedFat: 'saturated_fat_g',
      addedSugar: 'added_sugar_g',
      sodium: 'sodium_mg',
      vitaminA: 'vitamin_a_mcg',
      vitaminC: 'vitamin_c_mg',
      vitaminB12: 'vitamin_b12_mcg',
      folate: 'folate_mcg',
      iron: 'iron_mg',
    });
    expect(new Set(Object.values(names)).size).toBe(NUTRIENTS.length);
  });
});

describe('reading pasted data', () => {
  it('fills the name, what it is per, how it is eaten, where it came from and every nutrient it has', () => {
    const { food, filled, ignored } = read(`{
      "name": "Idli",
      "per": "piece",
      "form": "as_eaten",
      "source": "estimate",
      "calories_kcal": 39,
      "protein_g": 1.9,
      "carbs_g": 7.9,
      "fat_g": 0.2,
      "sodium_mg": 160,
      "vitamin_b12_mcg": 0
    }`);
    expect(food).toEqual({
      name: 'Idli',
      baseUnit: 'piece',
      form: 'as_eaten',
      source: 'estimate',
      values: { calories: '39', protein: '1.9', carbs: '7.9', fat: '0.2', sodium: '160', vitaminB12: '0' },
    });
    expect(filled).toBe(6);
    expect(ignored).toEqual([]);
  });

  it('reads a whole reply: a sentence, a code fence, the data, a sentence', () => {
    const { food } = read('Here you go!\n```json\n{ "name": "Dal", "per": "katori", "calories_kcal": 150, "protein_g": 9 }\n```\nHope that helps.');
    expect(food).toMatchObject({ name: 'Dal', baseUnit: 'katori', values: { calories: '150', protein: '9' } });
  });

  it('reads the example the prompt gives, whatever the nutrients are', () => {
    const prompt = buildPrompt({ name: 'Idli', baseUnit: 'piece', nutrients: NUTRIENTS, baseUnits: BASE_UNITS });
    const example = prompt.split('```json\n')[1]!.split('\n```')[0]!;
    const { food, filled } = read(example);
    expect(filled).toBe(NUTRIENTS.length);
    expect(Object.values(food.values).every(v => v === '0')).toBe(true);
    expect(food).toMatchObject({ name: 'Idli', baseUnit: 'piece', form: 'as_eaten', source: 'estimate' });
  });

  describe('field names', () => {
    it('are read loosely: the label, the key, a spelling an assistant likes, with or without the unit', () => {
      const { food, ignored } = read(`{
        "Calories": 100,
        "Protein (g)": 2,
        "Total Carbohydrates": 20,
        "totalFat": 3,
        "Dietary Fibre": 1.5,
        "Total Sugars": 4,
        "Saturated Fat (g)": 1,
        "added_sugars_g": 2,
        "Vitamin B12": 0.4,
        "vit_c": 12,
        "ascorbic_acid_mg": 12,
        "folate": 30
      }`);
      expect(food.values).toEqual({
        calories: '100',
        protein: '2',
        carbs: '20',
        fat: '3',
        fiber: '1.5',
        sugar: '4',
        saturatedFat: '1',
        addedSugar: '2',
        vitaminB12: '0.4',
        vitaminC: '12',
        folate: '30',
      });
      expect(ignored).toEqual(['ascorbic_acid_mg']); // a spelling it does not know is skipped, not guessed
    });

    it('may sit under "nutrients" or "nutrition", read as if at the top', () => {
      expect(read('{"name": "Dal", "nutrients": {"calories_kcal": 150, "protein_g": 9}}').food.values).toEqual({ calories: '150', protein: '9' });
      expect(read('{"name": "Dal", "nutrition": {"calories_kcal": 150}}').food.values).toEqual({ calories: '150' });
    });

    it('that the app does not track are named, and never an error', () => {
      const { food, ignored } = read('{"calories_kcal": 40, "caffeine_mg": 90, "cholesterol_mg": 0, "notes": "fresh"}');
      expect(food.values).toEqual({ calories: '40' });
      expect(ignored).toEqual(['caffeine_mg', 'cholesterol_mg', 'notes']);
    });

    it('in another unit than the app reads are refused, never rescaled by guesswork', () => {
      const issues = issuesOf('{"calories_kcal": 40, "sodium_g": 0.4, "vitamin_a_iu": 500, "calcium_mcg": 100, "energy_kj": 167}');
      expect(issues.map(i => [i.id, i.params.field, i.params.expected])).toEqual([
        ['wrong_unit', 'sodium_g', 'sodium_mg'],
        ['wrong_unit', 'vitamin_a_iu', 'vitamin_a_mcg'],
        ['wrong_unit', 'calcium_mcg', 'calcium_mg'],
        ['wrong_unit', 'energy_kj', 'calories_kcal'],
      ]);
    });

    it('may say "ug" for micrograms', () => {
      expect(read('{"vitamin_d_ug": 2.5}').food.values).toEqual({ vitaminD: '2.5' });
    });
  });

  describe('numbers', () => {
    it('may be written with their unit, and are converted to the field\'s own', () => {
      const { food } = read(`{
        "calories_kcal": "120 kcal",
        "sodium_mg": "0.4 g",
        "vitamin_a_mcg": "0.5 mg",
        "iron_mg": "2000 mcg",
        "protein_g": "2,5 g",
        "potassium_mg": "1,200 mg",
        "zinc_mg": "0,125 g"
      }`);
      expect(food.values).toEqual({ calories: '120', sodium: '400', vitaminA: '500', iron: '2', protein: '2.5', potassium: '1200', zinc: '125' });
    });

    it('may be in kilojoules for energy, and approximate', () => {
      expect(read('{"calories_kcal": "418.4 kJ", "fat_g": "~0.2", "fiber_g": "about 3", "sugar_g": "< 1"}').food.values).toEqual({
        calories: '100',
        fat: '0.2',
        fiber: '3',
        sugar: '1',
      });
    });

    it('that say there is no figure (null, n/a, trace, a dash, nothing) leave the field empty', () => {
      const { food, filled } = read('{"calories_kcal": 50, "protein_g": null, "fat_g": "n/a", "carbs_g": "trace", "fiber_g": "-", "sugar_g": ""}');
      expect(food.values).toEqual({ calories: '50', protein: '', fat: '', carbs: '', fiber: '', sugar: '' });
      expect(filled).toBe(6);
    });

    it('that are not numbers are named, with what they say', () => {
      const issues = issuesOf('{"calories_kcal": 40, "protein_g": "high", "fat_g": "5 ml", "carbs_g": true, "fiber_g": [1], "sugar_g": {"a": 1}}');
      expect(issues.map(i => [i.id, i.params.field, i.params.value])).toEqual([
        ['bad_number', 'protein_g', 'high'],
        ['bad_number', 'fat_g', '5 ml'],
        ['bad_number', 'carbs_g', 'true'],
        ['bad_number', 'fiber_g', 'a list'],
        ['bad_number', 'sugar_g', 'a group of fields'],
      ]);
    });

    it('may not be negative or absurdly large', () => {
      const issues = issuesOf('{"protein_g": -2, "sodium_mg": 250000, "iron_mg": "-1 mg"}');
      expect(issues.map(i => i.id)).toEqual(['negative', 'too_large', 'negative']);
      expect(issues[1]!.params).toMatchObject({ field: 'sodium_mg', max: 100000 });
    });
  });

  describe('what it is per', () => {
    it.each([
      ['piece', 'piece'],
      ['1 piece', 'piece'],
      ['Pieces', 'piece'],
      ['per katori', 'katori'],
      ['1 Katori', 'katori'],
      ['100g', '100 g'],
      ['100 grams', '100 g'],
      ['per 100 g', '100 g'],
      ['100 ml', '100 ml'],
      ['100 Millilitres', '100 ml'],
      ['1 cup (240 ml)', 'cup'],
      ['a slice', 'slice'],
      ['1 tablespoon', 'tbsp'],
      ['1 serving', 'serving'],
    ])('reads %j as %j', (text, expected) => {
      expect(readBaseUnit(text, BASE_UNITS)).toBe(expected);
    });

    it('is refused when it is none of the units, and says which there are', () => {
      expect(readBaseUnit('250 ml', BASE_UNITS)).toBeNull();
      expect(readBaseUnit('1 handful', BASE_UNITS)).toBeNull();
      const [issue] = issuesOf('{"per": "1 handful", "calories_kcal": 10}');
      expect(issue).toMatchObject({ id: 'bad_per', params: { value: '1 handful' } });
      expect(dataIssueText(issue!)).toContain('piece, slice, katori');
    });

    it('puts an odd value in words, not as "[object Object]"', () => {
      expect(dataIssueText(issuesOf('{"serving": {"size": "1 piece"}, "calories_kcal": 5}')[0]!)).toBe(
        '"per" says "a group of fields", which the app does not have. It must be one of: piece, slice, katori, bowl, plate, cup, glass, tbsp, tsp, serving, 100 g, 100 ml.',
      );
      expect(issuesOf('{"per": ["piece"], "calories_kcal": 5}')[0]!.params.value).toBe('a list');
      expect(issuesOf('{"form": {"a": 1}, "calories_kcal": 5}')[0]!.params.value).toBe('a group of fields');
      expect(issuesOf('{"per": 5, "calories_kcal": 5}')[0]!.params.value).toBe('5');
    });

    it('is left alone when the data does not say', () => {
      expect(read('{"calories_kcal": 10}').food.baseUnit).toBeUndefined();
      expect(read('{"per": null, "calories_kcal": 10}').food.baseUnit).toBeUndefined();
    });
  });

  describe('how it is eaten, and where the numbers came from', () => {
    it('reads the words an assistant uses', () => {
      expect(read('{"form": "As eaten", "source": "Pack label", "calories_kcal": 1}').food).toMatchObject({ form: 'as_eaten', source: 'label' });
      expect(read('{"form": "raw", "source": "guess", "calories_kcal": 1}').food).toMatchObject({ form: 'raw', source: 'estimate' });
      expect(read('{"form": "dry", "source": "recipe", "calories_kcal": 1}').food).toMatchObject({ form: 'raw', source: 'recipe' });
      expect(read('{"form": "cooked", "source": "food database", "calories_kcal": 1}').food).toMatchObject({ form: 'as_eaten', source: 'database' });
    });

    it('refuses a form it does not know (raw or cooked changes the numbers threefold), but only notes a source it does not know', () => {
      expect(ids('{"form": "fried", "calories_kcal": 1}')).toEqual(['bad_form']);
      const { food, ignored } = read('{"source": "USDA", "calories_kcal": 1}');
      expect(food.source).toBeUndefined();
      expect(ignored).toEqual(['source']);
    });
  });

  describe('what cannot be read', () => {
    it('says nothing was pasted', () => {
      expect(ids('')).toEqual(['empty']);
      expect(ids('  \n ')).toEqual(['empty']);
    });

    it('says when there is no data in the text', () => {
      expect(ids('I could not find that food.')).toEqual(['no_data']);
      expect(ids('[1, 2, 3]')).toEqual(['no_data']);
    });

    it('says where the data is cut off or mistyped', () => {
      const [issue] = issuesOf('{\n  "name": "Idli",\n  "protein_g": 1.9\n  "fat_g": 0.2\n}');
      expect(issue).toMatchObject({ id: 'syntax', params: { line: 4, column: 3, expected: 'a comma or a closing }' } });
      expect(dataIssueText(issue!)).toBe('The data is cut off or has a typing slip on line 4, near ""fat_g": 0.2": expected a comma or a closing }. Ask the assistant to answer again, or fix that spot.');
    });

    it('takes one food at a time', () => {
      const [issue] = issuesOf('[{"name": "a", "calories_kcal": 1}, {"name": "b", "calories_kcal": 2}]');
      expect(issue).toMatchObject({ id: 'several', params: { count: 2 } });
      expect(read('[{"name": "a", "calories_kcal": 1}]').food.name).toBe('a');
    });

    it('says when there are no nutrients in it', () => {
      expect(ids('{"name": "Idli", "per": "piece"}')).toEqual(['no_values']);
      expect(ids('{}')).toEqual(['no_values']);
      expect(dataIssueText(issuesOf('{}')[0]!)).toBe('No nutrient values were found. Expect fields like calories_kcal, protein_g, carbs_g.');
    });

    it('collects every problem in one go, so they can be fixed together', () => {
      expect(ids('{"per": "bowlful", "form": "fried", "calories_kcal": "lots", "sodium_g": 1, "protein_g": -1}')).toEqual(['bad_per', 'bad_form', 'bad_number', 'wrong_unit', 'negative']);
    });

    it('puts every one of them in words', () => {
      const samples = [
        '',
        'nothing',
        '{"a": 1,',
        '[{"calories_kcal": 1}, {"calories_kcal": 2}]',
        '{"calories_kcal": "x", "protein_g": -1, "fat_g": 999999, "sodium_g": 1, "per": "zz", "form": "zz"}',
        '{}',
      ];
      for (const sample of samples) {
        for (const issue of issuesOf(sample)) {
          const text = dataIssueText(issue);
          expect(text).not.toMatch(/\{\w+\}/); // every hole filled
          expect(text.length).toBeGreaterThan(10);
        }
      }
    });
  });

  it('only fills the name from the data; keeping the person\'s own is for the form', () => {
    expect(read('{"name": "  Masala   Dosa ", "calories_kcal": 1}').food.name).toBe('Masala Dosa');
    expect(read('{"name": "", "calories_kcal": 1}').food.name).toBeUndefined();
    expect(read('{"name": 5, "calories_kcal": 1}').food.name).toBeUndefined();
  });
});

describe('numbers typed into the form', () => {
  it('read a decimal point or a decimal comma, and nothing else', () => {
    expect(readNumber('2.5')).toBe(2.5);
    expect(readNumber(' 2,5 ')).toBe(2.5);
    expect(readNumber('1,25')).toBe(1.25);
    expect(readNumber('0')).toBe(0);
    expect(readNumber('')).toBeNull();
    expect(readNumber('  ')).toBeNull();
    expect(readNumber('abc')).toBeNull();
    expect(readNumber('1.2.3')).toBeNull();
  });

  it('refuse a comma and three digits, which is 1.2 in one country and twelve hundred in another: no guessing a thousandfold', () => {
    expect(readNumber('1,200')).toBeNull();
    expect(readNumber('0,125')).toBeNull();
    expect(readNumber('12,500')).toBeNull();
    expect(readNumber('1,234,567')).toBeNull();
    expect(readNumber('1,2000')).toBe(1.2); // four digits after a comma are never thousands
    const built = buildNutrients({ calories: '1,200' }, NUTRIENTS);
    expect(built.errors.calories).toBe('Enter a number');
  });

  it('are what the live check is asked about: blanks, half-typed and absurd numbers are left out', () => {
    expect(typedNutrients({ calories: '120', protein: '', fat: '0', carbs: '1.', sugar: 'x', sodium: '999999', fiber: '-1', iron: '2,5' })).toEqual({
      calories: 120,
      fat: 0,
      carbs: 1,
      iron: 2.5,
    });
  });
});

describe('an empty field is 0', () => {
  it('turns everything left empty into 0, for every nutrient there is, and says which were empty', () => {
    const built = buildNutrients({ calories: '120', protein: '3.5' }, NUTRIENTS);
    expect(Object.keys(built.nutrients)).toHaveLength(NUTRIENTS.length);
    expect(built.nutrients).toMatchObject({ calories: 120, protein: 3.5, carbs: 0, fat: 0, vitaminB12: 0, zinc: 0 });
    expect(built.blanks).toHaveLength(NUTRIENTS.length - 2);
    expect(built.blanks).not.toContain('calories');
    expect(built.errors).toEqual({});
  });

  it('counts a field of spaces as empty, and keeps a 0 that was typed', () => {
    const built = buildNutrients({ calories: ' ', protein: '0' }, NUTRIENTS);
    expect(built.nutrients.calories).toBe(0);
    expect(built.blanks).toContain('calories');
    expect(built.blanks).not.toContain('protein');
  });

  it('even calories: nothing is required', () => {
    const built = buildNutrients({}, NUTRIENTS);
    expect(built.errors).toEqual({});
    expect(Object.values(built.nutrients).every(v => v === 0)).toBe(true);
  });

  it('still refuses what is not a number, and says which field', () => {
    const built = buildNutrients({ calories: 'abc', protein: '-1', fat: '200000', carbs: '5' }, NUTRIENTS);
    expect(Object.keys(built.errors).sort()).toEqual(['calories', 'fat', 'protein']);
    expect(built.errors.calories).toBe('Enter a number');
    expect(built.errors.fat).toBe('The most allowed is 100,000');
    expect(built.nutrients.carbs).toBe(5);
  });

  it('makes the same food from typed values as from pasted ones', () => {
    const typed = buildNutrients({ calories: '39', protein: '1.9', carbs: '7.9', fat: '0.2' }, NUTRIENTS).nutrients;
    const pasted = read('{"calories_kcal": 39, "protein_g": 1.9, "carbs_g": 7.9, "fat_g": 0.2}');
    expect(buildNutrients(pasted.food.values, NUTRIENTS).nutrients).toEqual(typed);
    // a nutrient the data names but has no figure for is empty too, and so is 0
    const unknown = read('{"calories_kcal": 39, "iron_mg": null}');
    expect(buildNutrients(unknown.food.values, NUTRIENTS).nutrients.iron).toBe(0);
  });

  describe('and the app asks about the two ways that goes wrong', () => {
    const zero = Object.fromEntries(NUTRIENTS.map(n => [n.key, 0]));

    it('a food with nothing in it', () => {
      expect(emptinessIssues(zero)).toEqual([{ id: 'all_empty', severity: 'warning', params: {} }]);
      expect(emptinessIssues({ ...zero, iron: 1 })).toEqual([]);
    });

    it('calories left empty beside protein, carbohydrate and fat', () => {
      expect(emptinessIssues({ ...zero, protein: 5, carbs: 20, fat: 2 })).toEqual([
        { id: 'calories_empty', severity: 'warning', nutrient: 'calories', params: { expected: 118 } },
      ]);
      expect(emptinessIssues({ ...zero, calories: 118, protein: 5, carbs: 20, fat: 2 })).toEqual([]);
      expect(emptinessIssues({ ...zero, protein: 1, carbs: 1 })).toEqual([]); // too little for it to matter
    });

    it('and drops the Worker\'s calories-against-macros question when a macro was only left empty', () => {
      const asked = { id: 'calories_vs_macros', severity: 'warning' as const, params: { calories: 150, expected: 0 } };
      const other = { id: 'serving_calories_high', severity: 'warning' as const, params: {} };
      expect(withoutGuesses([asked, other], ['protein', 'iron'])).toEqual([other]);
      expect(withoutGuesses([asked, other], ['iron'])).toEqual([asked, other]); // every macro was typed: the question stands
    });
  });
});

describe('the fields of the form', () => {
  it('are grouped as a pack label lists them, then minerals, then vitamins', () => {
    const groups = groupNutrients(NUTRIENTS);
    expect(groups.map(g => g.id)).toEqual(['label', 'minerals', 'vitamins']);
    expect(groups[0]!.nutrients.map(n => n.key)).toEqual(['calories', 'protein', 'carbs', 'fat', 'saturatedFat', 'fiber', 'sugar', 'addedSugar', 'sodium']);
    expect(groups[1]!.nutrients.map(n => n.key)).toEqual(['calcium', 'iron', 'potassium', 'magnesium', 'zinc']);
    expect(groups[2]!.nutrients.map(n => n.key)).toEqual(['vitaminA', 'vitaminC', 'vitaminD', 'vitaminE', 'vitaminK', 'vitaminB12', 'folate']);
  });

  it('hide nothing: a nutrient the Worker adds later gets a field, and a catalogue with only a few has only those', () => {
    const extra: NutrientInfo = { key: 'omega3', label: 'Omega-3', unit: 'g', kind: 'amount', window: 'week', defaultGoal: null };
    const groups = groupNutrients([...NUTRIENTS, extra]);
    expect(groups.at(-1)).toEqual({ id: 'other', nutrients: [extra] });
    expect(groups.flatMap(g => g.nutrients)).toHaveLength(NUTRIENTS.length + 1);
    expect(groupNutrients(NUTRIENTS.filter(n => ['calories', 'protein'].includes(n.key))).map(g => g.id)).toEqual(['label']);
  });
});

describe('the prompt', () => {
  const prompt = (over: Partial<Parameters<typeof buildPrompt>[0]> = {}) => buildPrompt({ nutrients: NUTRIENTS, baseUnits: BASE_UNITS, ...over });

  it('asks for every nutrient the app reads, by the name the app reads, in the unit it reads', () => {
    const text = prompt();
    for (const n of NUTRIENTS) expect(text).toContain(`"${fieldName(n)}": 0`);
    expect(text).toContain('Fields ending in _g are in grams, _mg in milligrams and _mcg in micrograms. calories_kcal is in kilocalories.');
  });

  it('lists the amounts a food can be per, and asks for 0 where a nutrient is not known', () => {
    const text = prompt();
    expect(text).toContain('It must be exactly one of: piece, slice, katori, bowl, plate, cup, glass, tbsp, tsp, serving, 100 g, 100 ml.');
    expect(text).toContain('Use 0 for a nutrient the food does not contain or that you do not know. Never write null, text or a range.');
    expect(text).toContain('"source" is always "estimate".');
  });

  it('carries the food, and what it is per, once the form has them', () => {
    const text = prompt({ name: '  Idli ', baseUnit: 'piece' });
    expect(text.endsWith('Food: Idli')).toBe(true);
    expect(text).toContain('"name": "Idli"');
    expect(text).toContain('"per": "piece"');
    expect(text).toContain('Set "per" to "piece" and give every number for that amount of the food.');
    expect(text).not.toContain('It must be exactly one of');
  });

  it('leaves the food for the person to write when the form has none yet', () => {
    const text = prompt({ name: '  ', baseUnit: null });
    expect(text.endsWith('Food: write the food and the amount here')).toBe(true);
    expect(text).toContain('"name": "the name of the food"');
    expect(text).toContain('"per": "one of the per values above"');
  });

  it('ignores a base unit the Worker does not have', () => {
    expect(prompt({ baseUnit: 'handful' })).toContain('It must be exactly one of');
  });

  it('is built from the nutrients it is given, so it never asks for what the app does not read', () => {
    const text = buildPrompt({ nutrients: NUTRIENTS.slice(0, 2), baseUnits: ['piece'] });
    expect(text).toContain('"calories_kcal": 0');
    expect(text).toContain('"protein_g": 0');
    expect(text).not.toContain('carbs_g');
  });

  it('is the same text each time, in the shape: rules, then the format in a code block, then the food', () => {
    const text = prompt({ name: 'Dal' });
    expect(prompt({ name: 'Dal' })).toBe(text);
    const lines = text.split('\n');
    expect(lines[0]).toMatch(/^Give the nutrition facts of the food named on the last line/);
    expect(lines.filter(l => l.startsWith('- ')).length).toBe(7);
    expect(lines.indexOf('```json')).toBeGreaterThan(lines.findIndex(l => l.startsWith('- ')));
    expect(text.match(/```/g)).toHaveLength(2);
    expect(lines.at(-1)).toBe('Food: Dal');
  });
});
