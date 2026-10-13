/**
 * The Nutrient mix (WEEKLY_BREAKDOWN_PLAN.md 5.5, 11.5): components, "at least" versus "about", the
 * withholding rules, and the properties that make it safe. Each property runs over weeks from a fixed seed.
 */
import { describe, expect, it } from 'vitest';
import type { NutrientKey } from '../../../src/domain/nutrients';
import { REPORT_CONFIG } from '../../../src/domain/reference/scoring';
import { computeScore, jackknife, linear, shownScore } from '../../../src/domain/report/score';
import type { IntakeDay, IntakeItem } from '../../../src/domain/intake/types';
import { ASHA, day, dates, item, reportOf, usual } from './helpers';
import { mapItems, pick, randomWeek, rng, scaled, uniform } from './gen';

const standards = { protein: 60, fiber: 30, potassium: 2600, calcium: 1000, iron: 18, magnesium: 310, zinc: 8 };
const input = (days: IntakeDay[], indices?: number[]) => ({ days, indices: indices ?? days.map((_, i) => i).filter((i) => days[i]!.items.length > 0), standards, energyTarget: 2150 });
const score = (days: IntakeDay[]) => computeScore(input(days)).value;

describe('the standards', () => {
  it('linear credit: full at or below the first edge, none at or above the second', () => {
    expect(linear(1100, 1100, 2000)).toBe(1);
    expect(linear(900, 1100, 2000)).toBe(1);
    expect(linear(2000, 1100, 2000)).toBe(0);
    expect(linear(2500, 1100, 2000)).toBe(0);
    expect(linear(1550, 1100, 2000)).toBeCloseTo(0.5, 12);
  });

  it('sodium: full credit at 1,100 mg per 1,000 kcal, none at 2,000 (HEI-2020)', () => {
    // 1,800 kcal a day; sodium chosen to give exact densities.
    const week = (mgPerDay: number) => dates.map((d) => usual(d, { sodium: mgPerDay }));
    const sodium = (mg: number) => computeScore(input(week(mg))).components.find((c) => c.id === 'sodium')!;
    expect(sodium(1100 * 1.8).points).toBeCloseTo(10, 9);
    expect(sodium(2000 * 1.8).points).toBeCloseTo(0, 9);
    expect(sodium(1550 * 1.8).points).toBeCloseTo(5, 9);
    expect(sodium(1100 * 1.8 - 100).points).toBeCloseTo(10, 9);
  });

  it('adequacy credit is full from 90% of the reference density, not 100% (the same edge as "on target")', () => {
    // Protein 60 g at 2,150 kcal = 27.9 g per 1,000 kcal; 90% of that is 25.1.
    const day1 = (proteinPer1000: number) => dates.map((d) => day(d, [item(2000, { protein: proteinPer1000 * 2, fiber: 60, potassium: 5200, calcium: 2000, iron: 36, magnesium: 620, zinc: 16, sodium: 1000 })]));
    const protein = (p: number) => computeScore(input(day1(p))).components.find((c) => c.id === 'protein')!;
    const full = (0.9 * 60) / 2.15; // protein per 1,000 kcal from which credit is full
    expect(protein(full + 0.01).points).toBeCloseTo(10, 9);
    expect(protein(40).points).toBeCloseTo(10, 9); // capped: more than enough earns no more
    expect(protein(full / 2).points).toBeCloseTo(5, 9);
    expect(protein(0).points).toBe(0);
  });
});

