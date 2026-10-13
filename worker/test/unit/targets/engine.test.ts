/**
 * Golden vectors for the targets engine: expected values computed INDEPENDENTLY of the TypeScript, by the
 * Python reference implementation of Appendix E (test/reference/engine_ref.py), and stored as fixtures
 * (WEEKLY_BREAKDOWN_PLAN.md 11.1). The test fails if the Worker disagrees by more than rounding.
 */
import { describe, expect, it } from 'vitest';
import bands from '../../fixtures/golden/bands.json';
import icmrBands from '../../fixtures/golden/icmr-bands.json';
import icmrPersonas from '../../fixtures/golden/personas-icmr.json';
import personas from '../../fixtures/golden/personas.json';
import projection from '../../fixtures/golden/projection.json';
import randomTargets from '../../fixtures/golden/random-targets.json';
import { maintenanceEstimate } from '../../../src/domain/targets/energy';
import { projectWeightChange, staticWeeklyKg } from '../../../src/domain/targets/goal';
import { icmrBandOf, icmrReference } from '../../../src/domain/reference/icmr';
import { ageBandOf, microReference, type MicroKey } from '../../../src/domain/reference/nasem';
import { compute, target, type FixtureInput } from './helpers';

const MICRO_ORDER: [string, MicroKey][] = [
  ['vitamin_a', 'vitaminA'],
  ['vitamin_c', 'vitaminC'],
  ['vitamin_d', 'vitaminD'],
  ['vitamin_e', 'vitaminE'],
  ['vitamin_k', 'vitaminK'],
  ['calcium', 'calcium'],
  ['iron', 'iron'],
  ['magnesium', 'magnesium'],
  ['zinc', 'zinc'],
];

/** The reference's warning names mapped to the Worker's. A too-small deficit makes the floor note moot. */
function pyWarnings(ws: string[]): string[] {
  const set = new Set(ws.map((w) => (w === 'iron_x1.8_plant_based' ? 'iron_plant_based' : w)));
  if (set.has('deficit_too_small')) set.delete('floor_limited_deficit');
  return [...set].sort();
}

describe('NASEM 2023 worked examples (published: 2,275 and 3,041 kcal)', () => {
  it('reproduces both to the kilocalorie', () => {
    expect(Math.round(maintenanceEstimate('female', 22, 165, 63, 'low_active'))).toBe(personas.nasemExamples.woman_22_165_63_low_active);
    expect(Math.round(maintenanceEstimate('female', 22, 165, 63, 'low_active'))).toBe(2275);
    expect(Math.round(maintenanceEstimate('male', 45, 175, 100, 'low_active'))).toBe(personas.nasemExamples.man_45_175_100_low_active);
    expect(Math.round(maintenanceEstimate('male', 45, 175, 100, 'low_active'))).toBe(3041);
  });
});

/** What the reference computed for a persona; the JSON import types every optional field as possibly absent. */
interface Expected {
  mode: string;
  goal_applied: string;
  bmi: number;
  tee: number;
  range68: [number, number];
  target: number;
  delta: number;
  mifflin_x_pal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  fibre_g: number;
  sodium_limit_mg: number;
  potassium_mg: number;
  micros: Record<string, { value: number; type: string }>;
  warnings: string[];
}

