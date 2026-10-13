/**
 * The log screen's foods: one catalog from the person's own log, the foods list and a short list of common foods; a list for each meal
 * (their own, else the common ones), search, and the amount to start from. The Worker's own ranking is tested in the Worker; here it is
 * taken as given and only sorted by.
 */
import type { Food, HistoryFood, Meal, MealHistory } from '@/api/types';
import { COMMON_FOODS } from '@/data/commonFoods';
import {
  ALL_COUNT,
  ALSO_COUNT,
  TOP_COUNT,
  amountFor,
  buildCatalog,
  hasExactMatch,
  mealScore,
  searchChoices,
  searchKey,
  suggestionsFor,
} from '@/utils/foodChoices';
import { MEALS, mealAt } from '@/utils/meals';
import { normalizeName } from '../../worker/src/domain/normalize';

const at = (score: number, over: Partial<MealHistory> = {}): MealHistory => ({ days: Math.max(1, Math.round(score)), score, lastDate: '2026-10-12', quantity: 1, unit: 'piece', ...over });

/** One food in a person's log: `meals` maps a meal to its score (or a whole record). */
function logged(name: string, meals: Partial<Record<Meal, number | MealHistory>>, over: Partial<HistoryFood> = {}): HistoryFood {
  const rec = Object.fromEntries(Object.entries(meals).map(([m, v]) => [m, typeof v === 'number' ? at(v) : v])) as HistoryFood['meals'];
  const total = Object.values(rec).reduce((sum, m) => sum + m!.score, 0);
  return { foodId: null, name: name.toLowerCase(), displayName: name, days: 1, score: total, lastDate: '2026-10-12', quantity: 1, unit: 'piece', meals: rec, ...over };
}

const food = (id: string, name: string, baseUnit: string, extra: Partial<Food> = {}): Food => ({
  id,
  name: name.toLowerCase(),
  displayName: name,
  baseUnit,
  nutrients: { calories: 100 },
  aliases: [],
  units: [],
  source: null,
  reviewedAt: null,
  ...extra,
});

const names = (choices: { name: string }[]) => choices.map(c => c.name);

describe('the common foods', () => {
  it('are filed under the name the Worker would give them, so a food of that name is recognised as the same', () => {
    for (const meal of MEALS) {
      for (const c of COMMON_FOODS[meal]) expect([meal, c.name, c.key]).toEqual([meal, c.name, normalizeName(c.name)]);
    }
  });

  it('have an amount for each: more than 0, in a unit people log', () => {
    const units = ['piece', 'slice', 'katori', 'bowl', 'plate', 'cup', 'glass', 'tbsp', 'tsp', 'serving', 'g', 'kg', 'ml', 'l'];
    for (const meal of MEALS) {
      expect(COMMON_FOODS[meal].length).toBeGreaterThanOrEqual(10);
      for (const c of COMMON_FOODS[meal]) {
        expect(c.quantity).toBeGreaterThan(0);
        expect(units).toContain(c.unit);
      }
      expect(new Set(COMMON_FOODS[meal].map(c => c.key)).size).toBe(COMMON_FOODS[meal].length);
    }
  });

  it('are different for different meals', () => {
    expect(COMMON_FOODS.breakfast[0]!.key).not.toBe(COMMON_FOODS.dinner[0]!.key);
    expect(COMMON_FOODS.breakfast.map(c => c.key)).toContain('idli');
    expect(COMMON_FOODS.lunch.map(c => c.key)).toContain('dal');
  });
});

describe('the meal a time of day is', () => {
  it.each([
    [0, 0, 'dinner'],
    [3, 59, 'dinner'],
    [4, 0, 'breakfast'],
    [7, 30, 'breakfast'],
    [10, 59, 'breakfast'],
    [11, 0, 'lunch'],
    [13, 15, 'lunch'],
    [15, 29, 'lunch'],
    [15, 30, 'snack'],
    [17, 0, 'snack'],
    [18, 29, 'snack'],
    [18, 30, 'dinner'],
    [21, 0, 'dinner'],
    [23, 59, 'dinner'],
  ])('%i:%i is %s', (hour, minute, meal) => {
    expect(mealAt(hour, minute)).toBe(meal);
  });
});

