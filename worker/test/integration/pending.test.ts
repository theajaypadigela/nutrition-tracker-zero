/**
 * The Pending list in two scopes: "My pending items" (what this person logged that cannot be counted yet) and "Global pending items"
 * (everything anyone logged). Same shapes, same order of fixing: entering a food's values fixes it for everyone, and a person's own
 * list is never padded with anyone else's items.
 */
import { describe, expect, it } from 'vitest';
import { api, createProfile } from '../helpers';

let n = 0;
const tag = () => `p${Date.now().toString(36)}${(n++).toString(36)}z`;

async function addItems(userId: string, items: unknown[], date = '2026-10-04') {
  const res = await api('POST', `/days/${date}/items`, { userId, body: { items } });
  expect(res.status).toBe(201);
  return res.body.items as any[];
}

const name = (g: any) => g.normalizedName as string;

describe('GET /uncached: my pending items and global pending items', () => {
  it('has no "mine" for a request that names no one, and the shared list as before', async () => {
    const t = tag();
    const a = await createProfile();
    await addItems(a, [{ name: `${t} alpha`, quantity: 1, unit: 'bowl' }]);
    const res = await api('GET', '/uncached');
    expect(res.status).toBe(200);
    expect(res.body.mine).toBeUndefined();
    expect(res.body.unknownFoods.find((g: any) => name(g) === `${t} alpha`)).toMatchObject({ itemCount: 1, userCount: 1, myItemCount: 0 });
    expect(res.body.totals.unknownFoods).toBeGreaterThanOrEqual(1);
  });

  it('lists only what this person logged under "mine", and says in the shared list which items are theirs', async () => {
    const t = tag();
    const [a, b, c] = [await createProfile(), await createProfile(), await createProfile()];
    await addItems(a, [
      { name: `${t} alpha`, quantity: 1, unit: 'bowl', meal: 'lunch' },
      { name: `${t} beta`, quantity: 2, unit: 'piece', meal: 'dinner' },
    ]);
    await addItems(b, [
      { name: `${t} beta`, quantity: 1, unit: 'piece' },
      { name: `${t} gamma`, quantity: 3, unit: 'cup' },
    ]);

    const asA = (await api('GET', '/uncached', { userId: a })).body;
    const mine = asA.mine.unknownFoods.filter((g: any) => name(g).startsWith(t));
    expect(mine.map(name).sort()).toEqual([`${t} alpha`, `${t} beta`]);
    // their own counts, not the shared ones: beta was logged twice in all (once by each person) but once by them
    expect(mine.find((g: any) => name(g) === `${t} beta`)).toMatchObject({ itemCount: 1, userCount: 1, myItemCount: 1, units: ['piece'], lastDate: '2026-10-04' });
    expect(asA.mine.unknownFoods.some((g: any) => name(g) === `${t} gamma`)).toBe(false);

    const shared = asA.unknownFoods.filter((g: any) => name(g).startsWith(t));
    expect(shared.map(name).sort()).toEqual([`${t} alpha`, `${t} beta`, `${t} gamma`]);
    expect(shared.find((g: any) => name(g) === `${t} beta`)).toMatchObject({ itemCount: 2, userCount: 2, myItemCount: 1 });
    expect(shared.find((g: any) => name(g) === `${t} gamma`)).toMatchObject({ itemCount: 1, userCount: 1, myItemCount: 0 });

    // the other person sees the other half; a third person has nothing of their own
    const asB = (await api('GET', '/uncached', { userId: b })).body;
    expect(asB.mine.unknownFoods.filter((g: any) => name(g).startsWith(t)).map(name).sort()).toEqual([`${t} beta`, `${t} gamma`]);
    const asC = (await api('GET', '/uncached', { userId: c })).body;
    expect(asC.mine.totals).toEqual({ unknownFoods: 0, missingUnits: 0 });
    expect(asC.mine.unknownFoods).toEqual([]);
    expect(asC.mine.missingUnits).toEqual([]);
    expect(asC.unknownFoods.filter((g: any) => name(g).startsWith(t))).toHaveLength(3);
  });

  it('counts a person\'s own pending foods and conversions apart from everyone\'s', async () => {
    const t = tag();
    const [a, b] = [await createProfile(), await createProfile()];
    const base = (await api('GET', '/uncached', { userId: a })).body;
    const food = (await api('POST', '/foods', { userId: a, body: { displayName: `${t} Khichdi`, baseUnit: 'katori', nutrients: { calories: 180, protein: 6 } } })).body.food;
    await addItems(a, [
      { name: `${t} nameless`, quantity: 1, unit: 'bowl' },
      { name: `${t} khichdi`, quantity: 1, unit: 'handful' },
    ]);
    await addItems(b, [{ name: `${t} khichdi`, quantity: 2, unit: 'handful' }, { name: `${t} khichdi`, quantity: 1, unit: 'ladle' }]);
    const after = (await api('GET', '/uncached', { userId: a })).body;
    expect(after.mine.totals).toEqual({ unknownFoods: base.mine.totals.unknownFoods + 1, missingUnits: base.mine.totals.missingUnits + 1 });
    expect(after.totals).toEqual({ unknownFoods: base.totals.unknownFoods + 1, missingUnits: base.totals.missingUnits + 2 });
    const mineUnit = after.mine.missingUnits.find((m: any) => m.foodId === food.id);
    expect(mineUnit).toMatchObject({ foodName: `${t} Khichdi`, baseUnit: 'katori', unit: 'handful', itemCount: 1, userCount: 1, myItemCount: 1 });
    const sharedUnits = after.missingUnits.filter((m: any) => m.foodId === food.id);
    expect(sharedUnits.map((m: any) => [m.unit, m.itemCount, m.myItemCount]).sort()).toEqual([['handful', 2, 1], ['ladle', 1, 0]]);
    // ...and a person with only the other kind of pending item has no "handful" of their own
    expect((await api('GET', '/uncached', { userId: b })).body.mine.missingUnits.filter((m: any) => m.foodId === food.id).map((m: any) => m.unit).sort()).toEqual(['handful', 'ladle']);
  });

  it('moves an item out of both lists when anyone enters its values, and leaves the others where they were', async () => {
    const t = tag();
    const [a, b, c] = [await createProfile(), await createProfile(), await createProfile()];
    await addItems(a, [{ name: `${t} alpha`, quantity: 1, unit: 'bowl' }]);
    await addItems(b, [{ name: `${t} alpha`, quantity: 1, unit: 'bowl' }, { name: `${t} gamma`, quantity: 1, unit: 'bowl' }]);
    const created = await api('POST', '/foods', { userId: c, body: { displayName: `${t} Alpha`, baseUnit: 'bowl', nutrients: { calories: 120, protein: 4 } } });
    expect(created.body.resolvedCount).toBe(2);
    const asA = (await api('GET', '/uncached', { userId: a })).body;
    expect(asA.mine.unknownFoods.filter((g: any) => name(g).startsWith(t))).toEqual([]);
    expect(asA.unknownFoods.filter((g: any) => name(g).startsWith(t)).map(name)).toEqual([`${t} gamma`]);
    const asB = (await api('GET', '/uncached', { userId: b })).body;
    expect(asB.mine.unknownFoods.filter((g: any) => name(g).startsWith(t)).map(name)).toEqual([`${t} gamma`]);
  });

  it('puts what a person logged lately first in their own list, and the most-logged first in the shared one', async () => {
    const t = tag();
    const [a, b] = [await createProfile(), await createProfile()];
    await addItems(a, [{ name: `${t} older`, quantity: 1, unit: 'bowl' }], '2026-09-01');
    await addItems(a, [{ name: `${t} newer`, quantity: 1, unit: 'bowl' }], '2026-10-02');
    await addItems(b, [{ name: `${t} older`, quantity: 1, unit: 'bowl' }, { name: `${t} older`, quantity: 2, unit: 'bowl' }]);
    const res = (await api('GET', '/uncached', { userId: a })).body;
    expect(res.mine.unknownFoods.filter((g: any) => name(g).startsWith(t)).map(name)).toEqual([`${t} newer`, `${t} older`]);
    expect(res.unknownFoods.filter((g: any) => name(g).startsWith(t)).map(name)).toEqual([`${t} older`, `${t} newer`]);
  });

  it('honours the limit on each list, and still counts them all', async () => {
    const t = tag();
    const a = await createProfile();
    await addItems(a, [1, 2, 3].map((i) => ({ name: `${t} item${i}`, quantity: 1, unit: 'bowl' })));
    const res = (await api('GET', '/uncached?limit=2', { userId: a })).body;
    expect(res.mine.unknownFoods).toHaveLength(2);
    expect(res.mine.totals.unknownFoods).toBe(3);
    expect(res.unknownFoods).toHaveLength(2);
  });

  it('does not tell one person who else logged an item, and refuses without the app token', async () => {
    const t = tag();
    const [a, b] = [await createProfile(), await createProfile()];
    await addItems(b, [{ name: `${t} secret dish`, quantity: 1, unit: 'bowl' }]);
    const text = (await api('GET', '/uncached', { userId: a })).text;
    expect(text).not.toContain(b);
    expect(text).not.toMatch(/user_id|userId|"id"/);
    expect((await api('GET', '/uncached', { userId: a, token: null })).status).toBe(401);
  });
});