describe('the sixteen personas of plan 4.8', () => {
  for (const { input, expected } of personas.personas) {
    const e = expected as unknown as Expected;
    it(`${input.name}: ${e.mode}`, () => {
      const set = compute(input as FixtureInput);
      expect(set.mode).toBe(e.mode);
      if (e.mode === 'reference_only') {
        expect(set.targets).toEqual([]);
        expect(set.energy).toBeNull();
        expect(set.inputs).toBeNull();
        return;
      }
      expect(set.inputs!.goalApplied).toBe(e.goal_applied);
      expect(set.inputs!.bmi).toBe(e.bmi);
      expect(set.energy!.maintenance).toBe(e.tee);
      expect([set.energy!.low, set.energy!.high]).toEqual(e.range68);
      expect(set.energy!.target).toBe(e.target);
      expect(set.energy!.delta).toBe(e.delta);
      expect(set.energy!.crossCheck.mifflinPal).toBe(e.mifflin_x_pal);
      expect(target(set, 'protein').value).toBe(e.protein_g);
      expect(target(set, 'fat').value).toBe(e.fat_g);
      expect(target(set, 'carbs').value).toBe(e.carbs_g);
      expect(target(set, 'fiber').value).toBe(e.fibre_g);
      expect(target(set, 'sodium').value).toBe(e.sodium_limit_mg);
      expect(target(set, 'potassium').value).toBe(e.potassium_mg);
      for (const [py, ts] of MICRO_ORDER) {
        const micro = e.micros[py]!;
        expect(target(set, ts).value).toBe(micro.value);
        expect(target(set, ts).refType).toBe(micro.type);
      }
      expect(set.warnings.map((w) => w.id).filter((w) => w !== 'estimates_disagree').sort()).toEqual(pyWarnings(e.warnings));
    });
  }

  it('matches the hand-checked numbers in the plan table (Asha, Meena, Hari)', () => {
    const by = Object.fromEntries(personas.personas.map((p) => [p.input.name, compute(p.input as FixtureInput)]));
    // Asha: maintenance 2,150 (1,910 to 2,390), protein 60, fat 72, carbohydrate 316, fibre 30.
    const asha = by.Asha!;
    expect([asha.energy!.maintenance, asha.energy!.low, asha.energy!.high, asha.energy!.target]).toEqual([2150, 1910, 2390, 2150]);
    expect([target(asha, 'protein').value, target(asha, 'fat').value, target(asha, 'carbs').value, target(asha, 'fiber').value]).toEqual([60, 72, 316, 30]);
    // Meena: loses at a standard pace, -290 kcal to 1,670; protein counted on the weight at BMI 30.
    const meena = by.Meena!;
    expect([meena.energy!.maintenance, meena.energy!.delta, meena.energy!.target]).toEqual([1960, -290, 1670]);
    expect(target(meena, 'protein').value).toBe(101);
    // Hari, a vegan 68-year-old man: iron 8 x 1.8 = 14.4 mg.
    expect(target(by.Hari!, 'iron').value).toBe(14.4);
    // Kamala, 72: vitamin D 20 mcg and calcium 1,200 mg.
    expect([target(by.Kamala!, 'vitaminD').value, target(by.Kamala!, 'calcium').value]).toEqual([20, 1200]);
    // Small: the calorie floor holds 1,200 and shortens the deficit.
    expect(by.Small!.energy!.floorApplied).toBe(true);
    expect(by.Small!.energy!.target).toBe(1200);
    expect(by.Small!.energy!.crossCheck.disagree).toBe(true);
  });
});

describe('the Indian reference set (ICMR-NIN 2020, Phase 6): personas computed by the reference', () => {
  for (const { input, expected } of icmrPersonas) {
    const e = expected as unknown as Expected;
    it(`${input.name}: ${e.mode}`, () => {
      const set = compute(input as FixtureInput);
      expect(set.mode).toBe(e.mode);
      expect(set.referenceSet).toBe(input.referenceSet);
      expect(set.inputs!.goalApplied).toBe(e.goal_applied);
      expect(set.energy!.target).toBe(e.target);
      expect(target(set, 'protein').value).toBe(e.protein_g);
      expect(target(set, 'fat').value).toBe(e.fat_g);
      expect(target(set, 'carbs').value).toBe(e.carbs_g);
      expect(target(set, 'fiber').value).toBe(e.fibre_g);
      expect(target(set, 'sodium').value).toBe(e.sodium_limit_mg);
      expect(target(set, 'potassium').value).toBe(e.potassium_mg);
      for (const [py, ts] of MICRO_ORDER) {
        const micro = e.micros[py]!;
        expect(target(set, ts).value, ts).toBe(micro.value);
        expect(target(set, ts).refType, ts).toBe(micro.type);
      }
      expect(set.warnings.map((w) => w.id).filter((w) => w !== 'estimates_disagree').sort()).toEqual(pyWarnings(e.warnings));
    });
  }

  it('matches the reference at the edges of its two bands (18 | 19, 59 | 60), for both sexes and the average', () => {
    const KEYS = Object.fromEntries(MICRO_ORDER);
    for (const b of icmrBands) {
      const r = icmrReference(KEYS[b.nutrient]!, b.sex as 'female' | 'male' | 'average', icmrBandOf(b.age));
      // The reference gives the value the engine targets: the average requirement for iron and zinc, the allowance for the rest.
      const asTarget = b.nutrient === 'iron' || b.nutrient === 'zinc' ? r.ear! : r.value;
      expect(asTarget, `${b.nutrient} ${b.sex} ${b.age}`).toBe(b.value);
    }
  });

  it('puts each age in exactly one band: under 60 and 60 and over', () => {
    const seen = new Set<string>();
    for (let age = 19; age <= 100; age++) seen.add(icmrBandOf(age));
    expect([...seen]).toEqual(['19-59', '60+']);
    expect([icmrBandOf(59), icmrBandOf(60)]).toEqual(['19-59', '60+']);
  });
});

