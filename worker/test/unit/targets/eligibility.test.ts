/**
 * One test per row of the gate matrix in WEEKLY_BREAKDOWN_PLAN.md 8.1 (11.4): each asserts the mode, the warning
 * ids and the absence of a personalised target. Safety lives in these gates, not in disclaimers.
 */
import { describe, expect, it } from 'vitest';
import { computeTargets } from '../../../src/domain/targets/engine';
import { bmiOf } from '../../../src/domain/targets/profile';
import { NO_SAFETY_FLAGS, type HealthProfileInput, type SafetyAnswers } from '../../../src/domain/targets/types';
import { TODAY, profile, target } from './helpers';

const H = 170;
/** A weight at exactly this BMI for a 170 cm person, nudged so float noise cannot put it a hair under. */
function weightAt(bmi: number, heightCm = H): number {
  let w = bmi * (heightCm / 100) ** 2;
  while (bmiOf(w, heightCm) < bmi) w += 1e-9;
  return w;
}
const at = (bmi: number, over: Partial<HealthProfileInput> = {}) => profile({ heightCm: H, weightKg: weightAt(bmi), ...over });
const ids = (set: ReturnType<typeof computeTargets>) => set.warnings.map((w) => w.id);
const safety = (over: Partial<SafetyAnswers>): SafetyAnswers => ({ ...NO_SAFETY_FLAGS, ...over });

describe('G1: under 19', () => {
  it('is reference-only the day before the 19th birthday and personalised on it', () => {
    // Birth month known: October 2007 is 19 on 12 Oct 2026; November 2007 is still 18.
    const nineteen = computeTargets(profile({ birthYear: 2007, birthMonth: 10 }), TODAY);
    const eighteen = computeTargets(profile({ birthYear: 2007, birthMonth: 11 }), TODAY);
    expect(nineteen.mode).toBe('personalised');
    expect(eighteen.mode).toBe('reference_only');
    expect(ids(eighteen)).toEqual(['reference_only', 'under_19']);
  });

  it('assumes a July birthday when there is no month', () => {
    expect(computeTargets(profile({ birthYear: 2007, birthMonth: null }), '2026-06-30').mode).toBe('reference_only');
    expect(computeTargets(profile({ birthYear: 2007, birthMonth: null }), '2026-07-01').mode).toBe('personalised');
  });

  it('stores nothing about the body: no inputs, no energy, no targets', () => {
    const set = computeTargets(profile({ birthYear: 2010 }), TODAY);
    expect(set.mode).toBe('reference_only');
    expect([set.inputs, set.energy, set.targets, set.availableGoals]).toEqual([null, null, [], []]);
    expect(JSON.stringify(set)).not.toMatch(/heightCm|weightKg|birthYear|bmi/);
  });
});

describe('G2 to G4: the safety check', () => {
  const answers: [string, Partial<SafetyAnswers>][] = [
    ['pregnant or breastfeeding', { pregnantOrBreastfeeding: true }],
    ['an eating-disorder history', { eatingDisorder: true }],
    ['a diet or calorie target from a doctor or dietitian', { clinicianDiet: true }],
  ];
  for (const [label, flags] of answers) {
    it(`${label} puts the profile in reference-only mode with no targets`, () => {
      const set = computeTargets(profile(), TODAY, { safety: safety(flags) });
      expect(set.mode).toBe('reference_only');
      expect(set.targets).toEqual([]);
      expect(ids(set)).toEqual(['reference_only']);
    });

    it(`${label}: nothing in the result records WHICH answer it was`, () => {
      const json = JSON.stringify(computeTargets(profile(), TODAY, { safety: safety(flags) }));
      expect(json).not.toMatch(/pregnan|breastfeed|eating|disorder|clinician|doctor|dietitian/i);
    });
  }

  it('"none of these", absent, and "I would rather not say" all behave the same (Q8)', () => {
    const none = computeTargets(profile(), TODAY, { safety: NO_SAFETY_FLAGS });
    const absent = computeTargets(profile(), TODAY);
    expect(none.mode).toBe('personalised');
    expect(absent).toEqual(none);
  });

  it('turns low-pressure mode on by default after an eating-disorder answer, and only then', async () => {
    const { entryGate } = await import('../../../src/domain/targets/eligibility');
    expect(entryGate({ age: 30, bmi: 22, safety: safety({ eatingDisorder: true }) }).numbersHiddenByDefault).toBe(true);
    expect(entryGate({ age: 30, bmi: 22, safety: safety({ pregnantOrBreastfeeding: true }) }).numbersHiddenByDefault).toBe(false);
    expect(entryGate({ age: 30, bmi: 22, safety: NO_SAFETY_FLAGS }).numbersHiddenByDefault).toBe(false);
  });
});

describe('G5: BMI under 16 or over 60 is reference-only; nothing is stored', () => {
  it('draws the line at 15.9 | 16.0 and 60.0 | 60.1', () => {
    expect(computeTargets(at(15.9), TODAY).mode).toBe('reference_only');
    expect(computeTargets(at(16.0), TODAY).mode).toBe('personalised');
    expect(computeTargets(at(60.0), TODAY).mode).toBe('personalised');
    expect(computeTargets(at(60.1), TODAY).mode).toBe('reference_only');
    expect(ids(computeTargets(at(15.9), TODAY))).toEqual(['reference_only', 'bmi_out_of_range']);
    expect(computeTargets(at(60.1), TODAY).inputs).toBeNull();
  });
});

