/**
 * The Indian reference set (ICMR-NIN 2020; WEEKLY_BREAKDOWN_PLAN.md 1.6, 4.4 to 4.6, 4.10, decision Q2, Phase 6): the tables, what is different
 * from the US set, and why. The engine's numbers are also checked against the independent Python reference (engine.test.ts).
 */
import { describe, expect, it } from 'vitest';
import { SOURCES } from '../../../src/domain/reference/sources';
import {
  ICMR_BANDS,
  ICMR_EAR_TARGETS,
  ICMR_MICROS,
  ICMR_PROTEIN_RDA_G_PER_KG,
  icmrBandOf,
  icmrReference,
  referenceBandOf,
} from '../../../src/domain/reference/icmr';
import { tableHashes } from '../../../src/domain/reference/hashes';
import { MICRO_KEYS, microReference } from '../../../src/domain/reference/nasem';
import { NUTRIENTS } from '../../../src/domain/nutrients';
import { computeTargets, genericTargetSet } from '../../../src/domain/targets/engine';
import { microTarget } from '../../../src/domain/targets/micros';
import { applyOverrides } from '../../../src/domain/targets/overrides';
import type { HealthProfileInput, TargetSet } from '../../../src/domain/targets/types';

const TODAY = '2026-10-12';
const person = (over: Partial<HealthProfileInput> = {}): HealthProfileInput => ({
  birthYear: 1996,
  birthMonth: 3,
  sexForCalc: 'female',
  heightCm: 158,
  weightKg: 52,
  activity: 'low_active',
  goal: 'general_health',
  pace: 'standard',
  pattern: 'vegetarian',
  referenceSet: 'icmr_nin',
  ...over,
});
const set = (over: Partial<HealthProfileInput> = {}) => computeTargets(person(over), TODAY);
const t = (s: TargetSet, key: string) => s.targets.find((x) => x.nutrient === key)!;