describe('the words of the standards follow the reference set', () => {
  const week = dates.map((d) => usual(d));
  const standard = (referenceSet?: 'nasem' | 'icmr_nin', config = REPORT_CONFIG) =>
    Object.fromEntries(computeScore({ ...input(week), ...(referenceSet ? { referenceSet } : {}) }, config).components.map((c) => [c.id, c.standard]));

  it('name the National Academies on that set, and by default', () => {
    for (const s of [standard(), standard('nasem')]) {
      expect(s.iron).toBe('Iron per 1,000 kcal against the Recommended Dietary Allowance (National Academies)');
      expect(s.fibre).toBe('Fibre per 1,000 kcal against 14 g per 1,000 kcal (National Academies)');
    }
  });

  it('name ICMR-NIN on the India set, with the average requirement for iron and zinc, and never the National Academies', () => {
    const s = standard('icmr_nin');
    expect(s.iron).toBe('Iron per 1,000 kcal against the Estimated Average Requirement (ICMR-NIN)');
    expect(s.zinc).toBe('Zinc per 1,000 kcal against the Estimated Average Requirement (ICMR-NIN)');
    expect(s.fibre).toBe('Fibre per 1,000 kcal against 15 g per 1,000 kcal (ICMR-NIN)');
    expect(s.calcium).toMatch(/Recommended Dietary Allowance \(ICMR-NIN\)/);
    expect(Object.values(s).filter((text) => /National Academies/.test(text))).toEqual([]);
    // The score's own standards are the same on both sets: protein against the person's target, sodium and the moderation parts by the HEI-2020.
    expect(s.protein).toBe(standard('nasem').protein);
    expect(s.sodium).toBe(standard('nasem').sodium);
    const withModeration = standard('icmr_nin', { ...REPORT_CONFIG, moderationComponents: true });
    expect(withModeration.saturated_fat).toBe(standard('nasem', { ...REPORT_CONFIG, moderationComponents: true }).saturated_fat);
  });

  it('change no number: the same standards give the same points on either set', () => {
    const points = (referenceSet: 'nasem' | 'icmr_nin') => computeScore({ ...input(week), referenceSet }).components.map((c) => [c.id, c.points, c.coverage]);
    expect(points('icmr_nin')).toEqual(points('nasem'));
  });
});

describe('unknown parts earn nothing and stay in the denominator ("at least N")', () => {
  it('reads "about" when everything is known, and "at least" (rounded down) when a component is unknown', () => {
    const complete = reportOf(dates.map((d) => usual(d)));
    expect(complete.score.value).toBe(90);
    expect([complete.score.isMinimum, complete.score.shown]).toEqual([false, 90]);

    // Sodium missing from one food a day: the sodium component is unknown, so the score is a minimum.
    const gap = dates.map((d) => {
      const u = usual(d);
      return { ...u, items: u.items.map((it, i) => (i === 1 ? { ...it, nutrients: { ...it.nutrients, sodium: null } } : it)) };
    });
    const r = reportOf(gap);
    expect(r.score.isMinimum).toBe(true);
    expect(r.score.components.find((c) => c.id === 'sodium')).toMatchObject({ scorable: false, points: 0 });
    expect(r.score.shown).toBe(75); // 77.9 rounded DOWN to the nearest 5
    expect(r.score.value!).toBeLessThan(complete.score.value!);
  });

  it('shows the nearest 5, and rounds down for a minimum', () => {
    expect([shownScore(91.4, false), shownScore(92.6, false), shownScore(92.6, true), shownScore(77.9, true), shownScore(100, true)]).toEqual([90, 95, 90, 75, 100]);
  });

  it('withholds the score when the unknown components are worth more than a quarter of the points', () => {
    // Four minerals missing from half the foods: 20 of 55 points unknown.
    const blank = dates.map((d) => {
      const u = usual(d);
      return { ...u, items: u.items.map((it, i) => (i < 2 ? { ...it, nutrients: { ...it.nutrients, calcium: null, iron: null, magnesium: null, zinc: null } } : it)) };
    });
    const r = reportOf(blank);
    expect(r.score.value).toBeNull();
    expect(r.score.withheld).toBe('thin_data');
    expect(r.score.components.filter((c) => !c.scorable).map((c) => c.id)).toEqual(['calcium', 'iron', 'magnesium', 'zinc']);
    expect(REPORT_CONFIG.maxUnknownShare).toBe(0.25);
  });

  it('counts a component as unknown below 80% coverage, and as known at 80%', () => {
    const at = (share: number) =>
      dates.map((d) => day(d, [item(1000 * share, { protein: 60 }), item(1000 * (1 - share), { protein: null, fiber: 20, potassium: 2000, calcium: 800, iron: 12, magnesium: 250, zinc: 7, sodium: 800 })]));
    const protein = (days: IntakeDay[]) => computeScore(input(days)).components.find((c) => c.id === 'protein')!;
    expect(protein(at(0.79)).scorable).toBe(false);
    expect(protein(at(0.8)).scorable).toBe(true);
  });

  it('a limit: a partial total can prove "over" (zero points, scorable) but never "within"', () => {
    // 5,000 mg known over 2,000 kcal is 2,500 mg per 1,000 kcal: already past the 2,000 at which credit is zero.
    const over = dates.map((d) => day(d, [item(1000, { sodium: 5000 }), item(1000, { sodium: null })]));
    const within = dates.map((d) => day(d, [item(1000, { sodium: 500 }), item(1000, { sodium: null })]));
    const sodium = (days: IntakeDay[]) => computeScore(input(days)).components.find((c) => c.id === 'sodium')!;
    expect(sodium(over)).toMatchObject({ scorable: true, points: 0 });
    expect(sodium(within)).toMatchObject({ scorable: false, points: 0 });
  });
});

