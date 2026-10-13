import { describe, expect, it } from 'vitest';
import { addDays } from '../../src/domain/time';
import { buildFoodHistory, dayWeight, HALF_LIFE_DAYS, MAX_HISTORY_FOODS, type HistoryRow } from '../../src/domain/history';
import { normalizeName } from '../../src/domain/normalize';
import { sampleIndex } from './helpers';

const TODAY = '2026-10-13';
const ago = (days: number) => addDays(TODAY, -days);

/** One logged item: `name` is what was typed; a food id is set when it resolved (`sampleIndex` has rice, idli, dal and milk). */
function row(daysAgo: number, meal: string | null, name: string, extra: Partial<HistoryRow> = {}): HistoryRow {
  return { local_date: ago(daysAgo), meal, raw_name: name, normalized_name: normalizeName(name), food_id: null, quantity: 1, unit: 'piece', ...extra };
}
const named = (history: ReturnType<typeof buildFoodHistory>, name: string) => history.find((f) => f.name === name)!;
/** Foods in the order a meal's list shows them: the ones logged for it, by that meal's score. */
const forMeal = (history: ReturnType<typeof buildFoodHistory>, meal: 'breakfast' | 'lunch' | 'snack' | 'dinner') =>
  history
    .filter((f) => f.meals[meal])
    .sort((a, b) => b.meals[meal]!.score - a.meals[meal]!.score)
    .map((f) => f.name);

const index = sampleIndex();

describe('the weight of a day', () => {
  it('halves every three weeks, and counts a day that is not over yet in full', () => {
    expect(dayWeight(0)).toBe(1);
    expect(dayWeight(HALF_LIFE_DAYS)).toBeCloseTo(0.5, 10);
    expect(dayWeight(2 * HALF_LIFE_DAYS)).toBeCloseTo(0.25, 10);
    expect(dayWeight(-5)).toBe(1);
  });
});

