/**
 * The breakdown, and the two pending lists, end to end on the phone: the app's own client against the Worker code running on SQLite.
 * Today builds a day's breakdown from the day it already has; the report asks the Worker for a span. They must give the same list, and
 * both must add up to the figures the dashboards show, for every nutrient.
 */
import { createEmbedded, type EmbeddedBackend } from '@/embedded/runtime';
import { nodeSqliteDriver } from '../../testing/nodeSqlite';

let mockBackend: EmbeddedBackend;
const driver = nodeSqliteDriver();

jest.mock('@/config/local', () => ({ ON_DEVICE: true, API_BASE_URL: 'http://unused', APP_TOKEN: 'tok' }));
jest.mock('@/embedded/runtime', () => {
  const actual = jest.requireActual('@/embedded/runtime');
  return { ...actual, getEmbedded: () => mockBackend };
});

import { api, setApiSecret, setApiUser } from '@/api/client';
import type { Meta } from '@/api/types';
import { breakdownOfDay, groupByDay, groupByFood, groupByMeal } from '@/utils/breakdown';

const day = (back: number) => new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10);
let meta: Meta;

beforeAll(async () => {
  mockBackend = createEmbedded(driver, 'tok');
  meta = await api.meta();
});

async function newProfile(name: string) {
  const { profile, secret } = await api.createProfile(name);
  setApiUser(profile.id);
  setApiSecret(secret);
  return profile;
}

/** The foods list is shared by every profile on the phone, so a second person does not enter them again. */
async function food(displayName: string, baseUnit: string, nutrients: Record<string, number>) {
  if ((await api.listFoods(displayName)).some((f) => f.displayName === displayName)) return;
  await api.createFood({ displayName, baseUnit, nutrients });
}

async function seed() {
  await food('Idli', 'piece', { calories: 58, protein: 2.15, carbs: 12, fat: 0.4, fiber: 0.8, sodium: 110, vitaminB12: 0.1 });
  await food('Paneer curry', 'katori', { calories: 260, protein: 14.3, carbs: 8, fat: 20, vitaminA: 90, calcium: 240 });
  await food('Plain biscuit', 'piece', { calories: 45 });
  await api.addItems(day(2), [
    { name: 'idli', quantity: 3, unit: 'piece', meal: 'breakfast' },
    { name: 'paneer curry', quantity: 1.5, unit: 'katori', meal: 'lunch' },
  ]);
  await api.addItems(day(1), [
    { name: 'idli', quantity: 2, unit: 'piece', meal: 'breakfast' },
    { name: 'plain biscuit', quantity: 2, unit: 'piece', meal: 'snack' },
    { name: 'a food nobody entered', quantity: 1, unit: 'bowl', meal: 'dinner' },
  ]);
  await api.addItems(day(0), [
    { name: 'paneer curry', quantity: 1, unit: 'katori', meal: 'lunch' },
    { name: 'paneer curry', quantity: 1, unit: 'handful', meal: 'dinner' }, // a unit nobody converted
    { name: 'idli', quantity: 4, unit: 'piece' }, // no meal: "Other"
  ]);
}

