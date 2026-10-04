// Phase 2 DoD: a pending food resolves for every user once anyone enters its values.
import { describe, expect, it } from 'vitest';
import { api, createProfile } from '../helpers';

let n = 0;
/** A unique leading word keeps tests independent even if storage is shared. */
const tag = () => `t${Date.now().toString(36)}${(n++).toString(36)}q`;

async function addItems(userId: string, items: unknown[], date = '2026-10-04') {
  const res = await api('POST', `/days/${date}/items`, { userId, body: { items } });
  expect(res.status).toBe(201);
  return res.body.items as any[];
}

async function day(userId: string, date = '2026-10-04') {
  return (await api('GET', `/days/${date}`, { userId })).body;
}

describe('resolution cascade', () => {
  it('resolves pending items for every user when one user enters the food', async () => {
    const t = tag();
    const [a, b, c] = [await createProfile(), await createProfile(), await createProfile()];
    const [ia] = await addItems(a, [{ name: `${t} Paneer Tikkas`, quantity: 2, unit: 'plates', meal: 'dinner' }]);
    const [ib] = await addItems(b, [{ name: `${t} paneer tikka`, quantity: 1, unit: 'katori' }]);
    expect(ia.status).toBe('pending_food');
    expect(ia.normalizedName).toBe(`${t} paneer tikka`);
    expect(ib.status).toBe('pending_food');
    expect(ia.nutrients.calories).toBeNull();

    const uncached = await api('GET', '/uncached');
    const group = uncached.body.unknownFoods.find((g: any) => g.normalizedName === `${t} paneer tikka`);
    expect(group).toMatchObject({ itemCount: 2, userCount: 2 });
    expect(group.units.sort()).toEqual(['katori', 'plate']);

    const created = await api('POST', '/foods', {
      userId: c,
      body: {
        displayName: `${t} Paneer Tikka`,
        baseUnit: 'plate',
        nutrients: { calories: 300, protein: 20, fat: 18 },
        units: [{ unit: 'katori', servings: 0.5 }],
      },
    });
    expect(created.status).toBe(201);
    expect(created.body.resolvedCount).toBe(2);
    expect(created.body.food).toMatchObject({ baseUnit: 'plate', units: [{ unit: 'katori', servings: 0.5 }] });

    const dayA = await day(a);
    const itemA = dayA.items.find((i: any) => i.id === ia.id);
    expect(itemA).toMatchObject({ status: 'resolved', foodId: created.body.food.id, nutrients: { calories: 600, protein: 40, fat: 36, carbs: null } });
    expect(dayA.totals.calories.value).toBeGreaterThanOrEqual(600);
    const itemB = (await day(b)).items.find((i: any) => i.id === ib.id);
    expect(itemB).toMatchObject({ status: 'resolved', nutrients: { calories: 150 } });

    const after = await api('GET', '/uncached');
    expect(after.body.unknownFoods.find((g: any) => g.normalizedName === `${t} paneer tikka`)).toBeUndefined();
  });

  it('re-pends unconvertible items when the base unit changes, and a conversion fixes them', async () => {
    const t = tag();
    const u = await createProfile();
    const food = (
      await api('POST', '/foods', {
        body: { displayName: `${t} poha`, baseUnit: 'plate', nutrients: { calories: 250 }, units: [{ unit: 'katori', servings: 0.5 }] },
      })
    ).body.food;
    const [plate, katori, grams] = await addItems(u, [
      { name: `${t} poha`, quantity: 1, unit: 'plate' },
      { name: `${t} poha`, quantity: 2, unit: 'katori' },
      { name: `${t} poha`, quantity: 150, unit: 'g' },
    ]);
    expect([plate.status, katori.status, grams.status]).toEqual(['resolved', 'resolved', 'pending_unit']);

    const changed = await api('PUT', `/foods/${food.id}`, { body: { baseUnit: '100 g', nutrients: { calories: 110 } } });
    expect(changed.status).toBe(200);
    expect(changed.body.repended).toBe(2);
    expect(changed.body.resolvedCount).toBe(1);
    expect(changed.body.food.units).toEqual([]);

    const items = (await day(u)).items.filter((i: any) => i.foodId === food.id);
    expect(Object.fromEntries(items.map((i: any) => [i.unit, i.status]))).toEqual({ plate: 'pending_unit', katori: 'pending_unit', g: 'resolved' });
    expect(items.find((i: any) => i.unit === 'g').nutrients.calories).toBe(165);

    const missing = (await api('GET', '/uncached')).body.missingUnits.filter((m: any) => m.foodId === food.id);
    expect(missing.map((m: any) => m.unit).sort()).toEqual(['katori', 'plate']);

    const conv = await api('PUT', `/foods/${food.id}/units/katoris`, { body: { servings: 1.2 } });
    expect(conv.body.resolvedCount).toBe(1);
    const katoriItem = (await day(u)).items.find((i: any) => i.id === katori.id);
    expect(katoriItem).toMatchObject({ status: 'resolved', nutrients: { calories: 264 } });

    const removed = await api('DELETE', `/foods/${food.id}/units/katori`);
    expect(removed.body.repended).toBe(1);
  });

  it('requires nutrients when the base unit changes', async () => {
    const food = (await api('POST', '/foods', { body: { displayName: `${tag()} upma`, baseUnit: 'plate', nutrients: { calories: 200 } } })).body.food;
    expect((await api('PUT', `/foods/${food.id}`, { body: { baseUnit: 'bowl' } })).status).toBe(400);
  });

  it('links pending names through an alias ("same as existing food") and suggests it first', async () => {
    const t = tag();
    const u = await createProfile();
    const food = (await api('POST', '/foods', { body: { displayName: `${t} curd rice`, baseUnit: 'katori', nutrients: { calories: 180 } } })).body.food;
    const [item] = await addItems(u, [{ name: `${t} curd rices`, quantity: 1, unit: 'katori' }]);
    // "curd rices" normalizes to "curd rice", so it matched directly:
    expect(item.status).toBe('resolved');

    const [typo] = await addItems(u, [{ name: `${t} curd ryce`, quantity: 1, unit: 'katori' }]);
    expect(typo.status).toBe('pending_food');
    const group = (await api('GET', '/uncached')).body.unknownFoods.find((g: any) => g.normalizedName === `${t} curd ryce`);
    expect(group.suggestions[0]).toMatchObject({ foodId: food.id });

    const aliased = await api('POST', `/foods/${food.id}/aliases`, { body: { alias: `${t} Curd Ryce` } });
    expect(aliased.status).toBe(201);
    expect(aliased.body.resolvedCount).toBe(1);
    expect(aliased.body.food.aliases).toEqual([`${t} curd ryce`]);

    const again = await api('POST', `/foods/${food.id}/aliases`, { body: { alias: `${t} curd ryce` } });
    expect(again.status).toBe(200);

    const removed = await api('DELETE', `/foods/${food.id}/aliases/${encodeURIComponent(`${t} curd ryce`)}`);
    expect(removed.body.repended).toBe(1);
  });

  it('rejects names and aliases that are already taken', async () => {
    const t = tag();
    const a = (await api('POST', '/foods', { body: { displayName: `${t} vada`, baseUnit: 'piece', nutrients: { calories: 97 } } })).body.food;
    const b = (await api('POST', '/foods', { body: { displayName: `${t} bonda`, baseUnit: 'piece', nutrients: { calories: 110 }, aliases: [`${t} aloo bonda`] } })).body.food;
    const dup = await api('POST', '/foods', { body: { displayName: `${t} Vadas`, baseUnit: 'piece', nutrients: { calories: 1 } } });
    expect(dup.status).toBe(409);
    expect(dup.body.error.foodId).toBe(a.id);
    expect((await api('POST', '/foods', { body: { displayName: `${t} aloo bonda`, baseUnit: 'piece', nutrients: { calories: 1 } } })).status).toBe(409);
    expect((await api('POST', `/foods/${a.id}/aliases`, { body: { alias: `${t} aloo bonda` } })).status).toBe(409);
    expect((await api('POST', `/foods/${a.id}/aliases`, { body: { alias: `${t} bonda` } })).status).toBe(409);
    expect((await api('PUT', `/foods/${a.id}`, { body: { displayName: `${t} bonda` } })).status).toBe(409);
    expect(b.aliases).toEqual([`${t} aloo bonda`]);
  });

  it('keeps items linked when a food is renamed (old name becomes an alias)', async () => {
    const t = tag();
    const u = await createProfile();
    const food = (await api('POST', '/foods', { body: { displayName: `${t} dal`, baseUnit: 'katori', nutrients: { calories: 150 } } })).body.food;
    const [item] = await addItems(u, [{ name: `${t} dal`, quantity: 1, unit: 'katori' }]);
    const renamed = await api('PUT', `/foods/${food.id}`, { body: { displayName: `${t} Dal Tadka` } });
    expect(renamed.body.food).toMatchObject({ name: `${t} dal tadka`, aliases: [`${t} dal`] });
    expect((await day(u)).items.find((i: any) => i.id === item.id)).toMatchObject({ status: 'resolved', foodName: `${t} Dal Tadka` });
  });

  it('validates food input', async () => {
    const t = tag();
    for (const body of [
      { displayName: `${t} a`, baseUnit: 'plate', nutrients: {} },
      { displayName: `${t} b`, baseUnit: 'g', nutrients: { calories: 1 } },
      { displayName: `${t} c`, baseUnit: 'plate', nutrients: { calories: -1 } },
      { displayName: `${t} d`, baseUnit: 'plate', nutrients: { calories: 1, vitaminZ: 2 } },
      { displayName: `${t} e`, baseUnit: 'plate', nutrients: { calories: 1 }, units: [{ unit: 'plate', servings: 2 }] },
    ]) {
      expect((await api('POST', '/foods', { body })).status).toBe(400);
    }
  });

  it('lists and searches foods', async () => {
    const t = tag();
    await api('POST', '/foods', { body: { displayName: `${t} Masala Chai`, baseUnit: 'cup', nutrients: { calories: 90 }, aliases: [`${t} tea`] } });
    const all = await api('GET', `/foods?q=${encodeURIComponent(`${t} tea`)}`);
    expect(all.body.foods.map((f: any) => f.displayName)).toEqual([`${t} Masala Chai`]);
    const one = await api('GET', `/foods/${all.body.foods[0].id}`);
    expect(one.body.food.aliases).toEqual([`${t} tea`]);
    expect((await api('GET', '/foods/missing')).status).toBe(404);
  });
});

