/**
 * The targets engine (WEEKLY_BREAKDOWN_PLAN.md section 4): a profile in, an explained set of typed
 * targets out. Pure and deterministic: no AI, no clock, no database. Every target carries its kind, its
 * evidence tag [R] [E] [G] [A], a source and one plain sentence of how it was worked out. Appendix E of
 * the plan is the independent second implementation these numbers are tested against.
 */
import { NUTRIENTS, type NutrientKey } from '../nutrients';
import {
  ICMR_ADDED_SUGAR_SHARE,
  ICMR_POTASSIUM_MG,
  ICMR_SODIUM_LIMIT_MG,
  referenceBandOf,
  type ReferenceBand,
} from '../reference/icmr';
import {
  AMDR,
  GENERIC_ENERGY_KCAL,
  SODIUM_LIMIT_MG,
  energyLimitGrams,
  genericReference,
  type MicroKey,
  type SexForCalc,
} from '../reference/nasem';
import type { SourceId } from '../reference/sources';
import { energyBase } from './energy';
import { entryGate, goalGate } from './eligibility';
import { CALORIE_FLOOR, adjustForGoal } from './goal';
import { planMacros, potassiumAi, type MacroPlan } from './macros';
import { FOUR_WEEK_MICROS, microTarget } from './micros';
import { ageOn, bmiOf, proteinReferenceWeight } from './profile';
import {
  ENGINE_VERSION,
  NO_SAFETY_FLAGS,
  type Goal,
  type HealthProfileInput,
  type Pace,
  type SafetyAnswers,
  type Target,
  type TargetSet,
  type Warning,
} from './types';

const UNITS: Record<NutrientKey, string> = Object.fromEntries(NUTRIENTS.map((n) => [n.key, n.unit])) as Record<NutrientKey, string>;

/** "1,910": a number as the people reading it expect to see it. */
const n = (x: number) => x.toLocaleString('en-US', { maximumFractionDigits: 1 });

const WHO: Record<SexForCalc, string> = { female: 'women', male: 'men', average: 'adults (the average of women and men)' };
const PACE_WORD: Record<Pace, string> = { gentle: 'gentle', standard: 'standard', faster: 'faster' };

/** The micronutrient targets that count toward the Nutrient mix: low day-to-day variation (plan 4.6, 5.5). */
const SCORED: ReadonlySet<NutrientKey> = new Set(['protein', 'fiber', 'potassium', 'calcium', 'iron', 'magnesium', 'zinc', 'sodium', 'saturatedFat', 'addedSugar']);

/** Nutrients whose verdicts and nudges are turned off by a medicine that interacts with food (plan 8.1, G12). */
export const MEDICINE_SENSITIVE: ReadonlySet<NutrientKey> = new Set(['vitaminK', 'potassium', 'sodium']);

type TargetBase = Omit<Target, 'scored' | 'verdicts' | 'origin' | 'unit'> & { origin?: Target['origin'] };

function finish(base: TargetBase, medicine: boolean): Target {
  const { origin, ...rest } = base;
  return {
    ...rest,
    unit: UNITS[base.nutrient],
    scored: SCORED.has(base.nutrient),
    verdicts: !(medicine && MEDICINE_SENSITIVE.has(base.nutrient)),
    origin: origin ?? 'recommended',
  };
}

