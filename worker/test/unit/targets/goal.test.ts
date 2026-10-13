/** Floors, caps and paces (WEEKLY_BREAKDOWN_PLAN.md 4.3, gate G10) and the macro plan (4.4). */
import { describe, expect, it } from 'vitest';
import { CALORIE_FLOOR, CALORIE_WALL, DEFICIT_CAP_KCAL, DEFICIT_CAP_SHARE, KCAL_PER_KG_STATIC, MAX_WEEKLY_LOSS_KG, MAX_WEEKLY_LOSS_SHARE, MIN_USEFUL_DEFICIT, adjustForGoal } from '../../../src/domain/targets/goal';
import { planMacros } from '../../../src/domain/targets/macros';
import { computeTargets } from '../../../src/domain/targets/engine';
import { PACES, type Pace } from '../../../src/domain/targets/types';
import { TODAY, profile, target } from './helpers';

const adjust = (over: Partial<Parameters<typeof adjustForGoal>[0]> = {}) =>
  adjustForGoal({ goalApplied: 'lose', pace: 'standard', sex: 'female', weightKg: 75, bmi: 31, tee: 2000, ...over });

describe('loss', () => {
  it('takes a share of maintenance by pace, within a minimum and maximum', () => {
    expect(adjust({ pace: 'gentle', tee: 2000 }).delta).toBe(-200); // 10% = 200, within 200-300
    expect(adjust({ pace: 'standard', tee: 2000 }).delta).toBe(-300); // 15% = 300
    expect(adjust({ pace: 'faster', tee: 2000 }).delta).toBe(-400); // 20% = 400
    expect(adjust({ pace: 'faster', tee: 3500 }).delta).toBe(-600); // capped at 600 for the pace
    expect(adjust({ pace: 'standard', tee: 3500 }).delta).toBe(-500);
    expect(adjust({ pace: 'gentle', tee: 3500 }).delta).toBe(-300);
  });

  it('never takes the target under the floor, and shortens the deficit instead', () => {
    const r = adjust({ pace: 'faster', tee: 1470, sex: 'female', weightKg: 48 });
    expect(r.target).toBe(1200);
    expect(r.floorApplied).toBe(true);
    expect(r.warnings.map((w) => w.id)).toEqual(['floor_limited_deficit']);
    expect(Math.abs(r.delta)).toBeLessThan(0.2 * 1470);
    expect(adjust({ tee: 1700, sex: 'male', pace: 'standard' }).target).toBeGreaterThanOrEqual(1500);
    expect(CALORIE_FLOOR).toEqual({ female: 1200, male: 1500, average: 1350 });
    expect(CALORIE_WALL).toBe(800);
  });

  it('is not a loss when there is under 150 kcal of room: Maintain applies, with the reason', () => {
    const r = adjust({ tee: 1290, sex: 'female' });
    expect(r.goalApplied).toBe('maintain');
    expect(r.delta).toBe(0);
    expect(r.warnings.map((w) => w.id)).toEqual(['deficit_too_small']);
    expect(r.target).toBe(1290);
    expect(MIN_USEFUL_DEFICIT).toBe(150);
  });

  it('never exceeds 25% of maintenance, 750 kcal, or a first-weeks rate of 1% of body weight or 1 kg a week', () => {
    // A light person: 1% of 60 kg is 0.6 kg a week, about 660 kcal a day; the pace cap is lower, so the pace wins here.
    const light = adjust({ pace: 'faster', tee: 3000, weightKg: 60 });
    expect(Math.abs(light.delta)).toBeLessThanOrEqual(600);
    // A very light person: 1% of 25 kg is 0.25 kg a week = 275 kcal a day, which binds below the 600 pace cap.
    const tiny = adjust({ pace: 'faster', tee: 3000, weightKg: 25 });
    expect(Math.abs(tiny.delta)).toBeLessThanOrEqual(Math.round((MAX_WEEKLY_LOSS_SHARE * 25 * KCAL_PER_KG_STATIC) / 7 / 10) * 10);
    expect(DEFICIT_CAP_SHARE).toBe(0.25);
    expect(DEFICIT_CAP_KCAL).toBe(750);
    expect(MAX_WEEKLY_LOSS_KG).toBe(1);
  });
});

describe('gain and build muscle', () => {
  it('adds 15% within 250-500 kcal, never more than 20%', () => {
    expect(adjust({ goalApplied: 'gain', tee: 2000 }).delta).toBe(300);
    expect(adjust({ goalApplied: 'gain', tee: 1000 }).delta).toBe(200); // min 250 but capped at 20% of 1000
    expect(adjust({ goalApplied: 'gain', tee: 4000 }).delta).toBe(500);
  });

  it('builds muscle on a small surplus that shrinks with BMI, and none at BMI 30 or more', () => {
    expect(adjust({ goalApplied: 'build_muscle', bmi: 22, tee: 2800 }).delta).toBe(280);
    expect(adjust({ goalApplied: 'build_muscle', bmi: 27, tee: 2800 }).delta).toBe(140);
    expect(adjust({ goalApplied: 'build_muscle', bmi: 31, tee: 2800 }).delta).toBe(0);
  });

  it('keeps Eat well and Maintain at maintenance', () => {
    expect(adjust({ goalApplied: 'general_health' }).delta).toBe(0);
    expect(adjust({ goalApplied: 'maintain' }).target).toBe(2000);
  });
});

