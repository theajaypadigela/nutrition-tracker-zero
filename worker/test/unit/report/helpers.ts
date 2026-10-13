import { ENGINE_VERSION, type Target, type TargetSet } from '../../../src/domain/targets/types';
import type { NutrientKey } from '../../../src/domain/nutrients';
import type { IntakeDay, IntakeItem } from '../../../src/domain/intake/types';
import { buildWeeklyReport, type WeeklyInput } from '../../../src/domain/report/weekly';

export const WEEK = '2026-10-05'; // a Monday
export const dates = Array.from({ length: 7 }, (_, i) => `2026-10-${String(5 + i).padStart(2, '0')}`);
const UNITS: Record<string, string> = { calories: 'kcal', sodium: 'mg', potassium: 'mg', calcium: 'mg', iron: 'mg', magnesium: 'mg', zinc: 'mg' };

const target = (nutrient: NutrientKey, kind: Target['kind'], value: number, over: Partial<Target> = {}): Target => ({
  nutrient,
  kind,
  unit: UNITS[nutrient] ?? 'g',
  value,
  refType: kind === 'limit' ? 'limit' : 'RDA',
  window: 'week',
  evidence: 'R',
  basis: 'nasem-dri-appendix-j',
  how: 'test target',
  scored: true,
  verdicts: true,
  origin: 'recommended',
  ...over,
});

export interface RefTargets {
  energy: number;
  minimums: Record<string, number>;
  limits: Record<string, number>;
  floor?: number;
}

/** The same targets the Python reference uses, as a personalised target set (a person for whom the floor is `floor` kcal). */
export function setOf(t: RefTargets, effectiveFrom = '2026-01-01', id: string | null = 'ts_1'): TargetSet {
  const sex = t.floor === 1500 ? 'male' : t.floor === 1350 ? 'average' : 'female';
  const targets: Target[] = [
    target('calories', 'energy', t.energy, { low: t.energy - 240, high: t.energy + 240, scored: false, refType: 'estimate', evidence: 'E' }),
    ...Object.entries(t.minimums).map(([k, v]) => target(k as NutrientKey, 'minimum', v)),
    ...Object.entries(t.limits).map(([k, v]) => target(k as NutrientKey, 'limit', v)),
  ];
  return {
    id,
    effectiveFrom,
    engineVersion: ENGINE_VERSION,
    referenceSet: 'nasem',
    mode: 'personalised',
    inputs: {
      ageBand: '19-30',
      sexForCalc: sex,
      heightCm: 160,
      weightKg: 60,
      bmi: 23.4,
      activity: 'low_active',
      goal: 'general_health',
      goalApplied: 'general_health',
      pace: 'standard',
      pattern: 'omnivore',
    },
    energy: { maintenance: t.energy, target: t.energy, low: t.energy - 240, high: t.energy + 240, method: 'nasem2023', floorApplied: false, delta: 0, crossCheck: { mifflinPal: t.energy, disagree: false } },
    targets,
    warnings: [],
    availableGoals: ['general_health', 'maintain', 'gain', 'lose', 'build_muscle'],
  };
}

export function item(kcal: number | null, nutrients: Partial<Record<NutrientKey, number | null>> = {}, over: Partial<IntakeItem> = {}): IntakeItem {
  return { foodId: over.foodId ?? null, name: over.name ?? 'food', pending: over.pending ?? kcal === null, nutrients: { calories: kcal, ...nutrients }, ...over };
}

export const day = (date: string, items: IntakeItem[] = [], mark: IntakeDay['mark'] = null): IntakeDay => ({ date, items, mark });

/** The ordinary day of the plan's Appendix F: four meals, about 1,800 kcal, every nutrient known. */
export function usual(date: string, over: { sodium?: number } = {}): IntakeDay {
  const m = (kcal: number, p: number, fib: number, na: number, ca: number, fe: number, k: number, mg: number, zn: number, i: number): IntakeItem =>
    item(kcal, { protein: p, fiber: fib, sodium: over.sodium !== undefined ? over.sodium / 4 : na, calcium: ca, iron: fe, potassium: k, magnesium: mg, zinc: zn }, { foodId: `f${i}`, name: `meal ${i}` });
  return day(date, [m(300, 10, 4, 500, 60, 2.5, 400, 50, 1.2, 1), m(650, 24, 12, 900, 250, 5, 1100, 130, 3.5, 2), m(150, 3, 0.5, 120, 90, 0.4, 150, 12, 0.4, 3), m(700, 22, 10, 1000, 120, 4, 1100, 120, 3, 4)]);
}

export const ASHA: RefTargets = {
  energy: 2150,
  minimums: { protein: 60, fiber: 30, potassium: 2600, calcium: 1000, iron: 18, magnesium: 310, zinc: 8 },
  limits: { sodium: 2300 },
  floor: 1200,
};

/** A personalised report of `days` for a person with Asha's targets, the week of 5 October, viewed on 12 October. */
export function reportOf(days: IntakeDay[], over: Partial<WeeklyInput> = {}, targets: RefTargets = ASHA) {
  return buildWeeklyReport({ weekStart: WEEK, today: '2026-10-12', mode: 'personalised', targetSets: [setOf(targets)], days, weeks: 1, ...over });
}
