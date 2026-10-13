import type { NutrientKey } from '../../../src/domain/nutrients';
import type { IntakeDay, IntakeItem } from '../../../src/domain/intake/types';
import { dates, day, item } from './helpers';

/** A small seeded random generator (mulberry32): the same seed, the same weeks, on every machine. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rand = () => number;
export const uniform = (r: Rand, lo: number, hi: number) => lo + (hi - lo) * r();
export const pick = <T>(r: Rand, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;

/** Per 1,000 kcal ranges of a mixed diet, for the eight nutrients the score reads. */
const DENSITY: Partial<Record<NutrientKey, [number, number]>> = {
  protein: [25, 55],
  fiber: [8, 22],
  potassium: [900, 1800],
  calcium: [300, 900],
  iron: [4, 11],
  magnesium: [90, 250],
  zinc: [3, 8],
  sodium: [700, 2200],
};

/** Four meals of 150-900 kcal with every nutrient known, on a day that is comfortably `valid` for a 2,150 kcal person. */
export function randomDay(r: Rand, date: string): IntakeDay {
  const meals = 3 + Math.floor(r() * 3);
  const items: IntakeItem[] = [];
  const total = uniform(r, 1600, 2600);
  for (let i = 0; i < meals; i++) {
    const kcal = Math.round((total / meals) * uniform(r, 0.6, 1.4));
    const n: Partial<Record<NutrientKey, number>> = {};
    for (const [k, [lo, hi]] of Object.entries(DENSITY) as [NutrientKey, [number, number]][]) n[k] = Math.round(((kcal * uniform(r, lo, hi)) / 1000) * 100) / 100;
    items.push(item(kcal, n, { foodId: `f${i % 4}`, name: `food ${i % 4}` }));
  }
  return day(date, items);
}

export function randomWeek(r: Rand, days = 7): IntakeDay[] {
  return dates.map((d, i) => (i < days ? randomDay(r, d) : day(d)));
}

/** A deep copy with `mutate` applied to every item's nutrients (the amounts, not the structure). */
export function mapItems(days: readonly IntakeDay[], f: (it: IntakeItem) => IntakeItem): IntakeDay[] {
  return days.map((d) => ({ ...d, items: d.items.map(f) }));
}

export function scaled(days: readonly IntakeDay[], factor: number): IntakeDay[] {
  return mapItems(days, (it) => ({
    ...it,
    nutrients: Object.fromEntries(Object.entries(it.nutrients).map(([k, v]) => [k, typeof v === 'number' ? v * factor : v])) as IntakeItem['nutrients'],
  }));
}
