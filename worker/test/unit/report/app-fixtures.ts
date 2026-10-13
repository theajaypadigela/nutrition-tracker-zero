/**
 * The weekly reports the app's tests draw screens from (app/__tests__/fixtures/reports.json), built by the real engine so the app is
 * tested against the shape and the words the Worker really sends, never against a hand-made guess. `scripts/make-app-fixtures.ts`
 * writes them; `app-fixtures.test.ts` fails when the checked-in file no longer matches what the engine produces.
 */
import type { IntakeDay } from '../../../src/domain/intake/types';
import { buildWeeklyReport } from '../../../src/domain/report/weekly';
import { computeTargets } from '../../../src/domain/targets/engine';
import { WEEK, dates, day, item, usual as plainDay } from './helpers';

const TODAY = '2026-10-12';
const SUNDAY = '2026-10-11';
/** `n` daily weigh-ins ending on the Sunday of the reported week, to a tenth of a kilogram, from a function of the days before the end. */
const weighIns = (n: number, f: (before: number) => number) =>
  Array.from({ length: n }, (_, i) => ({ date: shift(SUNDAY, -(n - 1 - i)), weightKg: Math.round(f(n - 1 - i) * 10) / 10 }));
/** About 60 kg with the ordinary swing of a scale: a fifth of a kilogram either way. */
const steady = (n: number) => weighIns(n, (b) => 60 + 0.25 * Math.sin(b * 1.7));
const SUGAR = [10, 25, 12, 15];
/** The ordinary day with total sugars on each meal (62 g a day): the plan's own example of an amount that is shown and not judged. */
const usual = (date: string, over: { sodium?: number } = {}): IntakeDay => {
  const d = plainDay(date, over);
  return { ...d, items: d.items.map((it, i) => ({ ...it, nutrients: { ...it.nutrients, sugar: SUGAR[i]! } })) };
};
const prior = (weeksBack: number) => dates.map((d) => d.replace(/.*/, (x) => shift(x, -7 * weeksBack)));
function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const VITAMINS = [
  { vitaminA: 120, vitaminC: 10, vitaminD: 0.5, vitaminE: 2, vitaminK: 20 },
  { vitaminA: 250, vitaminC: 40, vitaminD: 1.5, vitaminE: 4, vitaminK: 50 },
  { vitaminA: 60, vitaminC: 5, vitaminD: 0.2, vitaminE: 1, vitaminK: 10 },
  { vitaminA: 180, vitaminC: 35, vitaminD: 1, vitaminE: 3, vitaminK: 40 },
];
/** The ordinary day with the vitamins too: A at 87%, C and K above, D at about a fifth and E two thirds of the reference. */
const withVitamins = (date: string, over: { sodium?: number } = {}): IntakeDay => {
  const d = usual(date, over);
  return { ...d, items: d.items.map((it, i) => ({ ...it, nutrients: { ...it.nutrients, ...VITAMINS[i]! } })) };
};
const fourWeeks = (build: (date: string) => IntakeDay) => [0, 1, 2, 3].flatMap((w) => dates.map((d) => build(shift(d, -7 * w))));

/** The ordinary week of the plan's Appendix F, with a little variation in the three weeks before it so there is a history. */
function ordinaryWithHistory(): IntakeDay[] {
  const week = dates.map((d) => usual(d));
  const earlier = [1, 2, 3].flatMap((w) => prior(w).map((d) => usual(d, { sodium: 1900 + w * 400 })));
  return [...earlier, ...week];
}

const crash = (date: string, mark: IntakeDay['mark'] = null) =>
  day(date, [item(1000, { protein: 38, fiber: 8, sodium: 900, potassium: 1200, calcium: 400, iron: 6, magnesium: 120, zinc: 4 })], mark);

