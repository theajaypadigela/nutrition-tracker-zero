/**
 * Invariants over a grid of inputs (WEEKLY_BREAKDOWN_PLAN.md 11.2). The plan's reference sweep ran 1,199,520
 * inputs (age 19-100 step 3, height 140-200 step 10, weight 35-200 step 5, three sexes, four activity levels,
 * five goals, three paces) with no failures; this is a thinned grid that keeps every band edge and runs in a
 * second or two. The grid is the same shape, so a regression in any rule shows here.
 */
import { describe, expect, it } from 'vitest';
import { maintenanceEstimate, rawEer } from '../../../src/domain/targets/energy';
import { computeTargets } from '../../../src/domain/targets/engine';
import { potassiumAi } from '../../../src/domain/targets/macros';
import { referenceBandOf } from '../../../src/domain/reference/icmr';
import { CALORIE_FLOOR, CALORIE_WALL, DEFICIT_CAP_KCAL, DEFICIT_CAP_SHARE, KCAL_PER_KG_STATIC, MAX_WEEKLY_LOSS_KG, MAX_WEEKLY_LOSS_SHARE } from '../../../src/domain/targets/goal';
import { ACTIVITY_LEVELS, GOALS, PACES, REFERENCE_SETS, SEXES_FOR_CALC, type Target } from '../../../src/domain/targets/types';
import { ACTIVITY_ORDER } from '../../../src/domain/reference/nasem';
import { SOURCES } from '../../../src/domain/reference/sources';
import { TODAY, profile } from './helpers';

// Every reference band edge (the National Academies' 30 | 31, 50 | 51, 70 | 71; ICMR-NIN's 59 | 60) and both ends of the age range.
const AGES = [19, 30, 31, 50, 51, 59, 60, 70, 71, 100];
const HEIGHTS = [140, 160, 200];
const WEIGHTS = [35, 50, 65, 80, 100, 130, 200];

const finite = (t: Target) => [t.value, t.low, t.high, t.upperLevel].every((x) => x === undefined || (Number.isFinite(x) && x >= 0));

