/** What state a day is in, and how sure the week is (WEEKLY_BREAKDOWN_PLAN.md 7.2, 7.6, 11.5). */
import { describe, expect, it } from 'vitest';
import { dayKcal } from '../../../src/domain/intake/totals';
import { assessedIndices, classifyDay, confidenceOf, isAssessed, type DayLimits } from '../../../src/domain/quality/days';
import { day, item } from '../report/helpers';

const personal = (energy = 2150, floor = 1200, veryHigh = 3500): DayLimits => ({ personal: true, energy, floor, veryHigh });
const generic: DayLimits = { personal: false, energy: null, floor: 1200, veryHigh: 3850 };
const meals = (...kcal: number[]) => kcal.map((k, i) => item(k, { protein: 10 }, { foodId: `f${i}` }));
const TODAY = '2026-10-12';
const PAST = '2026-10-08';

describe('classifyDay (plan 7.2)', () => {
  it('the future is not judged, whatever it holds', () => {
    expect(classifyDay(day('2026-10-13', meals(500)), TODAY, personal()).state).toBe('future');
    expect(classifyDay(day('2026-10-13', meals(500), 'complete'), TODAY, personal()).state).toBe('future');
  });

  it('"leave it out" wins over everything, including today and a complete-looking day', () => {
    expect(classifyDay(day(PAST, meals(2000), 'skip'), TODAY, personal()).state).toBe('skipped');
    expect(classifyDay(day(TODAY, meals(2000), 'skip'), TODAY, personal()).state).toBe('skipped');
  });

  it('today is in progress and never judged, unless the person marked it complete', () => {
    expect(classifyDay(day(TODAY, meals(2000)), TODAY, personal()).state).toBe('in_progress');
    expect(classifyDay(day(TODAY), TODAY, personal()).state).toBe('in_progress');
    expect(classifyDay(day(TODAY, meals(2000), 'complete'), TODAY, personal()).state).toBe('confirmed');
    expect(isAssessed(classifyDay(day(TODAY, meals(2000)), TODAY, personal()).state)).toBe(false);
  });

  it('a complete mark counts the day even with few or no items: a fasting day', () => {
    const c = classifyDay(day(PAST, [], 'complete'), TODAY, personal());
    expect(c.state).toBe('confirmed');
    expect(c.kcal).toBe(0);
    expect(c.lowIntake).toBe(true); // the person says they ate nothing: the low-intake notice still applies
    expect(classifyDay(day(PAST, meals(300), 'complete'), TODAY, personal()).state).toBe('confirmed');
  });

  it('a partial mark is partial, for the reason "marked"', () => {
    expect(classifyDay(day(PAST, meals(2000), 'partial'), TODAY, personal())).toMatchObject({ state: 'partial', reason: 'marked' });
  });

  it('a day nobody logged is empty, not zero intake', () => {
    expect(classifyDay(day(PAST), TODAY, personal())).toMatchObject({ state: 'empty', kcal: 0, lowIntake: false });
  });

  it('a day with more than a third of its items pending is partial; exactly a third is not', () => {
    const pending = (n: number, total: number) => day(PAST, [...meals(800, 800, 800, 800, 800).slice(0, total - n), ...Array.from({ length: n }, () => item(null, {}, { pending: true }))]);
    expect(classifyDay(pending(1, 3), TODAY, personal(1000))).toMatchObject({ state: 'valid' });
    expect(classifyDay(pending(2, 5), TODAY, personal(1000))).toMatchObject({ state: 'partial', reason: 'pending' });
    expect(classifyDay(pending(2, 3), TODAY, personal(1000))).toMatchObject({ state: 'partial', reason: 'pending' });
  });

  it('a day under the larger of 500 kcal and 60% of the person\'s own target is partial', () => {
    // Target 2,150: the edge is 1,290.
    expect(classifyDay(day(PAST, meals(1289)), TODAY, personal(2150))).toMatchObject({ state: 'partial', reason: 'low' });
    expect(classifyDay(day(PAST, meals(1290)), TODAY, personal(2150)).state).toBe('valid');
    // A small target: 60% of 700 is 420, so the 500 floor applies.
    expect(classifyDay(day(PAST, meals(499)), TODAY, personal(700)).state).toBe('partial');
    expect(classifyDay(day(PAST, meals(500)), TODAY, personal(700)).state).toBe('valid');
    // A large target scales the edge up: 60% of 3,000 is 1,800.
    expect(classifyDay(day(PAST, meals(1700)), TODAY, personal(3000)).state).toBe('partial');
  });

  it('generic and reference-only modes have no personal target, so only the 500 kcal floor applies', () => {
    expect(classifyDay(day(PAST, meals(499)), TODAY, generic).state).toBe('partial');
    expect(classifyDay(day(PAST, meals(500)), TODAY, generic).state).toBe('valid');
    expect(classifyDay(day(PAST, meals(900)), TODAY, generic).state).toBe('valid');
  });

  it('counts only resolved items\' energy: a pending item contributes nothing', () => {
    expect(dayKcal(day(PAST, [item(400), item(null, {}, { pending: true })]))).toBe(400);
  });
});