describe('what a person logs, ranked', () => {
  it('has nothing to say about a log with nothing in it', () => {
    expect(buildFoodHistory(index, [], TODAY)).toEqual([]);
  });

  it('counts the days a food was logged for a meal, not the rows: twice in one day is one day', () => {
    const history = buildFoodHistory(
      index,
      [row(0, 'breakfast', 'egg'), row(0, 'breakfast', 'egg'), row(1, 'breakfast', 'egg'), row(1, 'snack', 'egg')],
      TODAY,
    );
    const egg = named(history, 'egg');
    expect(egg.meals.breakfast).toMatchObject({ days: 2, lastDate: ago(0) });
    expect(egg.meals.snack).toMatchObject({ days: 1, lastDate: ago(1) });
    expect(egg.days).toBe(2); // the days it was logged at all
  });

  it('keeps each meal to itself: breakfast habits do not lead the lunch list, and the other way round', () => {
    const rows: HistoryRow[] = [];
    for (let d = 0; d < 6; d++) rows.push(row(d, 'breakfast', 'egg'), row(d, 'lunch', 'rice', { food_id: 'rice' }));
    for (let d = 0; d < 3; d++) rows.push(row(d, 'lunch', 'dal', { food_id: 'dal' }));
    const history = buildFoodHistory(index, rows, TODAY);
    expect(forMeal(history, 'breakfast')).toEqual(['egg']);
    expect(forMeal(history, 'lunch')).toEqual(['rice', 'dal']);
    expect(named(history, 'egg').meals.lunch).toBeUndefined();
    expect(forMeal(history, 'dinner')).toEqual([]);
  });

  it('two people with different habits get different lists (each is built from their own rows)', () => {
    const userA = buildFoodHistory(index, [0, 1, 2, 3].map((d) => row(d, 'breakfast', 'egg')).concat(row(5, 'breakfast', 'idli', { food_id: 'idli' })), TODAY);
    const userB = buildFoodHistory(index, [0, 1, 2, 3].map((d) => row(d, 'breakfast', 'idli', { food_id: 'idli' })).concat(row(5, 'breakfast', 'egg')), TODAY);
    expect(forMeal(userA, 'breakfast')).toEqual(['egg', 'idli']);
    expect(forMeal(userB, 'breakfast')).toEqual(['idli', 'egg']);
  });

  describe('frequency and recency', () => {
    it('puts what was eaten often above what was eaten rarely, when both are as recent', () => {
      const rows = [row(1, 'breakfast', 'egg'), row(2, 'breakfast', 'egg'), row(3, 'breakfast', 'egg'), row(1, 'breakfast', 'toast')];
      expect(forMeal(buildFoodHistory(index, rows, TODAY), 'breakfast')).toEqual(['egg', 'toast']);
    });

    it('puts what was eaten lately above what was eaten as often long ago', () => {
      const rows = [0, 1, 2, 3, 4].map((d) => row(d + 120, 'breakfast', 'toast')).concat([0, 1, 2, 3, 4].map((d) => row(d, 'breakfast', 'egg')));
      expect(forMeal(buildFoodHistory(index, rows, TODAY), 'breakfast')).toEqual(['egg', 'toast']);
    });

    it('lets a new habit overtake an old one, but not on a single day', () => {
      const oldHabit = Array.from({ length: 30 }, (_, d) => row(d + 40, 'breakfast', 'toast')); // daily, 40 to 70 days ago
      const newHabit = Array.from({ length: 10 }, (_, d) => row(d, 'breakfast', 'idli', { food_id: 'idli' })); // daily for the last ten days
      expect(forMeal(buildFoodHistory(index, [...oldHabit, ...newHabit], TODAY), 'breakfast')).toEqual(['idli', 'toast']);

      const steady = Array.from({ length: 12 }, (_, i) => row(i * 7 + 1, 'breakfast', 'egg')); // weekly for twelve weeks
      const oneOff = [row(0, 'breakfast', 'pizza')];
      expect(forMeal(buildFoodHistory(index, [...steady, ...oneOff], TODAY), 'breakfast')).toEqual(['egg', 'pizza']);
    });

    it('scores a day by its age: a log from three weeks ago is worth half of one from today', () => {
      const [today, threeWeeks] = [buildFoodHistory(index, [row(0, 'lunch', 'soup')], TODAY), buildFoodHistory(index, [row(21, 'lunch', 'soup')], TODAY)];
      expect(today[0]!.meals.lunch!.score).toBe(1);
      expect(threeWeeks[0]!.meals.lunch!.score).toBe(0.5);
    });

    it('breaks a tie by the name', () => {
      const rows = [row(0, 'snack', 'banana'), row(0, 'snack', 'apple')];
      expect(forMeal(buildFoodHistory(index, rows, TODAY), 'snack')).toEqual(['apple', 'banana']);
    });
  });

  it('counts every name that resolves to a food as that food: a person who says chawal and rice logs rice', () => {
    const history = buildFoodHistory(
      index,
      [row(0, 'lunch', 'chawal', { food_id: 'rice' }), row(1, 'lunch', 'Steamed rice', { food_id: 'rice' }), row(2, 'lunch', 'rice', { food_id: 'rice' })],
      TODAY,
    );
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ foodId: 'rice', name: 'rice', displayName: 'rice' });
    expect(history[0]!.meals.lunch!.days).toBe(3);
  });

  it('keeps a name that is still waiting for values as it was last typed, with no food', () => {
    const history = buildFoodHistory(
      index,
      [row(3, 'dinner', 'masala dosa'), row(1, 'dinner', 'Masala Dosa'), row(2, 'dinner', 'masala dosas')],
      TODAY,
    );
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ foodId: null, name: 'masala dosa', displayName: 'Masala Dosa' });
    expect(history[0]!.meals.dinner!.days).toBe(3);
  });

  it('forgets a food link that no longer exists, rather than dropping the log', () => {
    const history = buildFoodHistory(index, [row(0, 'lunch', 'ghost', { food_id: 'deleted' })], TODAY);
    expect(history[0]).toMatchObject({ foodId: null, name: 'ghost' });
  });

  describe('the amount to fill in', () => {
    it('is the amount logged most often for that meal, and the latest on a tie', () => {
      const rows = [
        row(1, 'breakfast', 'idli', { food_id: 'idli', quantity: 3 }),
        row(2, 'breakfast', 'idli', { food_id: 'idli', quantity: 3 }),
        row(3, 'breakfast', 'idli', { food_id: 'idli', quantity: 2 }),
        row(4, 'dinner', 'idli', { food_id: 'idli', quantity: 4 }),
        row(5, 'dinner', 'idli', { food_id: 'idli', quantity: 5 }),
      ];
      const idli = buildFoodHistory(index, rows, TODAY)[0]!;
      expect(idli.meals.breakfast).toMatchObject({ quantity: 3, unit: 'piece' });
      expect(idli.meals.dinner).toMatchObject({ quantity: 4, unit: 'piece' }); // 4 and 5 once each: the later one wins
      expect(idli).toMatchObject({ quantity: 3, unit: 'piece' }); // over every meal
    });

    it('keeps the unit with the quantity: 1 katori and 1 cup are different amounts', () => {
      const rows = [row(1, 'lunch', 'curd', { unit: 'katori' }), row(2, 'lunch', 'curd', { unit: 'katori' }), row(3, 'lunch', 'curd', { unit: 'cup' })];
      expect(buildFoodHistory(index, rows, TODAY)[0]!.meals.lunch).toMatchObject({ quantity: 1, unit: 'katori' });
    });
  });

  it('counts an item with no meal toward the food, but toward no meal', () => {
    const history = buildFoodHistory(index, [row(0, null, 'tea'), row(1, null, 'tea')], TODAY);
    expect(history[0]).toMatchObject({ name: 'tea', days: 2, meals: {} });
    for (const m of ['breakfast', 'lunch', 'snack', 'dinner'] as const) expect(forMeal(history, m)).toEqual([]);
  });

  it('ignores a meal it does not know', () => {
    const history = buildFoodHistory(index, [row(0, 'brunch', 'tea')], TODAY);
    expect(history[0]).toMatchObject({ name: 'tea', meals: {} });
  });

  it('gives the same answer whatever order the rows come in', () => {
    const rows = [row(0, 'breakfast', 'egg'), row(9, 'breakfast', 'egg'), row(4, 'lunch', 'rice', { food_id: 'rice' }), row(2, 'breakfast', 'toast')];
    expect(buildFoodHistory(index, [...rows].reverse(), TODAY)).toEqual(buildFoodHistory(index, rows, TODAY));
  });

  it('counts a day that is not over, or one dated ahead, in full', () => {
    const history = buildFoodHistory(index, [row(-1, 'lunch', 'soup'), row(0, 'lunch', 'stew')], TODAY);
    expect(history.map((f) => f.meals.lunch!.score)).toEqual([1, 1]);
  });

  it('lists the best first and no more than it should', () => {
    const rows = Array.from({ length: MAX_HISTORY_FOODS + 25 }, (_, i) => row(i % 30, 'snack', `food ${String(i).padStart(4, '0')}`));
    rows.push(row(0, 'snack', 'tea'), row(1, 'snack', 'tea'), row(2, 'snack', 'tea'));
    const history = buildFoodHistory(index, rows, TODAY);
    expect(history).toHaveLength(MAX_HISTORY_FOODS);
    expect(history[0]!.name).toBe('tea');
  });
});