describe('withholding', () => {
  it('has nothing to score without days or energy', () => {
    expect(computeScore(input([], [])).value).toBeNull();
    expect(computeScore(input(dates.map((d) => day(d)))).value).toBeNull();
  });

  it('is withheld next to a very low intake: three days under the floor', () => {
    // 1,000 kcal a day, marked complete so the days count: the score has nothing to say beside that.
    const low = dates.map((d) => ({ ...usual(d), mark: 'complete' as const })).map((d) => ({ ...d, items: d.items.map((it) => ({ ...it, nutrients: Object.fromEntries(Object.entries(it.nutrients).map(([k, v]) => [k, (v as number) / 1.8])) })) }));
    const r = reportOf(low);
    expect(r.score.withheld).toBe('low_intake');
    expect(r.score.value).toBeNull();
    expect(r.coverage.days.filter((d) => d.lowIntake)).toHaveLength(7);
    // Two low days do not withhold it.
    const two = dates.map((d, i) => (i < 2 ? low[i]! : usual(d)));
    expect(reportOf(two).score.withheld).toBeUndefined();
  });

  it('shows the leave-one-day-out range with four or five days, none with three, six or seven', () => {
    const base = randomWeek(rng(3), 7);
    const range = (n: number) => reportOf(base.map((d, i) => (i < n ? d : day(d.date)))).score.range;
    expect(range(3)).toBeNull();
    expect(range(4)).not.toBeNull();
    expect(range(5)).not.toBeNull();
    expect(range(6)).toBeNull();
    expect(range(7)).toBeNull();
    // The leave-one-day-out values bracket the full score when every component is known.
    const r4 = base.slice(0, 4);
    const full = score(r4)!;
    const [lo, hi] = jackknife(input(r4))!;
    expect(lo).toBeLessThanOrEqual(full + 1e-9);
    expect(hi).toBeGreaterThanOrEqual(full - 1e-9);
  });
});