describe('the breakdown on the phone', () => {
  it('builds a day from the day itself exactly as the Worker builds it for that day, for every nutrient', async () => {
    await newProfile('Breakdown Asha');
    await seed();
    for (const back of [2, 1, 0]) {
      const d = await api.getDay(day(back));
      for (const n of meta.nutrients) {
        const fromDay = breakdownOfDay(d, n.key);
        const fromWorker = await api.getNutrientBreakdown(day(back), day(back), n.key);
        expect(fromDay.items).toEqual(fromWorker.items);
        expect(fromDay.total).toBe(fromWorker.total);
        expect(fromDay.knownItems).toBe(fromWorker.knownItems);
        expect(fromDay.missingItems).toBe(fromWorker.missingItems);
        expect(fromDay.isLowerBound).toBe(fromWorker.isLowerBound);
        // and the dashboard's own figures for the day
        expect(fromDay.total ?? 0).toBe(d.totals[n.key]!.value);
        expect(fromDay.missingItems).toBe(d.totals[n.key]!.missingItems);
      }
    }
  });

  it('adds a span up to the report\'s total for every nutrient, and the groupings add up to the same figure', async () => {
    await newProfile('Breakdown Ravi');
    await seed();
    const range = await api.getRangeReport(day(2), day(0));
    for (const n of meta.nutrients) {
      const b = await api.getNutrientBreakdown(day(2), day(0), n.key);
      const r = range.nutrients.find((x) => x.nutrient === n.key)!;
      expect(b.total).toBe(r.total);
      expect(b.knownItems).toBe(r.knownItems);
      expect(b.missingItems).toBe(r.missingItems);
      expect(b.isLowerBound).toBe(r.isLowerBound);
      const sum = (xs: { subtotal: number | null }[]) => Math.round(xs.reduce((s, g) => s + (g.subtotal ?? 0), 0) * 100) / 100;
      expect(sum(groupByDay(b.items, (d) => d))).toBe(b.total ?? 0);
      expect(sum(groupByFood(b.items))).toBe(b.total ?? 0);
      expect(sum(groupByMeal(b.items))).toBe(b.total ?? 0);
      expect(b.items.reduce((s, i) => s + (i.amount ?? 0), 0)).toBeCloseTo(b.total ?? 0, 6);
    }
  });

  it('follows an edit, a delete and a new entry', async () => {
    await newProfile('Breakdown Hema');
    await seed();
    const d0 = day(2);
    let b = await api.getNutrientBreakdown(d0, d0, 'protein');
    const idli = b.items.find((i) => i.rawName === 'idli')!;
    await api.updateItem(idli.id, { quantity: 5 });
    b = await api.getNutrientBreakdown(d0, d0, 'protein');
    expect(b.items.find((i) => i.id === idli.id)!.amount).toBe(10.75);
    expect(b.total).toBe((await api.getDay(d0)).totals.protein!.value);
    await api.deleteItem(b.items.find((i) => i.rawName === 'paneer curry')!.id);
    await api.addItems(d0, [{ name: 'idli', quantity: 1, unit: 'piece', meal: 'snack' }]);
    b = await api.getNutrientBreakdown(d0, d0, 'protein');
    expect(b.items).toHaveLength(2);
    expect(b.total).toBe(12.9);
    expect(breakdownOfDay(await api.getDay(d0), 'protein').total).toBe(12.9);
  });
});

describe('the two pending lists on the phone', () => {
  it('lists a person\'s own pending items under "mine" and everyone\'s on the phone under the top level', async () => {
    await newProfile('Pending Asha');
    await api.addItems(day(0), [{ name: 'zz first dish', quantity: 1, unit: 'bowl' }]);
    await newProfile('Pending Ravi');
    await api.addItems(day(0), [{ name: 'zz first dish', quantity: 2, unit: 'bowl' }, { name: 'zz second dish', quantity: 1, unit: 'bowl' }]);
    const u = await api.uncached();
    expect(u.mine!.unknownFoods.map((f) => f.normalizedName).filter((n) => n.startsWith('zz')).sort()).toEqual(['zz first dish', 'zz second dish']);
    expect(u.unknownFoods.find((f) => f.normalizedName === 'zz first dish')).toMatchObject({ itemCount: 2, userCount: 2, myItemCount: 1 });
    expect(u.unknownFoods.find((f) => f.normalizedName === 'zz second dish')).toMatchObject({ itemCount: 1, myItemCount: 1 });
  });

  it('refuses to mark a day while day marking is off', async () => {
    await newProfile('Marker');
    await expect(api.setDayStatus(day(0), 'skip')).rejects.toMatchObject({ status: 409, code: 'day_marking_off' });
    await expect(api.clearDayStatus(day(0))).rejects.toMatchObject({ status: 409, code: 'day_marking_off' });
    expect((await api.getDay(day(0))).status).toBeNull();
  });
});