describe('each person has their own list for each meal', () => {
  it('puts what a person logs often and lately first, for the meal they log it at', () => {
    const history = [
      logged('Egg', { breakfast: 9 }),
      logged('Idli', { breakfast: 4 }),
      logged('Dal', { lunch: 7 }),
      logged('Rice', { lunch: 8, dinner: 6 }),
    ];
    const catalog = buildCatalog({ history, foods: null });
    expect(names(suggestionsFor(catalog, 'breakfast').top)).toEqual(['Egg', 'Idli']);
    expect(names(suggestionsFor(catalog, 'lunch').top)).toEqual(['Rice', 'Dal']);
    expect(names(suggestionsFor(catalog, 'dinner').top)).toEqual(['Rice']);
  });

  it('gives two people with different habits different lists, and the meal changes which', () => {
    const a = buildCatalog({ history: [logged('Egg', { breakfast: 8 }), logged('Idli', { breakfast: 2, dinner: 5 })], foods: null });
    const b = buildCatalog({ history: [logged('Idli', { breakfast: 8 }), logged('Egg', { breakfast: 2 })], foods: null });
    expect(names(suggestionsFor(a, 'breakfast').top)).toEqual(['Egg', 'Idli']);
    expect(names(suggestionsFor(b, 'breakfast').top)).toEqual(['Idli', 'Egg']);
    // dinner is its own list: B has nothing for it, A has idli
    expect(names(suggestionsFor(a, 'dinner').top)).toEqual(['Idli']);
    expect(suggestionsFor(b, 'dinner').personal).toBe(false);
  });

  it('breaks a tie by what the person logs over all their meals, then by name', () => {
    const history = [logged('Banana', { snack: 3 }), logged('Apple', { snack: 3 }), logged('Tea', { snack: 3, breakfast: 6 })];
    expect(names(suggestionsFor(buildCatalog({ history, foods: null }), 'snack').top)).toEqual(['Tea', 'Apple', 'Banana']);
  });

  it('shows no more than the top few, and the rest of what they log under "also logged"', () => {
    const history = Array.from({ length: 14 }, (_, i) => logged(`Food ${String(i).padStart(2, '0')}`, { lunch: 20 - i }));
    history.push(logged('Toast', { breakfast: 5 }), logged('Soup', { dinner: 3 }));
    const s = suggestionsFor(buildCatalog({ history, foods: null }), 'lunch');
    expect(s.top).toHaveLength(TOP_COUNT);
    expect(names(s.top)[0]).toBe('Food 00');
    // what is not in the top: the rest of lunch, then other meals, best first by their score over all meals
    expect(names(s.also)).toEqual(['Food 10', 'Food 11', 'Food 12', 'Food 13', 'Toast', 'Soup']);
    expect(s.also.length).toBeLessThanOrEqual(ALSO_COUNT);
  });

  it('scores a food by its meal, or over every meal when no meal is chosen', () => {
    const [egg] = buildCatalog({ history: [logged('Egg', { breakfast: 4, snack: 2 })], foods: null }).list;
    expect(mealScore(egg!, 'breakfast')).toBe(4);
    expect(mealScore(egg!, 'lunch')).toBe(0);
    expect(mealScore(egg!, null)).toBe(6);
    expect(names(suggestionsFor(buildCatalog({ history: [logged('Egg', { breakfast: 4, snack: 2 })], foods: null }), null).top)).toEqual(['Egg']);
  });
});