function energyHow(args: { goal: Goal; pace: Pace; maintenance: number; low: number; high: number; delta: number; floorApplied: boolean; floor: number }): string {
  const { goal, pace, maintenance, low, high, delta, floorApplied, floor } = args;
  if (goal === 'lose') {
    return (
      `About ${n(maintenance)} kcal a day keeps your weight steady (typically ${n(low)} to ${n(high)}). ` +
      `Your target is ${n(Math.abs(delta))} kcal below that for a ${PACE_WORD[pace]} pace. ` +
      (floorApplied ? `It is held at ${n(floor)} kcal, the lowest target the app shows. ` : '') +
      `Real needs vary, so your weight trend is a better guide than this number.`
    );
  }
  if (goal === 'gain' || (goal === 'build_muscle' && delta > 0)) {
    return (
      `About ${n(maintenance)} kcal a day keeps your weight steady (typically ${n(low)} to ${n(high)}). ` +
      `Your target is ${n(delta)} kcal above that, ${goal === 'gain' ? 'a modest surplus to gain weight gradually' : 'a small surplus for building muscle'}. ` +
      `Real needs vary, so your weight trend is a better guide than this number.`
    );
  }
  return (
    `Energy to keep your weight steady, from the US National Academies' 2023 equation for your age, height, weight and activity. ` +
    `Your real needs could be anywhere from about ${n(low)} to ${n(high)} kcal.`
  );
}

function proteinHow(args: { gkg: number; goal: Goal; age: number; referenceWeightKg: number; weightKg: number; clamped: boolean; rdaGPerKg: number }): string {
  const { goal, age, referenceWeightKg, weightKg, clamped, rdaGPerKg } = args;
  const gkg = args.gkg.toFixed(1); // "1.0 g", as the plan words it
  let core: string;
  if (age >= 65) core = `At least ${gkg} g for each kg of your weight at your age: older adults need more protein to keep muscle.`;
  else if (goal === 'lose') core = `${gkg} g for each kg of your weight, to help keep muscle while you eat less: within the 1.2 to 1.6 used in US 2025-2030 guidance.`;
  else if (goal === 'gain') core = `${gkg} g for each kg of your weight, at the lower end of the 1.2 to 1.6 used in US 2025-2030 guidance.`;
  else if (goal === 'build_muscle') core = `${gkg} g for each kg of your weight, the top of the 1.2 to 1.6 in US 2025-2030 guidance and inside the 1.4 to 2.0 used for people who train.`;
  else core = `${gkg} g for each kg of your weight: above the recommended allowance of ${rdaGPerKg}, below the 1.2 to 1.6 used in US 2025-2030 guidance.`;
  const weighted = referenceWeightKg < weightKg ? ` It is counted on ${n(Math.round(referenceWeightKg * 10) / 10)} kg, the weight at a BMI of 30, not your full weight.` : '';
  const bounded = clamped ? ` It is kept inside 10% to 35% of your energy and between ${rdaGPerKg} and 2.0 g per kg.` : '';
  return core + weighted + bounded;
}

/** The Indian set's explanation (ICMR-NIN, 2020): its own wording for iron, zinc and B12 (the average requirement stands in for the allowance). */
function indianMicroHow(args: { nutrient: MicroKey; type: 'RDA' | 'EAR' | 'AI'; sex: SexForCalc; band: ReferenceBand; allowance?: number; upperLevel?: number; unit: string }): string {
  const { nutrient, type, sex, band, allowance, upperLevel, unit } = args;
  const age = band === '60+' ? '60 and over' : '19 to 59';
  const kind = type === 'EAR' ? 'Estimated Average Requirement' : type === 'RDA' ? 'Recommended Dietary Allowance' : 'recommended intake';
  let s = `${kind} for ${WHO[sex]} aged ${age} (ICMR-NIN, 2020, India).`;
  if (type === 'EAR') {
    s += ` It is used instead of the Recommended Dietary Allowance (${n(allowance ?? 0)} ${unit}) because ICMR's own model diets do not reach the allowance for iron, zinc and vitamin B12. It is the level at which about half of people would still need more.`;
  }
  if (type === 'AI') s += ' It is an adequate intake, so falling short of it says little about what you need.';
  if (nutrient === 'iron') s += ' It assumes about 8% absorption from Indian diets, so there is no extra allowance for a plant-based diet.';
  if (nutrient === 'vitaminA') s += ' It is in retinol equivalents (carotenoids counted at 6 to 1), so a value in retinol activity equivalents reads lower.';
  if (nutrient === 'vitaminD') s += ' ICMR counts time outdoors on top of food; sunlight and supplements are not counted here.';
  if (nutrient === 'vitaminE') s += ' ICMR suggests 7.5 to 10 mg depending on the oil used; 10 mg is used here.';
  if (nutrient === 'vitaminB12') s += ' Supplements and fortified foods may not be in your log.';
  if (nutrient === 'folate') s += ' It is counted as dietary folate; supplements and fortified foods may not be in your log.';
  if (upperLevel !== undefined) s += ` The upper limit of ${n(upperLevel)} ${unit} covers all sources, including supplements.`;
  return s;
}

