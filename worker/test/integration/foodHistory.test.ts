/**
 * GET /foods/history: the foods a person logs, ranked for the log screen's suggestions, from their own log only (frequency and
 * recency, separately for each meal).
 */
import { describe, expect, it } from 'vitest';
import { HISTORY_WINDOW_DAYS } from '../../src/domain/history';
import { addDays, localDateIn } from '../../src/domain/time';
import { api, createProfile, unique } from '../helpers';

const TODAY = localDateIn('Asia/Kolkata');
const ago = (days: number) => addDays(TODAY, -days);

let n = 0;
/** A leading word of its own keeps the foods of one test apart from another's in the shared foods table. */
const tag = () => `h${Date.now().toString(36)}${(n++).toString(36)}q`;

async function log(userId: string, date: string, items: { name: string; meal?: string | null; quantity?: number; unit?: string }[]) {
  const res = await api('POST', `/days/${date}/items`, {
    userId,
    body: { items: items.map((i) => ({ name: i.name, quantity: i.quantity ?? 1, unit: i.unit ?? 'piece', meal: i.meal ?? null })) },
  });
  expect(res.status).toBe(201);
  return res.body.items as any[];
}

async function history(userId: string) {
  const res = await api('GET', '/foods/history', { userId });
  expect(res.status).toBe(200);
  return res.body as { asOf: string; windowDays: number; halfLifeDays: number; foods: any[] };
}

/** A meal's list, as the screen sorts it. */
const forMeal = (foods: any[], meal: string) =>
  foods
    .filter((f) => f.meals[meal])
    .sort((a, b) => b.meals[meal].score - a.meals[meal].score)
    .map((f) => f.displayName);