describe('the tables', () => {
  it('have every vitamin and mineral the app tracks, for both sexes and both bands, with positive values', () => {
    for (const key of MICRO_KEYS) {
      const table = ICMR_MICROS[key];
      expect(table, key).toBeDefined();
      for (const row of [...table.female, ...table.male]) {
        expect(row.rda, key).toBeGreaterThan(0);
        if (row.ear !== undefined) expect(row.ear, key).toBeLessThanOrEqual(row.rda);
      }
      expect(table.female).toHaveLength(2);
    }
  });

  it('count each nutrient in the unit the catalogue does (vitamin A in retinol equivalents, folate in dietary folate)', () => {
    for (const key of MICRO_KEYS) {
      const catalogue = NUTRIENTS.find((n) => n.key === key)!.unit;
      expect(ICMR_MICROS[key].unit.replace(' RE', ''), key).toBe(catalogue);
    }
  });

  it('hold the figures the plan quotes (1.6) and the ones read from the report', () => {
    const r = (n: Parameters<typeof icmrReference>[0], s: 'female' | 'male', band: '19-59' | '60+' = '19-59') => icmrReference(n, s, band);
    // "iron 19 and 29 mg against 8 and 18; zinc 17 and 13.2 against 11 and 8"
    expect([r('iron', 'male').value, r('iron', 'female').value, r('zinc', 'male').value, r('zinc', 'female').value]).toEqual([19, 29, 17, 13.2]);
    expect([r('iron', 'male').ear, r('iron', 'female').ear, r('zinc', 'male').ear, r('zinc', 'female').ear]).toEqual([11, 15, 14.1, 11]);
    expect([r('calcium', 'male').value, r('calcium', 'female', '60+').value, r('magnesium', 'male').value, r('magnesium', 'female').value]).toEqual([1000, 1200, 440, 370]);
    expect([r('vitaminB12', 'male').value, r('vitaminB12', 'male').ear, r('folate', 'male').value, r('folate', 'female').value, r('folate', 'female', '60+').value]).toEqual([2.2, 2, 300, 220, 200]);
    expect([r('vitaminC', 'male').value, r('vitaminC', 'female').value, r('vitaminA', 'male').value, r('vitaminA', 'female').value]).toEqual([80, 65, 1000, 840]);
    // 600 IU = 15 mcg for adults, 800 IU = 20 mcg from 60; the tolerable limit of 4,000 IU = 100 mcg
    expect([r('vitaminD', 'male').value, r('vitaminD', 'male', '60+').value, r('vitaminD', 'male').upperLevel]).toEqual([15, 20, 100]);
    expect([r('vitaminK', 'male').value, r('vitaminE', 'male').value, r('potassium', 'female').value]).toEqual([55, 10, 3500]);
    expect(ICMR_PROTEIN_RDA_G_PER_KG).toBe(0.83);
    expect(Math.round(ICMR_PROTEIN_RDA_G_PER_KG * 65)).toBe(54); // the reference man
    expect(Math.round(ICMR_PROTEIN_RDA_G_PER_KG * 55)).toBe(46); // and woman
  });

  it('differ from the National Academies\' by 20% or more where the plan says they do (1.6)', () => {
    const us = (n: Parameters<typeof microReference>[0], s: 'female' | 'male') => microReference(n, s, '31-50').value;
    const india = (n: Parameters<typeof icmrReference>[0], s: 'female' | 'male') => icmrReference(n, s, '19-59').value;
    for (const [n, s] of [['iron', 'male'], ['iron', 'female'], ['zinc', 'male'], ['zinc', 'female'], ['folate', 'female'], ['vitaminE', 'male'], ['vitaminK', 'male']] as const) {
      expect(Math.abs(india(n, s) / us(n, s) - 1), `${n} ${s}`).toBeGreaterThanOrEqual(0.2);
    }
  });

  it('keep an Upper Limit only where the US set has one and it covers food: the same five nutrients', () => {
    const food = (key: (typeof MICRO_KEYS)[number]) => icmrReference(key, 'female', '19-59').upperScope === 'all_sources';
    expect(MICRO_KEYS.filter(food).sort()).toEqual(['calcium', 'iron', 'vitaminC', 'vitaminD', 'zinc']);
    expect(icmrReference('magnesium', 'female', '19-59')).toMatchObject({ upperLevel: 350, upperScope: 'supplements_only' });
    expect(icmrReference('vitaminA', 'female', '19-59')).toMatchObject({ upperLevel: 3000, upperScope: 'preformed_only' });
  });

  it('average the two sexes, value and requirement alike', () => {
    expect(icmrReference('iron', 'average', '19-59')).toMatchObject({ value: 24, ear: 13 });
    expect(icmrReference('magnesium', 'average', '60+').value).toBe(405);
  });

  it('are two bands, from 19 to 59 and from 60', () => {
    expect(ICMR_BANDS).toEqual(['19-59', '60+']);
    expect([icmrBandOf(19), icmrBandOf(59), icmrBandOf(60), icmrBandOf(100)]).toEqual(['19-59', '19-59', '60+', '60+']);
    expect([referenceBandOf('icmr_nin', 45), referenceBandOf('nasem', 45), referenceBandOf('icmr_nin', 70), referenceBandOf('nasem', 70)]).toEqual(['19-59', '31-50', '60+', '51-70']);
  });

  it('are pinned by a hash, so any edit shows up in review (plan 11.3)', () => {
    expect(tableHashes().icmr).toMatch(/^[0-9a-f]{8}$/);
  });

  it('cite sources that are registered, each with a title and a link', () => {
    for (const id of ['icmr-nin2020', 'dgi2024'] as const) {
      expect(SOURCES[id].title.length).toBeGreaterThan(10);
      expect(SOURCES[id].url).toMatch(/^https:\/\/www\.nin\.res\.in\//);
      expect(SOURCES[id].publisher).toBe('ICMR-National Institute of Nutrition');
    }
  });
});

describe('the targets on the Indian set', () => {
  it('judge iron, zinc and vitamin B12 against the Estimated Average Requirement, and say so (plan 4.10)', () => {
    const s = set();
    expect(ICMR_EAR_TARGETS.has('iron') && ICMR_EAR_TARGETS.has('zinc') && ICMR_EAR_TARGETS.has('vitaminB12')).toBe(true);
    expect(t(s, 'iron')).toMatchObject({ value: 15, refType: 'EAR', basis: 'icmr-nin2020', evidence: 'R', upperLevel: 45 });
    expect(t(s, 'zinc')).toMatchObject({ value: 11, refType: 'EAR', upperLevel: 40 });
    expect(t(s, 'vitaminB12')).toMatchObject({ value: 2, refType: 'EAR', window: 'four_weeks' });
    expect(t(s, 'iron').how).toBe(
      "Estimated Average Requirement for women aged 19 to 59 (ICMR-NIN, 2020, India). It is used instead of the Recommended Dietary Allowance (29 mg) because ICMR's own model diets do not reach the allowance for iron, zinc and vitamin B12. It is the level at which about half of people would still need more. It assumes about 8% absorption from Indian diets, so there is no extra allowance for a plant-based diet. The upper limit of 45 mg covers all sources, including supplements.",
    );
  });

  it('keep the allowance for everything else, and an adequate intake for what has no allowance', () => {
    const s = set();
    expect(t(s, 'calcium')).toMatchObject({ value: 1000, refType: 'RDA' });
    expect(t(s, 'magnesium')).toMatchObject({ value: 370, refType: 'RDA' });
    expect(t(s, 'vitaminC')).toMatchObject({ value: 65, refType: 'RDA', upperLevel: 2000 });
    expect(t(s, 'vitaminA')).toMatchObject({ value: 840, refType: 'RDA' });
    expect(t(s, 'folate')).toMatchObject({ value: 220, refType: 'RDA' });
    expect(t(s, 'vitaminK')).toMatchObject({ value: 55, refType: 'AI' });
    expect(t(s, 'vitaminE')).toMatchObject({ value: 10, refType: 'AI' });
    expect(t(s, 'potassium')).toMatchObject({ value: 3500, refType: 'AI', basis: 'icmr-nin2020' });
    expect(t(s, 'vitaminE').how).toMatch(/7\.5 to 10 mg depending on the oil used; 10 mg is used here/);
    expect(t(s, 'vitaminA').how).toMatch(/retinol equivalents \(carotenoids counted at 6 to 1\)/);
    expect(t(s, 'vitaminD').how).toMatch(/sunlight and supplements are not counted here/);
  });

  it('do not multiply iron for a plant-based diet: ICMR\'s figures already assume 8% absorption', () => {
    for (const pattern of ['omnivore', 'vegetarian', 'vegan'] as const) expect(t(set({ pattern }), 'iron').value, pattern).toBe(15);
    expect(set({ pattern: 'vegan' }).warnings.map((w) => w.id)).not.toContain('iron_plant_based');
    // ... where the US set does multiply it
    expect(t(set({ referenceSet: 'nasem', pattern: 'vegan' }), 'iron').value).toBe(32.4);
    expect(set({ referenceSet: 'nasem', pattern: 'vegan' }).warnings.map((w) => w.id)).toContain('iron_plant_based');
  });

  it('use the 60-and-over table from the 60th birthday', () => {
    const young = set({ birthYear: 1967, birthMonth: 1 }); // 59 on 12 October 2026
    const older = set({ birthYear: 1966, birthMonth: 1 }); // 60
    expect(young.inputs!.ageBand).toBe('19-59');
    expect(older.inputs!.ageBand).toBe('60+');
    expect([t(young, 'calcium').value, t(older, 'calcium').value]).toEqual([1000, 1200]);
    expect([t(young, 'vitaminD').value, t(older, 'vitaminD').value]).toEqual([15, 20]);
    expect([t(young, 'iron').value, t(older, 'iron').value]).toEqual([15, 11]); // a woman after the menopause: the requirement falls
    expect([t(young, 'folate').value, t(older, 'folate').value]).toEqual([220, 200]);
  });

  it('read the US bands for the US set, as before', () => {
    expect(set({ referenceSet: 'nasem' }).inputs!.ageBand).toBe('19-30');
    expect(set({ referenceSet: 'nasem', birthYear: 1966 }).inputs!.ageBand).toBe('51-70');
  });

  it('use ICMR\'s sodium, protein floor, fibre and fat range', () => {
    const s = set({ weightKg: 52, heightCm: 158 });
    const E = s.energy!.target;
    expect(t(s, 'sodium')).toMatchObject({ value: 2000, basis: 'icmr-nin2020', kind: 'limit' });
    expect(t(s, 'sodium').how).toBe('A safe intake of 2,000 mg a day, about 5 g of salt (ICMR-NIN, 2020; the WHO figure).');
    expect(t(s, 'fiber').value).toBe(Math.round(Math.max((15 * E) / 1000, 25)));
    expect(t(s, 'fiber').how).toBe("15 g for every 1,000 kcal of your target, and at least 25 g (about the amount in ICMR-NIN's own tables; WHO).");
    // fat: the usual range is 15% to 35% of energy on this set (20% to 35% on the US one)
    expect(t(s, 'fat').low).toBe(Math.round((0.15 * E) / 9));
    expect(t(s, 'fat').high).toBe(Math.round((0.35 * E) / 9));
    expect(t(s, 'fat').how).toBe('About 30% of your energy target. The usual range is 15% to 35% of energy (ICMR-NIN).');
    expect(t(set({ referenceSet: 'nasem' }), 'fat').low).toBe(Math.round((0.2 * set({ referenceSet: 'nasem' }).energy!.target) / 9));
    expect(t(s, 'carbs').how).toMatch(/\(ICMR-NIN\)\.$/);
  });

  it('count protein from 0.83 g per kg at the lowest, not 0.8', () => {
    // a very light person on a modest target: the clamp's lower bound is the allowance per kg
    const s = set({ weightKg: 40, heightCm: 150, birthYear: 1970, activity: 'inactive' });
    const proteinIn = t(s, 'protein');
    expect(proteinIn.value).toBeGreaterThanOrEqual(Math.round(0.83 * 40));
    expect(proteinIn.how).toMatch(/above the recommended allowance of 0\.83/);
    expect(t(set({ referenceSet: 'nasem', weightKg: 40, heightCm: 150, birthYear: 1970, activity: 'inactive' }), 'protein').how).toMatch(/above the recommended allowance of 0\.8,/);
  });

  it('limit added sugars to 5% of energy (Dietary Guidelines for Indians), and saturated fat to 10%', () => {
    const s = set();
    const E = s.energy!.target;
    expect(t(s, 'addedSugar')).toMatchObject({ value: Math.round((0.05 * E) / 4), basis: 'dgi2024', evidence: 'G', kind: 'limit' });
    expect(t(s, 'addedSugar').how).toMatch(/^At most 5% of your energy target from added sugars, about \d+ g a day \(Dietary Guidelines for Indians, 2024\)\./);
    expect(t(s, 'saturatedFat')).toMatchObject({ value: Math.round((0.1 * E) / 9), basis: 'who-saturated-fat' });
    // the US set keeps 10%, with 5% as the aspiration
    expect(t(set({ referenceSet: 'nasem' }), 'addedSugar').value).toBe(Math.round((0.1 * set({ referenceSet: 'nasem' }).energy!.target) / 4));
  });

  it('read energy the same way on both sets: the equation is the National Academies\', and the weight trend corrects it (plan 4.2)', () => {
    const a = set();
    const b = set({ referenceSet: 'nasem' });
    expect([a.energy!.maintenance, a.energy!.target, a.energy!.method]).toEqual([b.energy!.maintenance, b.energy!.target, 'nasem2023']);
  });

  it('judge a loss goal from BMI 23, and at 65 or over only above 27.5 (plan 8.1, G7, G8)', () => {
    const meera = set({ heightCm: 150, weightKg: 55, goal: 'lose' }); // BMI 24.4
    expect(meera.inputs!.goalApplied).toBe('lose');
    expect(set({ referenceSet: 'nasem', heightCm: 150, weightKg: 55, goal: 'lose' }).inputs!.goalApplied).toBe('maintain');
    const gopal = { sexForCalc: 'male' as const, heightCm: 160, weightKg: 74, goal: 'lose' as const, birthYear: 1960 };
    expect(set(gopal).inputs!.goalApplied).toBe('lose'); // BMI 28.9, 66 years
    expect(set({ ...gopal, referenceSet: 'nasem' }).inputs!.goalApplied).toBe('maintain');
  });

  it('point every target at a registered source', () => {
    for (const x of set().targets) expect(SOURCES[x.basis as keyof typeof SOURCES], `${x.nutrient}: ${x.basis}`).toBeDefined();
  });

  it('are unchanged for a person who never chose it, and for the general reference', () => {
    expect(t(set({ referenceSet: 'nasem' }), 'sodium').value).toBe(2300);
    expect(t(set({ referenceSet: 'nasem' }), 'potassium').value).toBe(2600);
    expect(genericTargetSet(TODAY).targets.find((x) => x.nutrient === 'sodium')!.value).toBe(2300);
  });

  it('give a person on the Indian set the micronutrient targets of microTarget directly, with the allowance it stands in for', () => {
    expect(microTarget('iron', 'female', '19-59', 'vegan', 'icmr_nin')).toMatchObject({ value: 15, type: 'EAR', allowance: 29, plantBasedAdjusted: false });
    expect(microTarget('calcium', 'male', '60+', 'omnivore', 'icmr_nin')).toMatchObject({ value: 1200, type: 'RDA', upperLevel: 2500 });
    expect(microTarget('iron', 'female', '19-30', 'omnivore')).toMatchObject({ value: 18, type: 'RDA' });
  });
});

describe('the range fat and carbohydrate are judged by (plan 4.4)', () => {
  it('is carried on the target: fat 15% to 35% on ICMR-NIN, 20% to 35% on the National Academies, carbohydrate 45% to 65% on both', () => {
    const indian = set();
    const american = computeTargets(person({ referenceSet: 'nasem' }), TODAY);
    expect(t(indian, 'fat').shareRange).toEqual({ low: 0.15, high: 0.35 });
    expect(t(american, 'fat').shareRange).toEqual({ low: 0.2, high: 0.35 });
    expect(t(indian, 'carbs').shareRange).toEqual({ low: 0.45, high: 0.65 });
    expect(t(american, 'carbs').shareRange).toEqual({ low: 0.45, high: 0.65 });
    // The grams around the planned amount are the same range read against the energy target.
    const e = indian.energy!.target;
    expect([t(indian, 'fat').low, t(indian, 'fat').high]).toEqual([Math.round((0.15 * e) / 9), Math.round((0.35 * e) / 9)]);
    // Only fat and carbohydrate have one, and the generic reference carries the National Academies' range.
    expect(indian.targets.filter((x) => x.shareRange).map((x) => x.nutrient)).toEqual(['carbs', 'fat']);
    expect(t(genericTargetSet(TODAY), 'fat').shareRange).toEqual({ low: 0.2, high: 0.35 });
  });

  it('survives a typed number: the bar moves, the range it is judged by does not', () => {
    const [fat] = applyOverrides(set().targets, [{ nutrient: 'fat', value: 50, origin: 'custom' }]).filter((x) => x.nutrient === 'fat');
    expect(fat).toMatchObject({ value: 50, origin: 'custom', shareRange: { low: 0.15, high: 0.35 } });
  });

  it('describes itself in the words of its own set', () => {
    expect(t(set(), 'fat').how).toMatch(/15% to 35% of energy \(ICMR-NIN\)/);
    expect(t(computeTargets(person({ referenceSet: 'nasem' }), TODAY), 'fat').how).toMatch(/20% to 35% of energy \(US National Academies\)/);
  });
});