describe('G10: every pace respects the floor, the wall and the caps for every persona', () => {
  const people = [
    { sex: 'female', age: 30, h: 160, w: 90 },
    { sex: 'female', age: 55, h: 155, w: 75 },
    { sex: 'male', age: 45, h: 170, w: 95 },
    { sex: 'male', age: 62, h: 175, w: 120 },
    { sex: 'average', age: 40, h: 165, w: 80 },
    { sex: 'female', age: 64, h: 135, w: 48 },
  ] as const;
  for (const p of people) {
    for (const pace of PACES as readonly Pace[]) {
      it(`${p.sex} ${p.age}, ${p.w} kg, ${pace}`, () => {
        const set = computeTargets(profile({ sexForCalc: p.sex, birthYear: 2026 - p.age, heightCm: p.h, weightKg: p.w, goal: 'lose', pace }), TODAY);
        if (set.mode !== 'personalised' || set.inputs!.goalApplied !== 'lose') return; // a loss goal that was not offered
        const e = set.energy!;
        expect(e.target).toBeGreaterThanOrEqual(CALORIE_FLOOR[p.sex]);
        expect(e.target).toBeGreaterThanOrEqual(CALORIE_WALL);
        expect(-e.delta).toBeLessThanOrEqual(DEFICIT_CAP_SHARE * e.maintenance + 5);
        expect(-e.delta).toBeLessThanOrEqual(DEFICIT_CAP_KCAL + 5);
        expect((-e.delta * 7) / KCAL_PER_KG_STATIC).toBeLessThanOrEqual(Math.min(MAX_WEEKLY_LOSS_SHARE * p.w, MAX_WEEKLY_LOSS_KG) + 0.05);
        expect(-e.delta).toBeGreaterThanOrEqual(MIN_USEFUL_DEFICIT - 5);
      });
    }
  }
});

describe('the range a calorie target is shown with', () => {
  it('moves with the goal, so a loss or gain target is never outside its own range, and a loss range never dips under the floor', () => {
    for (const goal of ['general_health', 'maintain', 'lose', 'gain', 'build_muscle'] as const) {
      for (const [sex, weightKg, heightCm] of [['female', 95, 150], ['male', 85, 172], ['female', 45, 160], ['average', 75, 165]] as const) {
        const set = computeTargets(profile({ goal, sexForCalc: sex, weightKg, heightCm }), TODAY);
        if (set.mode !== 'personalised') continue;
        const cal = target(set, 'calories');
        const label = `${goal} ${sex} ${weightKg} kg`;
        expect(cal.low! <= cal.value && cal.value <= cal.high!, label).toBe(true);
        // The steady-weight range is still the estimate's own, around maintenance.
        expect(set.energy!.low < set.energy!.maintenance && set.energy!.maintenance < set.energy!.high, label).toBe(true);
        if (cal.value < set.energy!.maintenance) expect(cal.low!, label).toBeGreaterThanOrEqual(Math.min(cal.value, CALORIE_FLOOR[sex]));
        else expect(cal.high! - cal.value, label).toBe(set.energy!.high - set.energy!.maintenance);
      }
    }
  });
});

describe('macronutrients (4.4)', () => {
  it('derives protein per kg by goal, clamped to the allowed range, and keeps the macro energy at the target', () => {
    const run = (goal: Parameters<typeof planMacros>[0]['goal'], energy = 2150, w = 60, age = 30) => planMacros({ energy, referenceWeightKg: w, goal, age });
    expect([run('general_health').proteinG, run('lose').proteinG, run('gain').proteinG, run('build_muscle').proteinG]).toEqual([60, 84, 72, 96]);
    expect(run('general_health', 2150, 60, 70).proteinG).toBe(72); // 65 and over: at least 1.2 g/kg
    expect(run('general_health', 2150, 60, 70).gPerKg).toBe(1.2);
    // Fibre by energy, with a floor.
    expect(run('general_health', 2150).fibreG).toBe(30);
    expect(run('general_health', 1200).fibreG).toBe(25);
  });

  it('holds carbohydrate at the 130 g floor and then fat at 20% of energy, taking protein down toward its lower bound', () => {
    const m = planMacros({ energy: 1200, referenceWeightKg: 100, goal: 'build_muscle', age: 30 });
    expect(m.carbsG).toBe(130);
    expect(m.notes).toContain('carb_floor');
    expect(m.fatG * 9).toBeGreaterThanOrEqual(0.2 * 1200 - 5);
    // The energy of the three macros reconciles with the target within rounding.
    expect(Math.abs(4 * m.proteinG + 9 * m.fatG + 4 * m.carbsG - 1200)).toBeLessThanOrEqual(12);
  });

  it('gives total sugars no target: no authority limits them', () => {
    expect(computeTargets(profile(), TODAY).targets.find((t) => t.nutrient === 'sugar')).toBeUndefined();
  });

  it('counts protein on the weight at BMI 30 for a person above it', () => {
    const set = computeTargets(profile({ heightCm: 155, weightKg: 75, goal: 'lose' }), TODAY);
    expect(target(set, 'protein').value).toBe(101); // 1.4 x (30 x 1.55^2 = 72.1 kg)
    expect(target(set, 'protein').how).toMatch(/BMI of 30/);
  });
});