describe('properties, over random weeks from a fixed seed', () => {
  const N = 300;

  it('1. missing data never raises the score: blank values at random and the score only falls, becomes "at least N", or is withheld', () => {
    const r = rng(101);
    const KEYS: NutrientKey[] = ['protein', 'fiber', 'potassium', 'calcium', 'iron', 'magnesium', 'zinc', 'sodium'];
    let scored = 0;
    let rose = 0;
    for (let n = 0; n < N; n++) {
      const days = randomWeek(r, 4 + Math.floor(r() * 4));
      const before = score(days);
      expect(before).not.toBeNull();
      scored++;
      const level = pick(r, [0.05, 0.15, 0.4]);
      const blanked = mapItems(days, (it) => ({ ...it, nutrients: Object.fromEntries(Object.entries(it.nutrients).map(([k, v]) => [k, k !== 'calories' && KEYS.includes(k as NutrientKey) && r() < level ? null : v])) }) as IntakeItem);
      const after = score(blanked);
      if (after !== null && after > before! + 1e-9) rose++;
    }
    expect(scored).toBe(N);
    expect(rose).toBe(0);
  });

  it('2. scale invariance: scaling every logged quantity by 0.9 to 3 leaves the score unchanged (it is a density)', () => {
    const r = rng(202);
    for (let n = 0; n < N; n++) {
      const days = randomWeek(r, 7);
      const factor = uniform(r, 0.9, 3);
      expect(score(scaled(days, factor)), `factor ${factor}`).toBeCloseTo(score(days)!, 9);
    }
    // ... while the energy card and the absolute rows DO respond.
    const days = randomWeek(rng(7), 7);
    const a = reportOf(days);
    const b = reportOf(scaled(days, 2));
    expect(b.energy!.meanKcal!).toBeGreaterThan(a.energy!.meanKcal! * 1.9);
    expect(b.score.value).toBe(a.score.value);
  });

  it('3. monotone in the right direction: more sodium, or less of a minimum nutrient, never raises the score', () => {
    const r = rng(303);
    for (let n = 0; n < N; n++) {
      const days = randomWeek(r, 7);
      const base = score(days)!;
      const more = uniform(r, 1.01, 3);
      const sodiumUp = mapItems(days, (it) => ({ ...it, nutrients: { ...it.nutrients, sodium: (it.nutrients.sodium as number) * more } }));
      expect(score(sodiumUp)!, 'more sodium').toBeLessThanOrEqual(base + 1e-9);
      for (const k of ['protein', 'fiber', 'potassium', 'calcium', 'iron', 'magnesium', 'zinc'] as const) {
        const less = uniform(r, 0.1, 0.99);
        const down = mapItems(days, (it) => ({ ...it, nutrients: { ...it.nutrients, [k]: (it.nutrients[k] as number) * less } }));
        expect(score(down)!, `less ${k}`).toBeLessThanOrEqual(base + 1e-9);
      }
    }
  });

  it('4. bounds: the score is between 0 and 100, and the leave-one-day-out range contains it', () => {
    const r = rng(404);
    for (let n = 0; n < N; n++) {
      const days = randomWeek(r, 4 + Math.floor(r() * 4));
      const v = score(days)!;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
      const range = jackknife(input(days))!;
      expect(range[0]).toBeLessThanOrEqual(v + 1e-9);
      expect(range[1]).toBeGreaterThanOrEqual(v - 1e-9);
    }
  });

  it("5. pooling: a day identical to the week's mean, added to the week, leaves the score unchanged", () => {
    const r = rng(505);
    for (let n = 0; n < N; n++) {
      const six = randomWeek(r, 6);
      const totals = (k: NutrientKey | 'calories') => six.reduce((s, d) => s + d.items.reduce((t, it) => t + ((it.nutrients[k] as number) ?? 0), 0), 0) / 6;
      const meanDay = day(dates[6]!, [item(totals('calories'), Object.fromEntries((['protein', 'fiber', 'potassium', 'calcium', 'iron', 'magnesium', 'zinc', 'sodium'] as const).map((k) => [k, totals(k)])))]);
      expect(score([...six, meanDay]), `week ${n}`).toBeCloseTo(score(six)!, 9);
    }
  });

  it('is unchanged by which nutrients a custom target overrides: the standards are fixed reference values (plan 6.1)', () => {
    const days = dates.map((d) => usual(d));
    const plain = reportOf(days);
    const custom = reportOf(days, { overrides: [{ nutrient: 'protein', value: 200, origin: 'custom' }, { nutrient: 'sodium', value: 1500, origin: 'custom' }] });
    expect(custom.score.value).toBe(plain.score.value);
    // The bar, though, is drawn against the typed number and is labelled as custom.
    const protein = custom.nutrients.find((n) => n.nutrient === 'protein')!;
    expect(protein.target).toMatchObject({ value: 200, origin: 'custom' });
    expect(plain.nutrients.find((n) => n.nutrient === 'protein')!.target).toMatchObject({ value: 60, origin: 'recommended' });
  });
});

describe('the ASHA persona of the plan', () => {
  it('uses the engine numbers: 2,150 kcal, 60 g protein, 30 g fibre, 2,300 mg sodium', () => {
    expect(ASHA).toMatchObject({ energy: 2150, minimums: { protein: 60, fiber: 30 }, limits: { sodium: 2300 } });
  });
});