function microHow(args: { nutrient: MicroKey; type: 'RDA' | 'EAR' | 'AI'; sex: SexForCalc; band: ReferenceBand; plantBased: boolean; upperLevel?: number; unit: string; referenceSet?: 'nasem' | 'icmr_nin'; allowance?: number }): string {
  if (args.referenceSet === 'icmr_nin') return indianMicroHow(args);
  const { nutrient, sex, band, plantBased, upperLevel, unit } = args;
  const type = args.type === 'EAR' ? 'RDA' : args.type;
  const age = band === '>70' ? 'over 70' : `${band.replace('-', ' to ')}`;
  const kind = type === 'RDA' ? 'Recommended Dietary Allowance' : 'Adequate Intake';
  let s = `${kind} for ${WHO[sex]} aged ${age} (US National Academies).`;
  if (type === 'AI') s += ' It is an observed typical intake, so falling short of it says little about what you need.';
  if (plantBased) s += ' Multiplied by 1.8 because iron from plants is absorbed less well.';
  if (nutrient === 'vitaminD') s += ' It assumes little sun; sunlight and supplements are not counted here.';
  if (nutrient === 'vitaminB12') s += ' Supplements and fortified foods may not be in your log.';
  if (nutrient === 'folate') s += ' It is counted in dietary folate equivalents (DFE); supplements and fortified foods may not be in your log.';
  if (upperLevel !== undefined) s += ` The upper level of ${n(upperLevel)} ${unit} covers all sources, including supplements.`;
  return s;
}

const NASEM_BASIS: SourceId = 'nasem-dri-appendix-j';
const ICMR_BASIS: SourceId = 'icmr-nin2020';