describe('the common foods are the fallback, and only that', () => {
  it('fill the list for a meal the person has nothing logged for', () => {
    const s = suggestionsFor(buildCatalog({ history: [], foods: null }), 'breakfast');
    expect(s.personal).toBe(false);
    expect(names(s.top)).toEqual(COMMON_FOODS.breakfast.slice(0, TOP_COUNT).map(c => c.name));
    expect(s.also).toEqual([]);
  });

  it('are not mixed into a list that is the person\'s own, not even to fill it up', () => {
    const catalog = buildCatalog({ history: [logged('Aunt\'s upma', { breakfast: 3 })], foods: null });
    const s = suggestionsFor(catalog, 'breakfast');
    expect(s.personal).toBe(true);
    expect(names(s.top)).toEqual(["Aunt's upma"]);
    expect(s.top.some(c => c.origin === 'common')).toBe(false);
    expect(s.also.some(c => c.origin === 'common')).toBe(false);
  });

  it('take over again for a meal the person never logs, while what they log at other meals stays in reach', () => {
    const catalog = buildCatalog({ history: [logged('Egg', { breakfast: 5 })], foods: null });
    const dinner = suggestionsFor(catalog, 'dinner');
    expect(dinner.personal).toBe(false);
    expect(names(dinner.top)).toEqual(COMMON_FOODS.dinner.slice(0, TOP_COUNT).map(c => c.name));
    expect(names(dinner.also)).toEqual(['Egg']);
  });

  it('are the common foods of every meal, when no meal is chosen', () => {
    const s = suggestionsFor(buildCatalog({ history: [], foods: null }), null);
    expect(s.personal).toBe(false);
    expect(s.top.length).toBeGreaterThan(5);
    expect(new Set(s.top.map(c => c.key)).size).toBe(s.top.length);
  });

  it('start from their usual amount', () => {
    const s = suggestionsFor(buildCatalog({ history: [], foods: null }), 'breakfast');
    expect(amountFor(s.top[0]!, 'breakfast')).toEqual({ quantity: 2, unit: 'piece' }); // idli
    expect(amountFor(s.top.find(c => c.name === 'Milk')!, 'breakfast')).toEqual({ quantity: 1, unit: 'glass' });
  });

  it('are the foods the person already has, with their values, when a food of that name is in the list', () => {
    const idli = food('f1', 'Idli', 'piece');
    const catalog = buildCatalog({ history: [], foods: [idli] });
    const s = suggestionsFor(catalog, 'breakfast');
    expect(s.top[0]).toMatchObject({ name: 'Idli', foodId: 'f1', origin: 'food', quantity: 2, unit: 'piece' }); // the common amount, since it counts right away
    expect(catalog.list.filter(c => c.name === 'Idli')).toHaveLength(1);
  });

  it('keep the food\'s own start when the common amount is in a unit the food has no conversion for', () => {
    const upma = food('f2', 'Upma', 'plate'); // common upma is by the katori, which this food has no conversion for
    const s = suggestionsFor(buildCatalog({ history: [], foods: [upma] }), 'breakfast');
    expect(s.top.find(c => c.name === 'Upma')).toMatchObject({ foodId: 'f2', quantity: 1, unit: 'plate' });
  });

  it('keep what a person has logged at their usual amount', () => {
    const catalog = buildCatalog({ history: [logged('Idli', { dinner: at(2, { quantity: 4, unit: 'piece' }) }, { name: 'idli', quantity: 4 })], foods: null });
    // breakfast is a meal they have nothing for, so the common list shows, with their own idli in it and their own amount
    const s = suggestionsFor(catalog, 'breakfast');
    expect(s.personal).toBe(false);
    expect(amountFor(s.top.find(c => c.name === 'Idli')!, 'breakfast')).toEqual({ quantity: 4, unit: 'piece' });
  });
});