describe('400 random profiles: the Worker agrees with the reference on inputs nobody picked', () => {
  it('agrees on mode, goal, energy, macros, fibre, sodium, potassium and every vitamin and mineral', () => {
    let personalised = 0;
    for (const { input, expected: e } of randomTargets) {
      const set = compute(input as FixtureInput);
      const label = JSON.stringify(input);
      expect(set.mode, label).toBe(e.mode);
      if (e.mode === 'reference_only') continue;
      personalised++;
      expect(set.inputs!.goalApplied, label).toBe(e.goal_applied);
      expect(set.energy!.maintenance, label).toBe(e.tee);
      expect([set.energy!.low, set.energy!.high], label).toEqual(e.range68);
      expect(set.energy!.target, label).toBe(e.target);
      expect(set.energy!.delta, label).toBe(e.delta);
      expect(set.energy!.crossCheck.mifflinPal, label).toBe(e.mifflin_x_pal);
      expect(target(set, 'protein').value, label).toBe(e.protein_g);
      expect(target(set, 'fat').value, label).toBe(e.fat_g);
      expect(target(set, 'carbs').value, label).toBe(e.carbs_g);
      expect(target(set, 'fiber').value, label).toBe(e.fibre_g);
      expect(target(set, 'sodium').value, label).toBe(e.sodium_limit_mg);
      expect(target(set, 'potassium').value, label).toBe(e.potassium_mg);
      MICRO_ORDER.forEach(([, ts], k) => expect(target(set, ts).value, `${label} ${ts}`).toBe((e.micros as number[])[k]));
      expect(set.warnings.map((w) => w.id).filter((w) => w !== 'estimates_disagree').sort(), label).toEqual(pyWarnings(e.warnings));
    }
    // The sample must actually exercise the personalised path, the gates and the goals.
    expect(personalised).toBeGreaterThan(150);
    expect(randomTargets.some((r) => r.expected.mode === 'reference_only')).toBe(true);
  });
});

describe('the age-band edges of every reference table (18 | 19, 30 | 31, 50 | 51, 70 | 71)', () => {
  const KEYS = Object.fromEntries(MICRO_ORDER);
  it('matches the reference for both sexes and the average at every edge', () => {
    for (const b of bands) {
      if (b.nutrient === 'potassium' || !(b.nutrient in KEYS)) continue;
      const r = microReference(KEYS[b.nutrient]!, b.sex as 'female' | 'male' | 'average', ageBandOf(b.age));
      expect(r.value, `${b.nutrient} ${b.sex} ${b.age}`).toBe(b.value);
      expect(r.type).toBe(b.type);
    }
  });

  it('puts each age in exactly one band from 19 to 100', () => {
    const seen = new Set<string>();
    for (let age = 19; age <= 100; age++) seen.add(ageBandOf(age));
    expect([...seen]).toEqual(['19-30', '31-50', '51-70', '>70']);
    expect([ageBandOf(30), ageBandOf(31), ageBandOf(50), ageBandOf(51), ageBandOf(70), ageBandOf(71)]).toEqual(['19-30', '31-50', '31-50', '51-70', '51-70', '>70']);
  });
});

describe('weight projections of plan 4.9 (not the 3,500-kcal rule)', () => {
  for (const row of projection) {
    it(`${row.persona}, ${row.label}`, () => {
      const p = projectWeightChange(row.deficit, row.days);
      expect(Math.round(p.lowKg * 10) / 10).toBe(row.lowKg);
      expect(Math.round(p.highKg * 10) / 10).toBe(row.highKg);
      expect(Math.round(((row.deficit * row.days) / 7700) * 10) / 10).toBe(row.staticKg);
    });
  }

  it('the static first-weeks rate is deficit x 7 / 7,700 kg a week', () => {
    expect(staticWeeklyKg(294)).toBeCloseTo(0.267, 3);
  });
});