/** The targets of a personalised profile. */
function personalisedTargets(args: {
  sex: SexForCalc;
  band: ReferenceBand;
  age: number;
  weightKg: number;
  referenceWeightKg: number;
  goal: Goal;
  pace: Pace;
  pattern: HealthProfileInput['pattern'];
  referenceSet: HealthProfileInput['referenceSet'];
  energyTarget: number;
  energyDelta: number;
  floorApplied: boolean;
  base: ReturnType<typeof energyBase>;
  macros: MacroPlan;
  medicine: boolean;
}): Target[] {
  const { sex, band, age, weightKg, referenceWeightKg, goal, pace, pattern, energyTarget: E, base, macros, medicine } = args;
  const indian = args.referenceSet === 'icmr_nin';
  const setName = indian ? 'ICMR-NIN' : 'US National Academies';
  const out: Target[] = [];

  out.push(
    finish(
      {
        nutrient: 'calories',
        kind: 'energy',
        value: E,
        // The estimate's uncertainty moves with the goal, so a loss or gain target is never shown outside its own range ("about
        // 2,190 kcal (2,240 to 2,920)"); and the low end of a loss target never goes under the floor, so the range cannot read as
        // permission to eat less than it. The steady-weight range itself is in `energy` and in the explanation.
        low: E < base.maintenance ? Math.max(base.low + (E - base.maintenance), Math.min(E, CALORIE_FLOOR[sex])) : base.low + (E - base.maintenance),
        high: base.high + (E - base.maintenance),
        refType: 'estimate',
        window: 'week',
        evidence: 'E',
        basis: 'nasem2023-eer',
        how: energyHow({ goal, pace, maintenance: base.maintenance, low: base.low, high: base.high, delta: args.energyDelta, floorApplied: args.floorApplied, floor: CALORIE_FLOOR[sex] }),
      },
      medicine,
    ),
  );

  const proteinClamped = macros.proteinG !== Math.round(macros.gPerKg * referenceWeightKg);
  out.push(
    finish(
      {
        nutrient: 'protein',
        kind: 'minimum',
        value: macros.proteinG,
        refType: 'estimate',
        window: 'week',
        evidence: 'A',
        basis: 'protein-per-kg',
        how: proteinHow({ gkg: macros.gPerKg, goal, age, referenceWeightKg, weightKg, clamped: proteinClamped, rdaGPerKg: macros.proteinRdaGPerKg }),
      },
      medicine,
    ),
  );

  out.push(
    finish(
      {
        nutrient: 'carbs',
        kind: 'range',
        value: macros.carbsG,
        low: macros.carbsLowG,
        high: macros.carbsHighG,
        shareRange: { low: AMDR.carbs.low, high: AMDR.carbs.high },
        refType: 'range',
        window: 'week',
        evidence: 'R',
        basis: indian ? ICMR_BASIS : 'nasem-amdr',
        how: macros.notes.includes('carb_floor')
          ? `Held at the 130 g minimum, with fat reduced to make room. The usual range is ${Math.round(AMDR.carbs.low * 100)}% to ${Math.round(AMDR.carbs.high * 100)}% of energy (${setName}).`
          : `What is left of your energy target after protein and fat, never under 130 g. The usual range is ${Math.round(AMDR.carbs.low * 100)}% to ${Math.round(AMDR.carbs.high * 100)}% of energy (${setName}).`,
      },
      medicine,
    ),
  );

  out.push(
    finish(
      {
        nutrient: 'fat',
        kind: 'range',
        value: macros.fatG,
        low: macros.fatLowG,
        high: macros.fatHighG,
        shareRange: { low: macros.fatRange.low, high: macros.fatRange.high },
        refType: 'range',
        window: 'week',
        evidence: 'A',
        basis: indian ? ICMR_BASIS : 'nasem-amdr',
        how: `About 30% of your energy target. The usual range is ${Math.round(macros.fatRange.low * 100)}% to ${Math.round(macros.fatRange.high * 100)}% of energy (${setName}).`,
      },
      medicine,
    ),
  );

  out.push(
    finish(
      {
        nutrient: 'fiber',
        kind: 'minimum',
        value: macros.fibreG,
        refType: 'AI',
        window: 'week',
        evidence: 'R',
        basis: indian ? ICMR_BASIS : 'nasem-fibre-ai',
        how: indian
          ? `${macros.fibreGPer1000} g for every 1,000 kcal of your target, and at least 25 g (about the amount in ICMR-NIN's own tables; WHO).`
          : '14 g for every 1,000 kcal of your target, and at least 25 g (US National Academies Adequate Intake; WHO).',
      },
      medicine,
    ),
  );

  // 2,300 mg on the US set; 2,000 mg (about 5 g of salt) on the Indian one, which ICMR-NIN takes from the WHO.
  out.push(
    finish(
      {
        nutrient: 'sodium',
        kind: 'limit',
        value: indian ? ICMR_SODIUM_LIMIT_MG : SODIUM_LIMIT_MG,
        refType: 'limit',
        window: 'week',
        evidence: 'R',
        basis: indian ? ICMR_BASIS : 'nasem2019-cdrr',
        how: indian
          ? 'A safe intake of 2,000 mg a day, about 5 g of salt (ICMR-NIN, 2020; the WHO figure).'
          : 'The level above which cutting back is expected to lower chronic-disease risk (US National Academies, 2019).',
      },
      medicine,
    ),
  );

  // Saturated fat and added sugars (Phase 4): limits of 10% of the energy target [R] WHO; an aspiration of under 5% for sugars.
  const satG = energyLimitGrams('saturatedFat', E);
  out.push(
    finish(
      {
        nutrient: 'saturatedFat',
        kind: 'limit',
        value: satG,
        refType: 'limit',
        window: 'week',
        evidence: 'R',
        basis: 'who-saturated-fat',
        how: `At most 10% of your energy target from saturated fat, about ${n(satG)} g a day (WHO, 2023).`,
      },
      medicine,
    ),
  );
  // 10% of energy on the US set (WHO, with 5% as the aspiration); 5% on the Indian one (Dietary Guidelines for Indians, 2024).
  const addedG = indian ? Math.round((ICMR_ADDED_SUGAR_SHARE * E) / 4) : energyLimitGrams('addedSugar', E);
  out.push(
    finish(
      {
        nutrient: 'addedSugar',
        kind: 'limit',
        value: addedG,
        refType: 'limit',
        window: 'week',
        evidence: indian ? 'G' : 'R',
        basis: indian ? 'dgi2024' : 'who-sugars',
        how: indian
          ? `At most 5% of your energy target from added sugars, about ${n(addedG)} g a day (Dietary Guidelines for Indians, 2024). Total sugars have no limit: they include the sugars in fruit and milk.`
          : `At most 10% of your energy target from added (free) sugars, about ${n(addedG)} g a day. WHO says under 5%, about ${n(Math.round(addedG / 2))} g, may bring further benefit. Total sugars have no limit: they include the sugars in fruit and milk.`,
      },
      medicine,
    ),
  );

  // Potassium is an Adequate Intake with no upper limit; the label Daily Value of 4,700 mg is superseded.
  const micros: MicroKey[] = ['vitaminA', 'vitaminC', 'vitaminD', 'vitaminE', 'vitaminK', 'vitaminB12', 'folate', 'calcium', 'iron', 'potassium', 'magnesium', 'zinc'];
  for (const key of micros) {
    if (key === 'potassium') {
      const value = indian ? ICMR_POTASSIUM_MG : potassiumAi(sex);
      out.push(
        finish(
          {
            nutrient: 'potassium',
            kind: 'minimum',
            value,
            refType: 'AI',
            window: 'week',
            evidence: 'R',
            basis: indian ? ICMR_BASIS : 'nasem2019-potassium-ai',
            how: indian
              ? 'A recommended intake of 3,500 mg for adults (ICMR-NIN, 2020, from the WHO recommendation): an adequate intake, so falling short of it says little about what you need. There is no upper limit.'
              : `Adequate Intake for ${WHO[sex]} (US National Academies, 2019): an observed typical intake, so falling short of it says little about what you need. There is no upper limit.`,
          },
          medicine,
        ),
      );
      continue;
    }
    const t = microTarget(key, sex, band, pattern, args.referenceSet);
    const unit = UNITS[key];
    out.push(
      finish(
        {
          nutrient: key,
          kind: 'minimum',
          value: t.value,
          refType: t.type,
          ...(t.upperLevel !== undefined ? { upperLevel: t.upperLevel } : {}),
          window: FOUR_WEEK_MICROS.has(key) ? 'four_weeks' : 'week',
          evidence: 'R',
          basis: indian ? ICMR_BASIS : NASEM_BASIS,
          how: microHow({ nutrient: key, type: t.type, sex, band, plantBased: t.plantBasedAdjusted, upperLevel: t.upperLevel, unit, referenceSet: args.referenceSet, allowance: t.allowance }),
        },
        medicine,
      ),
    );
  }
  return out;
}