describe('the amount to start from', () => {
  const catalog = buildCatalog({
    history: [logged('Idli', { breakfast: at(5, { quantity: 3, unit: 'piece' }), dinner: at(2, { quantity: 5, unit: 'piece' }) }, { quantity: 3 })],
    foods: null,
  });
  const idli = catalog.list[0]!;

  it('is what they usually have at that meal', () => {
    expect(amountFor(idli, 'breakfast')).toEqual({ quantity: 3, unit: 'piece' });
    expect(amountFor(idli, 'dinner')).toEqual({ quantity: 5, unit: 'piece' });
  });

  it('is what they usually have, for a meal they have not had it at, or no meal', () => {
    expect(amountFor(idli, 'lunch')).toEqual({ quantity: 3, unit: 'piece' });
    expect(amountFor(idli, null)).toEqual({ quantity: 3, unit: 'piece' });
  });

  it('is a food\'s own start otherwise: one of its unit, or a helping (or 100 g) for a food per 100 g', () => {
    const list = buildCatalog({
      history: null,
      foods: [
        food('a', 'Poha', 'katori'),
        food('b', 'Rice', '100 g', { units: [{ unit: 'katori', servings: 1.5 }] }),
        food('c', 'Milk', '100 ml'),
        food('d', 'Flour', '100 g', { units: [{ unit: 'g', servings: 0.01 }] }),
      ],
    }).list;
    const start = (name: string) => {
      const c = list.find(x => x.name === name)!;
      return { ...amountFor(c, 'lunch'), units: c.units };
    };
    // The Worker turns a gram into a kilo, and a millilitre into a litre, by itself (worker/src/domain/intake/items.ts): both are offered.
    expect(start('Poha')).toEqual({ quantity: 1, unit: 'katori', units: ['katori'] });
    expect(start('Rice')).toEqual({ quantity: 1, unit: 'katori', units: ['katori', 'g', 'kg'] });
    expect(start('Milk')).toEqual({ quantity: 100, unit: 'ml', units: ['ml', 'l'] });
    expect(start('Flour')).toEqual({ quantity: 100, unit: 'g', units: ['g', 'kg'] });
  });
});