describe.each(REFERENCE_SETS)('invariants over the grid (%s)', (referenceSet) => {
  const indian = referenceSet === 'icmr_nin';
  // The allowance protein is never planned below: 0.8 g per kg in the United States, 0.83 in India.
  const proteinRda = indian ? 0.83 : 0.8;

  it('holds for every input', () => {
    // Plain checks that record a violation, not `expect` per check: the grid has tens of thousands of inputs.
    const violations: string[] = [];
    let personalised = 0;
    let total = 0;
    for (const age of AGES)
      for (const heightCm of HEIGHTS)
        for (const weightKg of WEIGHTS)
          for (const sexForCalc of SEXES_FOR_CALC)
            for (const activity of ACTIVITY_LEVELS)
              for (const goal of GOALS)
                for (const pace of PACES) {
                  total++;
                  const p = profile({ birthYear: 2026 - age, heightCm, weightKg, sexForCalc, activity, goal, pace, referenceSet });
                  const set = computeTargets(p, TODAY);
                  const label = `${referenceSet} ${sexForCalc} ${age}y ${heightCm}cm ${weightKg}kg ${activity} ${goal} ${pace}`;
                  const check = (ok: boolean, what: string) => {
                    if (!ok && violations.length < 20) violations.push(`${label}: ${what}`);
                  };
                  const bmi = weightKg / (heightCm / 100) ** 2;

                  // Nothing outside the eligibility rules is ever personalised.
                  if (bmi < 16 || bmi > 60) {
                    check(set.mode === 'reference_only', 'out-of-range BMI must be reference-only');
                    continue;
                  }
                  check(set.mode === 'personalised', 'an eligible profile must be personalised');
                  personalised++;

                  // No NaN, no infinity, no negative.
                  for (const t of set.targets) check(finite(t), `${t.nutrient} is not finite and non-negative`);
                  const e = set.energy!;
                  check(Number.isFinite(e.target) && e.target > 0, 'energy target');

                  // Loss: never under the floor or the wall; never more than 25% or 750 kcal below maintenance;
                  // never a first-weeks rate above 1% of body weight or 1 kg a week. (Maintenance and the target are
                  // each rounded to 10 kcal, hence the small tolerances.)
                  const applied = set.inputs!.goalApplied;
                  if (applied === 'lose') {
                    check(e.target >= CALORIE_FLOOR[sexForCalc], 'under the floor');
                    check(e.target >= CALORIE_WALL, 'under the 800 kcal wall');
                    check(-e.delta <= DEFICIT_CAP_SHARE * e.maintenance + 6, 'deficit over 25%');
                    check(-e.delta <= DEFICIT_CAP_KCAL, 'deficit over 750');
                    check((-e.delta * 7) / KCAL_PER_KG_STATIC <= Math.min(MAX_WEEKLY_LOSS_SHARE * weightKg, MAX_WEEKLY_LOSS_KG) + 0.05, 'first-weeks rate too fast');
                  }
                  // Gain: never below maintenance, never more than 20% above.
                  if (applied === 'gain') {
                    check(e.target >= e.maintenance, 'a gain target under maintenance');
                    check(e.target <= e.maintenance * 1.2 + 11, 'a gain target over +20%');
                  }
                  // Maintain and Eat well equal maintenance.
                  if (applied === 'maintain' || applied === 'general_health') check(e.target === e.maintenance, 'Maintain differs from maintenance');

                  // Macros: the energy of the three reconciles with the target within rounding; carbohydrate has its floor;
                  // fat stays inside 20-35% of energy; protein per kg of reference weight stays in 0.8-2.0.
                  const get = (k: string) => set.targets.find((t) => t.nutrient === k)!.value;
                  check(Math.abs(4 * get('protein') + 9 * get('fat') + 4 * get('carbs') - e.target) <= 12, 'macro energy does not reconcile');
                  check(get('carbs') >= 130, 'carbohydrate under 130 g');
                  check((9 * get('fat')) / e.target >= 0.2 - 0.01 && (9 * get('fat')) / e.target <= 0.35 + 0.01, 'fat share outside 20-35%');
                  const wref = bmi <= 30 ? weightKg : 30 * (heightCm / 100) ** 2;
                  check(get('protein') / wref >= proteinRda - 0.01 && get('protein') / wref <= 2.0 + 0.01, `protein per kg outside ${proteinRda}-2.0`);
                  check(get('fiber') >= 25, 'fibre under 25 g');

                  // Every target explains itself and points at a source in the registry.
                  for (const t of set.targets) check(t.how.length > 10 && t.basis in SOURCES, `${t.nutrient} lacks a reason or a source`);

                  // The set's own rules: its band, its limits, and which minerals are judged against the Estimated Average Requirement.
                  const t = (k: string) => set.targets.find((x) => x.nutrient === k)!;
                  check(set.inputs!.ageBand === referenceBandOf(referenceSet, age), 'wrong reference band');
                  check(t('sodium').value === (indian ? 2000 : 2300), 'sodium limit');
                  check(t('potassium').value === (indian ? 3500 : potassiumAi(sexForCalc)), 'potassium target');
                  for (const k of ['iron', 'zinc', 'vitaminB12'] as const) check(t(k).refType === (indian ? 'EAR' : 'RDA'), `${k} is judged against the wrong reference type`);
                  check(set.warnings.every((w) => !(indian && w.id === 'iron_plant_based')), 'the plant-based iron warning belongs to the National Academies set');
                  check(set.targets.every((x) => !indian || x.basis !== 'nasem-amdr'), 'an Indian target cites the US ranges');
                }
    expect(violations).toEqual([]);
    expect(total).toBe(AGES.length * HEIGHTS.length * WEIGHTS.length * 3 * 4 * 5 * 3);
    expect(personalised).toBeGreaterThan(total / 2);
  }, 30_000);

  it('is deterministic, and its output survives JSON unchanged', () => {
    const p = profile({ birthYear: 1971, heightCm: 168, weightKg: 82, goal: 'lose', pace: 'faster', referenceSet });
    const a = computeTargets(p, TODAY);
    expect(computeTargets(p, TODAY)).toEqual(a);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });
});

// The energy estimate is the National Academies' on both sets, so these run once.
describe('the energy estimate over the grid', () => {
  it('energy never falls as weight rises, holding everything else fixed', () => {
    for (const age of AGES)
      for (const sex of ['female', 'male', 'average'] as const)
        for (const activity of ACTIVITY_ORDER)
          for (const height of HEIGHTS) {
            let previous = -Infinity;
            for (const weight of WEIGHTS) {
              const v = maintenanceEstimate(sex, age, height, weight, activity);
              expect(v, `${sex} ${age} ${height} ${weight} ${activity}`).toBeGreaterThanOrEqual(previous);
              previous = v;
            }
          }
  });

  it('a higher activity category never lowers the estimate, and the raw published equations break this', () => {
    let rawViolations = 0;
    for (const age of AGES)
      for (const height of [140, 150, 160, 170, 180, 190, 200])
        for (const weight of [35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 100, 120, 150, 200])
          for (const sex of ['female', 'male'] as const) {
            for (let k = 1; k < ACTIVITY_ORDER.length; k++) {
              const lower = ACTIVITY_ORDER[k - 1]!;
              const higher = ACTIVITY_ORDER[k]!;
              if (rawEer(sex, age, height, weight, higher) < rawEer(sex, age, height, weight, lower)) rawViolations++;
              expect(maintenanceEstimate(sex, age, height, weight, higher), `${sex} ${age} ${height} ${weight} ${higher}`).toBeGreaterThanOrEqual(
                maintenanceEstimate(sex, age, height, weight, lower),
              );
            }
          }
    // The plan found 336 raw failures in its grid (men, active to very active, short and light). The test must fail if the guard is removed.
    expect(rawViolations).toBeGreaterThan(0);
  });
});