export interface ComputeOptions {
  /** The safety check, used once and discarded. Absent means "none of these". */
  safety?: SafetyAnswers;
  /** An id for the saved set; null for a preview. */
  id?: string | null;
}

/** A set with no targets: a gate fired, so there is nothing to compare with (plan 8.1). */
export function referenceOnlySet(today: string, warnings: Warning[], options: ComputeOptions = {}): TargetSet {
  return {
    id: options.id ?? null,
    effectiveFrom: today,
    engineVersion: ENGINE_VERSION,
    referenceSet: 'nasem',
    mode: 'reference_only',
    inputs: null,
    energy: null,
    targets: [],
    warnings,
    availableGoals: [],
    lossStartedOn: null,
  };
}

/**
 * A personalised target set, or a reference-only one when a gate fires. `today` ('YYYY-MM-DD' in the
 * person's time zone) decides the age. The engine never reads a clock: the same input twice gives the
 * same output.
 */
export function computeTargets(profile: HealthProfileInput, today: string, options: ComputeOptions = {}): TargetSet {
  const safety = options.safety ?? NO_SAFETY_FLAGS;
  const age = ageOn(today, profile.birthYear, profile.birthMonth);
  const bmi = bmiOf(profile.weightKg, profile.heightCm);
  const gate = entryGate({ age, bmi, safety });
  if (gate.mode === 'reference_only') return referenceOnlySet(today, gate.warnings, options);

  const goals = goalGate({ goal: profile.goal, age, bmi, referenceSet: profile.referenceSet });
  const warnings: Warning[] = [...goals.warnings];
  const base = energyBase(profile.sexForCalc, age, profile.heightCm, profile.weightKg, profile.activity);
  const adjustment = adjustForGoal({
    goalApplied: goals.goalApplied,
    pace: profile.pace,
    sex: profile.sexForCalc,
    weightKg: profile.weightKg,
    bmi,
    tee: base.tee,
  });
  warnings.push(...adjustment.warnings);
  const E = adjustment.target;
  const referenceWeightKg = proteinReferenceWeight(profile.weightKg, profile.heightCm);
  const macros = planMacros({ energy: E, referenceWeightKg, goal: adjustment.goalApplied, age, referenceSet: profile.referenceSet });
  const band: ReferenceBand = referenceBandOf(profile.referenceSet, age);
  if (base.disagree) warnings.push({ id: 'estimates_disagree', severity: 'info' });
  // The 1.8 times iron of a plant-based diet is a National Academies rule; ICMR's iron figures already assume about 8% absorption.
  if (profile.referenceSet === 'nasem' && (profile.pattern === 'eggetarian' || profile.pattern === 'vegetarian' || profile.pattern === 'vegan')) {
    warnings.push({ id: 'iron_plant_based', severity: 'info' });
  }
  if (safety.dietInteractingMedicine) warnings.push({ id: 'medicine_amounts_only', severity: 'info' });

  return {
    id: options.id ?? null,
    effectiveFrom: today,
    engineVersion: ENGINE_VERSION,
    referenceSet: profile.referenceSet,
    mode: 'personalised',
    inputs: {
      ageBand: band,
      sexForCalc: profile.sexForCalc,
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
      bmi: Math.round(bmi * 10) / 10,
      activity: profile.activity,
      goal: profile.goal,
      goalApplied: adjustment.goalApplied,
      pace: profile.pace,
      pattern: profile.pattern,
    },
    energy: {
      maintenance: base.maintenance,
      target: E,
      low: base.low,
      high: base.high,
      method: 'nasem2023',
      floorApplied: adjustment.floorApplied,
      delta: adjustment.delta,
      crossCheck: { mifflinPal: base.mifflinPal, disagree: base.disagree },
    },
    targets: personalisedTargets({
      sex: profile.sexForCalc,
      band,
      age,
      weightKg: profile.weightKg,
      referenceWeightKg,
      goal: adjustment.goalApplied,
      pace: profile.pace,
      pattern: profile.pattern,
      referenceSet: profile.referenceSet,
      energyTarget: E,
      energyDelta: adjustment.delta,
      floorApplied: adjustment.floorApplied,
      base,
      macros,
      medicine: safety.dietInteractingMedicine,
    }),
    warnings,
    availableGoals: goals.available,
    lossStartedOn: adjustment.goalApplied === 'lose' ? today : null,
  };
}