describe('the moderation components of Phase 4: saturated fat and added sugars (plan 5.5)', () => {
  const cfg = { ...REPORT_CONFIG, moderationComponents: true };
  const known = { protein: 60, fiber: 30, potassium: 2600, calcium: 1000, iron: 18, magnesium: 310, zinc: 8, sodium: 1000 };
  /** Days of 2,000 kcal with every other part known, so only the two moderation parts vary. */
  const week = (extra: Partial<Record<NutrientKey, number | null>>) => dates.map((d) => day(d, [item(2000, { ...known, ...extra })]));
  const score2 = (days: IntakeDay[]) => computeScore(input(days), cfg);
  const part = (r: ReturnType<typeof score2>, id: string) => r.components.find((c) => c.id === id)!;

  it('is off by default: the score is out of 55 and has no such parts', () => {
    const r = computeScore(input(week({ saturatedFat: 10, addedSugar: 10 })));
    expect(r.outOf).toBe(55);
    expect(r.components.map((c) => c.id)).not.toContain('saturated_fat');
  });

  it('adds 20 points when switched on: 75 in all', () => {
    const r = score2(week({ saturatedFat: 15, addedSugar: 25 }));
    expect(r.outOf).toBe(75);
    expect(r.components.map((c) => c.id).slice(-2)).toEqual(['saturated_fat', 'added_sugars']);
  });

  it('saturated fat: full credit at 8% of energy or less, none at 16% or more, linear between (HEI-2020)', () => {
    // 2,000 kcal a day: 8% is 160 kcal = 17.78 g, 16% is 320 kcal = 35.56 g.
    const points = (g: number) => part(score2(week({ saturatedFat: g, addedSugar: 0 })), 'saturated_fat').points;
    expect(points(10)).toBeCloseTo(10, 9);
    expect(points(160 / 9)).toBeCloseTo(10, 9);
    expect(points(240 / 9)).toBeCloseTo(5, 9);
    expect(points(320 / 9)).toBeCloseTo(0, 9);
    expect(points(60)).toBe(0);
  });

  it('added sugars: full credit at 6.5% of energy or less, none at 26% or more (HEI-2020)', () => {
    // 6.5% of 2,000 kcal is 130 kcal = 32.5 g; 26% is 520 kcal = 130 g.
    const points = (g: number) => part(score2(week({ saturatedFat: 0, addedSugar: g })), 'added_sugars').points;
    expect(points(20)).toBeCloseTo(10, 9);
    expect(points(32.5)).toBeCloseTo(10, 9);
    expect(points(81.25)).toBeCloseTo(5, 9);
    expect(points(130)).toBeCloseTo(0, 9);
    expect(points(200)).toBe(0);
  });

  it('an unknown part earns nothing and stays in the denominator: one unknown reads "at least", both unknown withhold the score', () => {
    const oneKnown = score2(week({ saturatedFat: 10, addedSugar: null }));
    expect(part(oneKnown, 'added_sugars')).toMatchObject({ scorable: false, points: 0, outOf: 10 });
    expect(oneKnown.value).toBe(Math.round((1000 * (55 + 10)) / 75) / 10); // 20 points unknown would be 10 of 75 here
    const bothUnknown = score2(week({ saturatedFat: null, addedSugar: null }));
    expect(bothUnknown.value).toBeNull(); // 20 of 75 points unknown is over a quarter
    expect(bothUnknown.components.filter((c) => !c.scorable).map((c) => c.id)).toEqual(['saturated_fat', 'added_sugars']);
  });

  it('a limit with a partial total: it can prove "over" (zero points, scorable) but never "within"', () => {
    // One of the four items has no value; the known part already puts saturated fat over 16% of energy.
    const days = dates.map((d) => day(d, [item(500, { ...known, saturatedFat: 40 }), item(1500, { ...known, saturatedFat: null })]));
    expect(part(score2(days), 'saturated_fat')).toMatchObject({ scorable: true, points: 0 });
    // The same with the known part well inside the limit: it could still be over, so it is unknown.
    const within = dates.map((d) => day(d, [item(500, { ...known, saturatedFat: 1 }), item(1500, { ...known, saturatedFat: null })]));
    expect(part(score2(within), 'saturated_fat')).toMatchObject({ scorable: false, points: 0 });
  });

  it('never raises the score when a value is blanked, over random weeks (the invariant of plan 5.5 with the two new parts)', () => {
    const r = rng(20261012);
    let checked = 0;
    for (let n = 0; n < 150; n++) {
      const base = mapItems(randomWeek(r), (it) => ({ ...it, nutrients: { ...it.nutrients, saturatedFat: Math.round(uniform(r, 4, 40) * 10) / 10, addedSugar: Math.round(uniform(r, 5, 80) * 10) / 10 } }));
      const before = computeScore(input(base), cfg);
      if (before.value === null) continue;
      const blanked = mapItems(base, (it) => (r() < 0.3 ? { ...it, nutrients: { ...it.nutrients, [pick(r, ['saturatedFat', 'addedSugar', 'sodium', 'fiber'] as const)]: null } } : it));
      const after = computeScore(input(blanked), cfg).value;
      checked++;
      if (after !== null) expect(after).toBeLessThanOrEqual(before.value + 1e-9);
    }
    expect(checked).toBeGreaterThan(50);
  });
});