describe('GET /foods/history', () => {
  it('is empty for a person who has logged nothing', async () => {
    const body = await history(await createProfile());
    expect(body).toMatchObject({ asOf: TODAY, windowDays: HISTORY_WINDOW_DAYS, foods: [] });
    expect(body.halfLifeDays).toBeGreaterThan(0);
  });

  it('ranks each person by their own meals: eggs lead one breakfast, idli the other, and lunch is its own list', async () => {
    const t = tag();
    const [a, b] = [await createProfile(), await createProfile()];
    for (const d of [1, 2, 3, 4]) {
      await log(a, ago(d), [{ name: `${t} egg`, meal: 'breakfast', quantity: 2 }]);
      await log(b, ago(d), [{ name: `${t} idli`, meal: 'breakfast', quantity: 3 }]);
    }
    await log(a, ago(6), [{ name: `${t} idli`, meal: 'breakfast' }]);
    await log(b, ago(6), [{ name: `${t} egg`, meal: 'breakfast' }]);
    for (const d of [1, 2, 3]) await log(a, ago(d), [{ name: `${t} dal`, meal: 'lunch', quantity: 1, unit: 'katori' }]);

    const [ha, hb] = [await history(a), await history(b)];
    expect(forMeal(ha.foods, 'breakfast')).toEqual([`${t} egg`, `${t} idli`]);
    expect(forMeal(hb.foods, 'breakfast')).toEqual([`${t} idli`, `${t} egg`]);
    // Lunch for A is only what A had for lunch; B has nothing for lunch, so a generic list would take over.
    expect(forMeal(ha.foods, 'lunch')).toEqual([`${t} dal`]);
    expect(forMeal(hb.foods, 'lunch')).toEqual([]);
    expect(ha.foods.find((f) => f.displayName === `${t} egg`).meals.lunch).toBeUndefined();
    // The amount to fill in is the one that person usually logs.
    expect(ha.foods.find((f) => f.displayName === `${t} egg`).meals.breakfast).toMatchObject({ quantity: 2, unit: 'piece', days: 4 });
    expect(hb.foods.find((f) => f.displayName === `${t} idli`).meals.breakfast).toMatchObject({ quantity: 3, unit: 'piece', days: 4 });
    expect(ha.foods.find((f) => f.displayName === `${t} dal`).meals.lunch).toMatchObject({ quantity: 1, unit: 'katori' });
  });

  it('never shows one person what another logged', async () => {
    const t = tag();
    const [a, b] = [await createProfile(), await createProfile()];
    await log(a, ago(1), [{ name: `${t} secret snack`, meal: 'snack' }]);
    expect((await history(b)).foods).toEqual([]);
    expect((await history(a)).foods.map((f) => f.displayName)).toEqual([`${t} secret snack`]);
  });

  it('puts a food that is added later in the list as soon as it is logged, joined to the food and its values', async () => {
    const t = tag();
    const u = await createProfile();
    const [pending] = await log(u, ago(2), [{ name: `${t} upma`, meal: 'breakfast', quantity: 1, unit: 'katori' }]);
    expect(pending.status).toBe('pending_food');
    let foods = (await history(u)).foods;
    expect(foods).toHaveLength(1);
    expect(foods[0]).toMatchObject({ foodId: null, name: `${t} upma`, displayName: `${t} upma` });

    // Someone adds the food: the earlier log now resolves to it, and the next log of it counts with that one.
    const created = await api('POST', '/foods', { body: { displayName: `${t} Upma`, baseUnit: 'katori', nutrients: { calories: 180 } } });
    expect(created.status).toBe(201);
    await log(u, ago(0), [{ name: `${t} Upma`, meal: 'breakfast', quantity: 1, unit: 'katori' }]);
    foods = (await history(u)).foods;
    expect(foods).toHaveLength(1);
    expect(foods[0]).toMatchObject({ foodId: created.body.food.id, name: `${t} upma`, displayName: `${t} Upma` });
    expect(foods[0].meals.breakfast.days).toBe(2);
  });

  it('counts every name that resolves to a food as that food', async () => {
    const t = tag();
    const u = await createProfile();
    const food = (await api('POST', '/foods', { body: { displayName: `${t} Tea`, baseUnit: 'cup', nutrients: { calories: 40 }, aliases: [`${t} chai`] } })).body.food;
    await log(u, ago(1), [{ name: `${t} chai`, meal: 'snack', unit: 'cup' }]);
    await log(u, ago(2), [{ name: `${t} tea`, meal: 'snack', unit: 'cup' }]);
    const foods = (await history(u)).foods;
    expect(foods).toHaveLength(1);
    expect(foods[0]).toMatchObject({ foodId: food.id, displayName: `${t} Tea` });
    expect(foods[0].meals.snack.days).toBe(2);
  });

  it('forgets an item once it is deleted', async () => {
    const t = tag();
    const u = await createProfile();
    const [item] = await log(u, ago(1), [{ name: `${t} mistake`, meal: 'dinner' }]);
    expect((await history(u)).foods).toHaveLength(1);
    expect((await api('DELETE', `/items/${item.id}`, { userId: u })).status).toBe(204);
    expect((await history(u)).foods).toEqual([]);
  });

  it('reads only the recent past', async () => {
    const t = tag();
    const u = await createProfile();
    await log(u, ago(HISTORY_WINDOW_DAYS + 20), [{ name: `${t} long ago`, meal: 'lunch' }]);
    await log(u, ago(HISTORY_WINDOW_DAYS - 5), [{ name: `${t} lately`, meal: 'lunch' }]);
    expect((await history(u)).foods.map((f) => f.displayName)).toEqual([`${t} lately`]);
  });

  it('needs a profile, and the app token', async () => {
    expect((await api('GET', '/foods/history')).status).toBe(400);
    expect((await api('GET', '/foods/history', { userId: '00000000-0000-0000-0000-000000000000' })).status).toBe(404);
    expect((await api('GET', '/foods/history', { userId: await createProfile(unique('Anon')), token: null })).status).toBe(401);
  });

  it('is not mistaken for a food id', async () => {
    // `/foods/:id` would answer 404 "Food not found" for an id of "history"; the route above it must win.
    const res = await api('GET', '/foods/history', { userId: await createProfile() });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('foods');
  });
});