// ---- generic mode: no health profile (plan 4.6, 7.5) ----------------------------------------------------

const GENERIC_HOW: Partial<Record<NutrientKey, string>> = {
  calories:
    'The energy used on US and Indian food labels for a typical adult (2,000 kcal). It is a general reference, not an estimate of your needs.',
  protein: '50 g: the US food-label reference for a 2,000 kcal diet. A general reference, not personal.',
  carbs: '275 g: the US food-label reference for a 2,000 kcal diet; the usual range is 45% to 65% of energy. A general reference, not personal.',
  fat: '78 g: the US food-label reference for a 2,000 kcal diet; the usual range is 20% to 35% of energy. A general reference, not personal.',
  fiber: '28 g: the US food-label reference for a 2,000 kcal diet. A general reference, not personal.',
  sodium: 'The level above which cutting back is expected to lower chronic-disease risk (US National Academies, 2019). A general reference, not personal.',
  saturatedFat: 'At most 10% of the energy of a 2,000 kcal diet, 22 g (WHO, 2023). A general reference, not personal.',
  addedSugar: 'At most 10% of the energy of a 2,000 kcal diet, 50 g of added (free) sugars (WHO, 2015). A general reference, not personal.',
};

/**
 * The generic reference set: a typical adult on a 2,000 kcal diet, labelled "General reference, not
 * personal". It sets no personal energy target, so there is no energy verdict and no score (plan 7.5).
 */