describe('the catalog', () => {
  it('has a food once, whether it is in the log, the foods list, the common foods, or all three', () => {
    const idli = food('f1', 'Idli', 'piece', { aliases: ['idly'] });
    const catalog = buildCatalog({ history: [logged('Idli', { breakfast: 4 }, { foodId: 'f1', name: 'idli' })], foods: [idli] });
    expect(catalog.list.filter(c => c.name === 'Idli')).toHaveLength(1);
    expect(catalog.list.find(c => c.name === 'Idli')).toMatchObject({ origin: 'history', foodId: 'f1', names: ['idli', 'idly'], key: 'food:f1' });
    expect(catalog.byName.get('idly')).toBe(catalog.byName.get('idli'));
    // one food in the list for each common food that is not already there, and one for the food itself
    const common = new Set(MEALS.flatMap(m => COMMON_FOODS[m].map(c => c.key)));
    expect(catalog.list).toHaveLength(common.size);
  });

  it('keeps a food that is in two meals\' common lists once', () => {
    const keys = buildCatalog({ history: null, foods: null }).list.map(c => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps a name that is still waiting for its values as the person typed it, with no food', () => {
    const catalog = buildCatalog({ history: [logged('Aunt\'s upma', { breakfast: 3 })], foods: null });
    expect(catalog.list[0]).toMatchObject({ key: "name:aunt's upma", name: "Aunt's upma", foodId: null, origin: 'history' });
  });

  it('copes with a log or a list that did not load', () => {
    expect(buildCatalog({ history: null, foods: null }).list.every(c => c.origin === 'common')).toBe(true);
    const foods = buildCatalog({ history: null, foods: [food('f', 'Khaman', 'piece')] });
    expect(names(suggestionsFor(foods, 'lunch').all)).toEqual(['Khaman']);
    // a logged food whose food is not in a list that is older than the log
    expect(buildCatalog({ history: [logged('Khaman', { lunch: 2 }, { foodId: 'f', name: 'khaman' })], foods: [] }).list[0]).toMatchObject({ foodId: 'f', units: [] });
  });

  it('lists the foods that are neither in the top nor in the person\'s log, A to Z, up to a limit', () => {
    const foods = Array.from({ length: ALL_COUNT + 7 }, (_, i) => food(`f${i}`, `Food ${String(i).padStart(3, '0')}`, 'piece'));
    const s = suggestionsFor(buildCatalog({ history: [logged('Food 005', { lunch: 3 }, { foodId: 'f5', name: 'food 005' })], foods }), 'lunch');
    expect(names(s.top)).toEqual(['Food 005']);
    expect(s.all).toHaveLength(ALL_COUNT);
    expect(names(s.all)[0]).toBe('Food 000');
    expect(names(s.all)).not.toContain('Food 005');
    expect(s.moreCount).toBe(ALL_COUNT + 7 - 1 - ALL_COUNT);
  });
});

describe('searching', () => {
  const catalog = buildCatalog({
    history: [
      logged('Idli', { breakfast: 6 }, { foodId: 'idli', name: 'idli' }),
      logged('Masala dosa', { breakfast: 2, dinner: 3 }),
      logged('Rava idli', { breakfast: 1 }),
    ],
    foods: [
      food('idli', 'Idli', 'piece', { aliases: ['idly', 'steamed rice cake'] }),
      food('rice', 'Rice', '100 g', { aliases: ['chawal'] }),
      food('dosa', 'Dosa', 'piece'),
    ],
  });
  const find = (q: string, meal: Meal | null = 'breakfast') => names(searchChoices(catalog, q, meal));

  it('finds a food by what it starts with, by any word in it, and by anything in it', () => {
    expect(find('ric')).toEqual(['Rice', 'Idli', 'Curd rice']); // the name first, then a word of it (idli by its other name, steamed rice cake)
    expect(find('dos')).toContain('Dosa');
    expect(find('asal')).toEqual(['Masala dosa']); // inside a word
    expect(find('curd')).toEqual(['Curd', 'Curd rice']);
  });

  it('finds a food by its other names', () => {
    expect(find('chawal')).toEqual(['Rice']);
    expect(find('idly')).toEqual(['Idli']);
    expect(find('steamed')).toEqual(['Idli']);
  });

  it('does not mind case, spaces, punctuation or accents', () => {
    expect(find('  RICE ')).toEqual(find('rice'));
    expect(find('masala-dosa')).toEqual(['Masala dosa']);
    expect(find('dósa')).toContain('Dosa');
    expect(searchKey('  Café -- au   LAIT ')).toBe('cafe au lait');
  });

  it('finds the singular from a plural, and the plural from a singular', () => {
    expect(find('idlis')).toContain('Idli');
    expect(find('biscuits')).toContain('Biscuits');
    expect(find('biscuit')).toContain('Biscuits'); // the common food is called Biscuits and filed as biscuit
  });

  it('reads plurals the way the Worker does, so "tomatoes" finds Tomato and "sandwiches" finds Sandwich', () => {
    const produce = buildCatalog({
      history: null,
      foods: [
        food('t', 'Tomato', 'piece'),
        food('p', 'Potato', 'piece'),
        food('m', 'Mango', 'piece'),
        food('b', 'Blueberry', 'cup'),
        food('s', 'Sandwich', 'piece'),
        food('i', 'Idlis', 'piece', { name: 'idli' }), // shown as typed, filed as idli
      ],
    });
    const found = (q: string) => names(searchChoices(produce, q, 'lunch'));
    expect(found('tomatoes')).toEqual(['Tomato']);
    expect(found('potatoes')).toEqual(['Potato']);
    expect(found('mangoes')).toEqual(['Mango']);
    expect(found('blueberries')).toEqual(['Blueberry']);
    expect(found('sandwiches')).toEqual(['Sandwich']);
    expect(found('idli')).toContain('Idlis');
    expect(found('idlis')).toContain('Idlis');
  });

  it('puts a closer match first, and among equals what the person logs at this meal, then at all', () => {
    expect(find('idli')[0]).toBe('Idli'); // the name itself
    expect(find('idli')).toEqual(['Idli', 'Rava idli']); // then a name that contains it
    // "dosa": the person's own dosa-with-masala is logged at dinner more than breakfast; the lists agree with the meal asked for
    expect(find('dosa', 'dinner')[0]).toBe('Dosa'); // the name itself still first
    expect(find('dos', 'dinner')).toEqual(['Dosa', 'Masala dosa']);
  });

  it('puts the person\'s own foods above a common one of the same match', () => {
    const own = buildCatalog({ history: [logged('Tea masala', { snack: 4 })], foods: null });
    expect(names(searchChoices(own, 'tea', 'snack'))).toEqual(['Tea', 'Tea masala']);
    const mine = buildCatalog({ history: [logged('Tea', { snack: 4 }, { name: 'tea' })], foods: null });
    expect(searchChoices(mine, 'tea', 'snack')[0]).toMatchObject({ origin: 'history' });
  });

  it('finds nothing for nothing, or for what is not there', () => {
    expect(searchChoices(catalog, '', 'lunch')).toEqual([]);
    expect(searchChoices(catalog, '  ', 'lunch')).toEqual([]);
    expect(searchChoices(catalog, 'zzzz', 'lunch')).toEqual([]);
  });

  describe('a food that is not found can be added', () => {
    it('knows a food of that exact name or alias is there, in any case', () => {
      expect(hasExactMatch(catalog, 'Idli')).toBe(true);
      expect(hasExactMatch(catalog, ' chawal ')).toBe(true);
      expect(hasExactMatch(catalog, 'DOSAS')).toBe(true); // a plural
      expect(hasExactMatch(catalog, 'masala dosa')).toBe(true);
    });

    it('knows a food is there however its name is written: plural or singular, as shown or as filed', () => {
      const produce = buildCatalog({
        history: [logged('Boiled eggs', { breakfast: 2 }, { name: 'boiled egg' })],
        foods: [food('t', 'Tomato', 'piece'), food('s', 'Sandwich', 'piece'), food('i', 'Idlis', 'piece', { name: 'idli' })],
      });
      for (const q of ['tomatoes', 'Tomato', 'sandwiches', 'idli', 'IDLIS', 'boiled egg', 'boiled eggs', 'biscuit', 'biscuits', 'dates', 'date']) {
        expect([q, hasExactMatch(produce, q)]).toEqual([q, true]);
      }
      expect(hasExactMatch(produce, 'tomato soup')).toBe(false);
    });

    it('knows when it is not, even if other foods match part of it', () => {
      expect(hasExactMatch(catalog, 'dos')).toBe(false); // finds Dosa, but is not a food of that name
      expect(hasExactMatch(catalog, 'masala')).toBe(false);
      expect(hasExactMatch(catalog, 'oats upma')).toBe(false);
      expect(hasExactMatch(catalog, '')).toBe(false);
    });
  });

  it('finds a newly added food straight away, and as part of what the person logs once they log it', () => {
    const before = buildCatalog({ history: [], foods: [food('k', 'Khaman', 'piece')] });
    expect(names(searchChoices(before, 'khaman', 'snack'))).toEqual(['Khaman']);
    expect(suggestionsFor(before, 'snack').personal).toBe(false);
    expect(names(suggestionsFor(before, 'snack').all)).toEqual(['Khaman']);
    // after it is logged for a snack it is the person's own, and leads the snack list
    const after = buildCatalog({ history: [logged('Khaman', { snack: 1 }, { foodId: 'k', name: 'khaman' })], foods: [food('k', 'Khaman', 'piece')] });
    const s = suggestionsFor(after, 'snack');
    expect(s.personal).toBe(true);
    expect(names(s.top)).toEqual(['Khaman']);
    expect(s.all.some(c => c.name === 'Khaman')).toBe(false); // not twice
  });
});