describe('G6: BMI 16 to under 18.5', () => {
  it('refuses a loss goal, says a clinician can help, and still offers gain', () => {
    for (const bmi of [16.0, 17.5, 18.4]) {
      const set = computeTargets(at(bmi, { goal: 'lose' }), TODAY);
      expect(set.mode).toBe('personalised');
      expect(set.inputs!.goalApplied).toBe('maintain');
      expect(ids(set)).toContain('lose_not_indicated_bmi');
      expect(ids(set)).toContain('underweight_notice');
      expect(set.availableGoals).toContain('gain');
      expect(set.availableGoals).not.toContain('lose');
    }
    const edge = computeTargets(at(18.5, { goal: 'lose' }), TODAY);
    expect(ids(edge)).not.toContain('underweight_notice');
  });
});

describe('G7: a loss goal needs BMI 25 (23 on the Indian set)', () => {
  it('is refused at 24.9 and offered at 25.0 on the international set', () => {
    expect(computeTargets(at(24.9, { goal: 'lose' }), TODAY).inputs!.goalApplied).toBe('maintain');
    expect(computeTargets(at(25.0, { goal: 'lose' }), TODAY).inputs!.goalApplied).toBe('lose');
  });

  it('is refused at 22.9 and offered at 23.0 on the Indian set', () => {
    expect(computeTargets(at(22.9, { goal: 'lose', referenceSet: 'icmr_nin' }), TODAY).inputs!.goalApplied).toBe('maintain');
    expect(computeTargets(at(23.0, { goal: 'lose', referenceSet: 'icmr_nin' }), TODAY).inputs!.goalApplied).toBe('lose');
  });

  it('applies Maintain with the reason, and lists the goals that ARE available', () => {
    const set = computeTargets(at(22, { goal: 'lose' }), TODAY);
    expect(set.inputs!.goalApplied).toBe('maintain');
    expect(set.inputs!.goal).toBe('lose');
    expect(ids(set)).toContain('lose_not_indicated_bmi');
    expect(set.availableGoals).toEqual(['general_health', 'maintain', 'gain', 'build_muscle']);
    expect(set.energy!.target).toBe(set.energy!.maintenance);
  });
});

describe('G8: older adults', () => {
  const birth = (age: number) => 2026 - age;
  it('does not offer loss from 80, whatever the BMI', () => {
    const set = computeTargets(at(35, { goal: 'lose', birthYear: birth(80) }), TODAY);
    expect(set.inputs!.goalApplied).toBe('maintain');
    expect(ids(set)).toContain('lose_needs_clinician_80plus');
    expect(computeTargets(at(35, { goal: 'lose', birthYear: birth(79) }), TODAY).inputs!.goalApplied).toBe('lose');
  });

  it('offers loss from 65 only with BMI in the obesity range (30; 27.5 on the Indian set)', () => {
    expect(computeTargets(at(29.9, { goal: 'lose', birthYear: birth(65) }), TODAY).inputs!.goalApplied).toBe('maintain');
    expect(ids(computeTargets(at(29.9, { goal: 'lose', birthYear: birth(65) }), TODAY))).toContain('lose_65plus_needs_obesity');
    expect(computeTargets(at(30.0, { goal: 'lose', birthYear: birth(65) }), TODAY).inputs!.goalApplied).toBe('lose');
    expect(computeTargets(at(26.0, { goal: 'lose', birthYear: birth(64) }), TODAY).inputs!.goalApplied).toBe('lose');
    expect(computeTargets(at(27.4, { goal: 'lose', birthYear: birth(65), referenceSet: 'icmr_nin' }), TODAY).inputs!.goalApplied).toBe('maintain');
    expect(computeTargets(at(27.5, { goal: 'lose', birthYear: birth(65), referenceSet: 'icmr_nin' }), TODAY).inputs!.goalApplied).toBe('lose');
  });
});

describe('G9: a gain goal is not offered in the overweight range', () => {
  it('is offered at 24.9 and refused at 25.0 (22.9 and 23.0 on the Indian set)', () => {
    expect(computeTargets(at(24.9, { goal: 'gain' }), TODAY).inputs!.goalApplied).toBe('gain');
    const refused = computeTargets(at(25.0, { goal: 'gain' }), TODAY);
    expect(refused.inputs!.goalApplied).toBe('maintain');
    expect(ids(refused)).toContain('gain_not_indicated_bmi');
    expect(computeTargets(at(22.9, { goal: 'gain', referenceSet: 'icmr_nin' }), TODAY).inputs!.goalApplied).toBe('gain');
    expect(computeTargets(at(23.0, { goal: 'gain', referenceSet: 'icmr_nin' }), TODAY).inputs!.goalApplied).toBe('maintain');
  });
});

describe('G12: a medicine that interacts with food', () => {
  it('leaves the mode alone and turns vitamin K, potassium and sodium into amounts only', () => {
    const set = computeTargets(profile(), TODAY, { safety: safety({ dietInteractingMedicine: true }) });
    expect(set.mode).toBe('personalised');
    expect(ids(set)).toContain('medicine_amounts_only');
    for (const k of ['vitaminK', 'potassium', 'sodium']) expect(target(set, k).verdicts).toBe(false);
    for (const k of ['protein', 'fiber', 'calcium', 'iron', 'vitaminC']) expect(target(set, k).verdicts).toBe(true);
  });
});