export function genericTargetSet(today: string): TargetSet {
  const targets: Target[] = [];
  for (const nutrient of NUTRIENTS) {
    const value = genericReference(nutrient.key);
    if (value === null) continue;
    const kind = nutrient.kind === 'amount' ? 'minimum' : nutrient.kind;
    const micro = (['vitaminA', 'vitaminC', 'vitaminD', 'vitaminE', 'vitaminK', 'vitaminB12', 'folate', 'calcium', 'iron', 'potassium', 'magnesium', 'zinc'] as string[]).includes(nutrient.key);
    const share = nutrient.key === 'fat' ? AMDR.fat : nutrient.key === 'carbs' ? AMDR.carbs : null;
    const perGram = nutrient.key === 'fat' ? 9 : 4;
    targets.push({
      nutrient: nutrient.key,
      kind,
      unit: nutrient.unit,
      value,
      ...(share ? { low: Math.round((share.low * GENERIC_ENERGY_KCAL) / perGram), high: Math.round((share.high * GENERIC_ENERGY_KCAL) / perGram), shareRange: { low: share.low, high: share.high } } : {}),
      refType: nutrient.key === 'calories' ? 'estimate' : kind === 'range' ? 'range' : kind === 'limit' ? 'limit' : 'AI',
      window: nutrient.window,
      evidence: 'R',
      basis:
        nutrient.key === 'sodium'
          ? 'nasem2019-cdrr'
          : nutrient.key === 'saturatedFat'
            ? 'who-saturated-fat'
            : nutrient.key === 'addedSugar'
              ? 'who-sugars'
              : micro
                ? 'nasem-dri-appendix-j'
                : 'us-label-dv',
      how:
        GENERIC_HOW[nutrient.key] ??
        'An average of the women\'s and men\'s reference intake for adults aged 31 to 50 (US National Academies). A general reference, not personal.',
      scored: false,
      verdicts: true,
      origin: 'recommended',
    });
  }
  return {
    id: null,
    effectiveFrom: today,
    engineVersion: ENGINE_VERSION,
    referenceSet: 'nasem',
    mode: 'generic',
    inputs: null,
    energy: null,
    targets,
    warnings: [],
    availableGoals: [],
    lossStartedOn: null,
  };
}