describe('the low-intake flag (plan 7.2, 8.6): every non-empty day under the floor, whatever its state', () => {
  it('flags valid, confirmed and partial days under the floor, and nothing else', () => {
    const t = personal(1500, 1500); // a man: floor 1,500
    expect(classifyDay(day(PAST, meals(1100)), TODAY, t)).toMatchObject({ state: 'valid', lowIntake: true });
    expect(classifyDay(day(PAST, meals(1500)), TODAY, t).lowIntake).toBe(false);
    expect(classifyDay(day(PAST, meals(300)), TODAY, t)).toMatchObject({ state: 'partial', lowIntake: true });
    expect(classifyDay(day(PAST, meals(300), 'partial'), TODAY, t).lowIntake).toBe(true);
    expect(classifyDay(day(PAST), TODAY, t).lowIntake).toBe(false);
    expect(classifyDay(day(PAST, meals(300), 'skip'), TODAY, t).lowIntake).toBe(false);
    expect(classifyDay(day(TODAY, meals(300)), TODAY, t).lowIntake).toBe(false);
  });
});

describe('implausibly high days (plan 7.2): counted, but flagged for a check', () => {
  it('flag above the sex-specific cut-off: 3,500 female, 4,200 male, 3,850 average and generic', () => {
    expect(classifyDay(day(PAST, meals(3500)), TODAY, personal(2150, 1200, 3500))).toMatchObject({ state: 'valid', veryHigh: false });
    expect(classifyDay(day(PAST, meals(3501)), TODAY, personal(2150, 1200, 3500))).toMatchObject({ state: 'valid', veryHigh: true });
    expect(classifyDay(day(PAST, meals(4100)), TODAY, personal(3000, 1500, 4200)).veryHigh).toBe(false);
    expect(classifyDay(day(PAST, meals(4300)), TODAY, personal(3000, 1500, 4200)).veryHigh).toBe(true);
    expect(classifyDay(day(PAST, meals(3900)), TODAY, generic).veryHigh).toBe(true);
    expect(classifyDay(day(PAST, meals(3800)), TODAY, generic).veryHigh).toBe(false);
  });
});

describe('how sure the week is (plan 7.6)', () => {
  const conf = (assessedDays: number, pendingItems = 0, totalItems = 20, weekendAssessedDays = 1) => confidenceOf({ assessedDays, pendingItems, totalItems, weekendAssessedDays });
  it('is not enough under three days, rough at three, fair at four or five, and good at six or seven with little pending and a weekend day', () => {
    expect([0, 1, 2].map((n) => conf(n))).toEqual(['insufficient', 'insufficient', 'insufficient']);
    expect(conf(3)).toBe('rough');
    expect([conf(4), conf(5)]).toEqual(['fair', 'fair']);
    expect([conf(6), conf(7)]).toEqual(['good', 'good']);
  });

  it('is only fair with six or seven days if more than 10% of items are pending, or no weekend day is included', () => {
    expect(conf(7, 2, 20)).toBe('good'); // exactly 10%
    expect(conf(7, 3, 20)).toBe('fair');
    expect(conf(6, 0, 20, 0)).toBe('fair');
    expect(conf(7, 0, 0)).toBe('good');
  });

  it('lists the days that count', () => {
    expect(assessedIndices(['valid', 'partial', 'confirmed', 'empty', 'skipped', 'in_progress', 'future'])).toEqual([0, 2]);
  });
});