export function buildAppFixtures() {
  const base = { weekStart: WEEK, today: TODAY, weeks: 8 } as const;
  // Asha of plan 4.8, from the engine itself: 2,150 kcal, protein 60 g, fibre 30 g, potassium 2,600 mg and the vitamins.
  const asha = computeTargets(
    { birthYear: 1996, birthMonth: 6, sexForCalc: 'female', heightCm: 160, weightKg: 60, activity: 'low_active', goal: 'general_health', pace: 'standard', pattern: 'omnivore', referenceSet: 'nasem' },
    '2026-10-05',
  );
  const personal = {
    mode: 'personalised' as const,
    targetSets: [{ ...asha, id: 'ts_asha', effectiveFrom: '2026-01-01' }],
    goal: 'general_health' as const,
    pattern: 'omnivore' as const,
    referenceSet: 'nasem' as const,
    bmi: 23.4,
  };
  // A vegetarian woman on the India set (ICMR-NIN, plan 4.10), from the engine itself: sodium limit 2,000 mg, iron, zinc and B12 against the average requirement.
  const priya = computeTargets(
    { birthYear: 1996, birthMonth: 6, sexForCalc: 'female', heightCm: 158, weightKg: 52, activity: 'low_active', goal: 'general_health', pace: 'standard', pattern: 'vegetarian', referenceSet: 'icmr_nin' },
    '2026-10-05',
  );
  const indianPersonal = {
    mode: 'personalised' as const,
    targetSets: [{ ...priya, id: 'ts_priya', effectiveFrom: '2026-01-01' }],
    goal: 'general_health' as const,
    pattern: 'vegetarian' as const,
    referenceSet: 'icmr_nin' as const,
    bmi: 20.8,
  };
  const ordinary = ordinaryWithHistory();
  // A person at BMI 31 whose goal is to lose weight: the plan asks for a change, so the trend can be set against it.
  const heavyProfile = { birthYear: 1990, birthMonth: 6, sexForCalc: 'female' as const, heightCm: 165, weightKg: 85, activity: 'low_active' as const, goal: 'lose' as const, pace: 'standard' as const, pattern: 'omnivore' as const, referenceSet: 'nasem' as const };
  const heavy = { ...personal, targetSets: [{ ...computeTargets(heavyProfile, '2026-08-01'), id: 'ts_heavy', effectiveFrom: '2026-08-01' }], goal: 'lose' as const, bmi: 31.2 };

  const half = dates.map((d) => day(d, usual(d).items.map((it, i) => (i % 2 ? { ...it, nutrients: { ...it.nutrients, calcium: null, iron: null, magnesium: null, zinc: null, potassium: null } } : it))));
  const pending = dates.map((d) => {
    const items = usual(d).items;
    return day(d, [items[0]!, items[1]!, items[3]!, item(null, {}, { pending: true, name: 'curry' }), item(null, {}, { pending: true, name: 'dal' })]);
  });

  return {
    /** An ordinary week, all seven days: score about 90, three insights, a history of four weeks, a steady weight over five weeks. */
    ordinary: buildWeeklyReport({ ...base, ...personal, days: ordinary, weights: steady(36) }),
    /** The same ordinary week on the India set: sodium against 2,000 mg, iron and zinc against the average requirement, fat against 15% to 35%. */
    indian: buildWeeklyReport({ ...base, ...indianPersonal, days: ordinary }),
    /** A loss goal, the weight falling about as the plan expects: the trend against the plan, with its range. */
    weight_losing: buildWeeklyReport({ ...base, ...heavy, days: ordinary, weights: weighIns(36, (b) => 85 + b * 0.05) }),
    /** The weight falling much faster than is usual: the safety message leads. */
    rapid_loss: buildWeeklyReport({ ...base, ...heavy, days: ordinary, weights: weighIns(42, (b) => 85 + b * 0.25) }),
    /** The experimental calibration switched on: a steady weight on about 1,800 kcal of logged food a day. */
    calibration: buildWeeklyReport({ ...base, ...personal, days: ordinary, weights: steady(36), config: { calibration: true } }),
    /** The same week with vitamin values on every food for four weeks: vitamins A, C, D, E and K have verdicts over the window. */
    vitamins: buildWeeklyReport({ ...base, ...personal, days: fourWeeks(withVitamins) }),
    /** Four days logged: the score carries its leave-one-day-out range. */
    four_days: buildWeeklyReport({ ...base, ...personal, days: dates.map((d, i) => (i < 4 ? usual(d) : day(d))) }),
    /** Wednesday: two days logged, today in progress. */
    few_days: buildWeeklyReport({ ...base, ...personal, today: '2026-10-07', days: [usual(dates[0]!), usual(dates[1]!), ...dates.slice(2).map((d) => day(d))] }),
    /** Sodium at 4,000 mg a day: the score drops and the limit is named. */
    sodium_high: buildWeeklyReport({ ...base, ...personal, days: dates.map((d) => usual(d, { sodium: 4000 })) }),
    /** About 1,000 kcal a day: the days look incomplete, the low-intake notice leads, no score. */
    crash_diet: buildWeeklyReport({ ...base, ...personal, days: dates.map((d) => crash(d)) }),
    /** The same, every day marked complete: the days count, the score is withheld, the notice still leads. */
    crash_diet_confirmed: buildWeeklyReport({ ...base, ...personal, days: dates.map((d) => crash(d, 'complete')) }),
    /** Minerals missing on half the foods: those rows are not judged and the score is withheld for thin data. */
    thin_data: buildWeeklyReport({ ...base, ...personal, days: half }),
    /** 40% of items pending: the days look incomplete and the score is withheld for unknown foods. */
    pending: buildWeeklyReport({ ...base, ...personal, days: pending }),
    /** No health profile: the general reference, no energy verdict, no score. */
    generic: buildWeeklyReport({ ...base, mode: 'generic', days: dates.map((d) => usual(d)) }),
    /** A safety gate fired and the person typed care-team numbers: bars against those, nothing else. */
    reference_only: buildWeeklyReport({
      ...base,
      mode: 'reference_only',
      days: dates.map((d) => usual(d)),
      overrides: [
        { nutrient: 'calories', value: 1800, origin: 'care_team' },
        { nutrient: 'protein', value: 70, origin: 'care_team' },
      ],
    }),
    /** Numbers hidden: no energy, no amounts, no score, no digits in the words. */
    low_pressure: buildWeeklyReport({ ...base, mode: 'reference_only', numbersHidden: true, days: dates.map((d) => usual(d)) }),
    /** Numbers hidden, with personal targets: only numberless insights about fibre, sodium and the log. */
    low_pressure_personal: buildWeeklyReport({ ...base, ...personal, numbersHidden: true, days: dates.map((d) => usual(d, { sodium: 4000 })) }),
    /** A person whose medicine interacts with food: sodium, potassium and vitamin K as amounts only. */
    medicine: buildWeeklyReport({ ...base, ...personal, medicine: true, days: dates.map((d) => usual(d)) }),
    /** The ordinary week as a deployment serves it by default: the Nutrient mix switched off (NUTRIENT_SCORE). */
    score_off: buildWeeklyReport({ ...base, ...personal, days: ordinary, weights: steady(36), config: { score: false } }),
    /** The ordinary week with twenty katoris of rice logged on Tuesday, a likely mishearing, and labelled foods: the amount leads the data insights. */
    check_amounts: buildWeeklyReport({
      ...base,
      ...personal,
      days: ordinary.map((d) =>
        d.date === dates[1]
          ? { ...d, items: [...d.items.map((it) => ({ ...it, source: 'label' as const })), item(2600, { protein: 54 }, { foodId: 'rice', name: 'Rice', quantity: 20, unit: 'katori', source: 'estimate' })] }
          : d.date >= dates[0]! ? { ...d, items: d.items.map((it) => ({ ...it, source: 'label' as const })) } : d,
      ),
    }),
  };
}