describe('days and items', () => {
  it('adds, edits, deletes and totals items against goals', async () => {
    const t = tag();
    const u = await createProfile();
    await api('PUT', '/me/goals', { userId: u, body: { goals: { calories: 2000 } } });
    await api('POST', '/foods', { body: { displayName: `${t} egg`, baseUnit: 'piece', nutrients: { calories: 78, protein: 6 } } });
    const [egg, mystery] = await addItems(u, [
      { name: `${t} eggs`, quantity: 2, unit: 'piece', meal: 'breakfast' },
      { name: `${t} mystery`, quantity: 1, unit: 'bowl' },
    ], '2026-10-01');

    let d = await day(u, '2026-10-01');
    expect(d.totals.calories).toEqual({ value: 156, missingItems: 1 });
    expect(d.totals.protein).toEqual({ value: 12, missingItems: 1 });
    expect(d.goals.calories).toBe(2000);
    expect(d.pendingCount).toBe(1);

    const patched = await api('PATCH', `/items/${egg.id}`, { userId: u, body: { quantity: 3, meal: null } });
    expect(patched.body.item).toMatchObject({ quantity: 3, meal: null, nutrients: { calories: 234 } });
    const renamed = await api('PATCH', `/items/${mystery.id}`, { userId: u, body: { name: `${t} egg`, unit: 'pcs' } });
    expect(renamed.body.item).toMatchObject({ status: 'resolved', unit: 'piece' });

    d = await day(u, '2026-10-01');
    expect(d.totals.calories).toEqual({ value: 312, missingItems: 0 });

    const other = await createProfile();
    expect((await api('PATCH', `/items/${egg.id}`, { userId: other, body: { quantity: 1 } })).status).toBe(404);
    expect((await api('DELETE', `/items/${egg.id}`, { userId: other })).status).toBe(404);
    expect((await api('DELETE', `/items/${egg.id}`, { userId: u })).status).toBe(204);
    expect((await day(u, '2026-10-01')).items).toHaveLength(1);
  });

  it('reports per-day totals for a range', async () => {
    const t = tag();
    const u = await createProfile();
    await api('POST', '/foods', { body: { displayName: `${t} banana`, baseUnit: 'piece', nutrients: { calories: 105 } } });
    await addItems(u, [{ name: `${t} banana`, quantity: 1, unit: 'piece' }], '2026-09-28');
    await addItems(u, [{ name: `${t} banana`, quantity: 2, unit: 'piece' }], '2026-09-30');
    const res = await api('GET', '/days?from=2026-09-28&to=2026-10-04', { userId: u });
    expect(res.body.days).toHaveLength(7);
    expect(res.body.days.map((d: any) => d.totals.calories.value)).toEqual([105, 0, 210, 0, 0, 0, 0]);
    expect(res.body.goals.calories).toBe(2500);
    expect((await api('GET', '/days?from=2026-10-04&to=2026-09-28', { userId: u })).status).toBe(400);
    expect((await api('GET', '/days?from=2026-01-01&to=2026-06-01', { userId: u })).status).toBe(400);
  });

  it('validates dates and items', async () => {
    const u = await createProfile();
    expect((await api('GET', '/days/2026-02-30', { userId: u })).status).toBe(400);
    expect((await api('POST', '/days/2026-10-04/items', { userId: u, body: { items: [] } })).status).toBe(400);
    expect((await api('POST', '/days/2026-10-04/items', { userId: u, body: { items: [{ name: 'x', quantity: 0, unit: 'g' }] } })).status).toBe(400);
  });
});
