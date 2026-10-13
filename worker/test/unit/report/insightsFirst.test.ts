/**
 * The weekly report leads with what was logged and what is missing, not with a score (WEEKLY_BREAKDOWN_PLAN.md 5.1, 5.7, 7.8):
 * each nutrient's average against earlier weeks, the data-quality summary, an insight that names an amount worth a check, and a
 * score that a deployment can leave out altogether.
 */
import { describe, expect, it } from 'vitest';
import { addDays } from '../../../src/domain/time';
import type { IntakeDay } from '../../../src/domain/intake/types';
import { trendAgainst } from '../../../src/domain/report/trend';
import { WEEK, dates, day, item, reportOf, usual } from './helpers';

/** `usual` days for the weeks `back` weeks before the reported one. */
const earlier = (...back: number[]): IntakeDay[] => back.flatMap((w) => dates.map((d) => usual(addDays(d, -7 * w))));
/** An ordinary day with 30 g more protein (and 120 kcal, inside the energy noise). */
const moreProtein = (d: string): IntakeDay => {
  const u = usual(d);
  return { ...u, items: [...u.items, item(120, { protein: 30, fiber: 0, sodium: 0, calcium: 0, iron: 0, potassium: 0, magnesium: 0, zinc: 0 }, { foodId: 'shake', name: 'protein shake' })] };
};
const row = (r: ReturnType<typeof reportOf>, k: string) => r.nutrients.find((n) => n.nutrient === k)!;

describe('trendAgainst: only a change past the noise reads as one (plan 5.7)', () => {
  it('needs three earlier weeks', () => {
    expect(trendAgainst(60, [59, 58])).toBeNull();
    expect(trendAgainst(60, [59, 58, 61])).toMatchObject({ direction: 'about_the_same', weeks: 3 });
  });

  it('reads higher or lower past the larger of 10% of the earlier mean and their spread', () => {
    expect(trendAgainst(66.1, [60, 60, 60])).toMatchObject({ direction: 'higher', previousMean: 60 });
    expect(trendAgainst(66, [60, 60, 60])!.direction).toBe('about_the_same'); // exactly at the band is not past it
    expect(trendAgainst(53.9, [60, 60, 60])!.direction).toBe('lower');
    // A noisy history widens the band: one standard deviation of 50, 60, 70 is about 8.2, under 10% of 60 it would be 6.
    expect(trendAgainst(68, [50, 60, 70])!.direction).toBe('about_the_same');
    expect(trendAgainst(69, [50, 60, 70])!.direction).toBe('higher');
  });
});

describe("each nutrient's average against earlier weeks", () => {
  it('says higher where it moved past the noise, and about the same where it did not', () => {
    const r = reportOf([...earlier(1, 2, 3, 4), ...dates.map(moreProtein)]);
    expect(row(r, 'protein').trend).toEqual({ direction: 'higher', previousMean: 59, weeks: 4 });
    expect(row(r, 'calories').trend).toEqual({ direction: 'about_the_same', previousMean: 1800, weeks: 4 });
    expect(row(r, 'fat').trend).toBeNull(); // no fat values were logged: nothing to compare
  });

  it('works without personal targets: it compares amounts, not verdicts', () => {
    const r = reportOf([...earlier(1, 2, 3), ...dates.map(moreProtein)], { mode: 'generic', targetSets: [] });
    expect(row(r, 'protein').trend).toMatchObject({ direction: 'higher', weeks: 3 });
  });

  it('gives none with fewer than three earlier weeks of at least three counted days, or on a week that cannot be summarised', () => {
    const thin = [...earlier(1, 2), ...dates.slice(0, 2).map((d) => usual(addDays(d, -21))), ...dates.map(moreProtein)];
    expect(row(reportOf(thin), 'protein').trend).toBeNull();
    const twoDays = [...earlier(1, 2, 3, 4), ...dates.map((d, i) => (i < 2 ? moreProtein(d) : day(d)))];
    expect(row(reportOf(twoDays), 'protein').trend).toBeNull();
  });

  it('gives none when this week has values on under 90% of what was logged: a lower bound cannot be compared', () => {
    const gappy = dates.map((d) => {
      const u = usual(d);
      return { ...u, items: u.items.map((it, i) => (i === 1 ? { ...it, nutrients: { ...it.nutrients, protein: null } } : it)) };
    });
    expect(row(reportOf([...earlier(1, 2, 3, 4), ...gappy]), 'protein').trend).toBeNull();
  });

  it('leaves the four-week vitamins without one: they are already a rolling window', () => {
    const r = reportOf([...earlier(1, 2, 3, 4), ...dates.map((d) => usual(d))]);
    expect(r.fourWeek.every((n) => n.trend === null)).toBe(true);
  });
});

describe('what is missing or uncertain (plan 7.8)', () => {
  it('summarises the counted days, and lists unusual amounts on every open day, including one that does not count yet', () => {
    const days = dates.map((d, i) =>
      i === 2
        ? day(d, [item(300, { protein: 5 }, { foodId: 'x', name: 'Kheer', quantity: 12, unit: 'katori', source: 'estimate' })])
        : { ...usual(d), items: usual(d).items.map((it) => ({ ...it, source: 'label' as const })) },
    );
    const r = reportOf(days);
    expect(r.coverage.days[2]!.state).toBe('partial');
    expect(r.quality!.amountsToCheck).toEqual([{ date: dates[2], name: 'Kheer', quantity: 12, unit: 'katori', kcal: 300, reason: 'many_servings' }]);
    // The partial day is not in the figures, so its food is not in the sources or the gaps.
    expect(r.quality!.valueSources).toMatchObject({ label: 1, estimate: 0 });
  });

  it('leaves out days left out and days to come', () => {
    const big = (d: string, mark: IntakeDay['mark'] = null) => day(d, [item(5000, {}, { name: 'Feast', quantity: 1, unit: 'plate' })], mark);
    const r = reportOf(dates.map((d, i) => (i === 0 ? big(d, 'skip') : usual(d))), { today: dates[5]! });
    expect(r.quality!.amountsToCheck).toEqual([]);
    const later = reportOf(dates.map((d, i) => (i === 6 ? big(d) : usual(d))), { today: dates[5]! });
    expect(later.quality!.amountsToCheck).toEqual([]);
  });

  it('is absent with numbers hidden', () => expect(reportOf(dates.map((d) => usual(d)), { numbersHidden: true }).quality).toBeNull());
});

describe('an amount worth a check leads the data insights (plan 7.7)', () => {
  it('names the amount, and replaces the vaguer "check the quantities" for the same day', () => {
    const feast = (d: string) => ({ ...usual(d), items: [...usual(d).items, item(5000, { protein: 100 }, { foodId: 'b', name: 'Biryani', quantity: 2, unit: 'kg' })] });
    const heavy = (d: string) => ({ ...usual(d), items: [...usual(d).items, ...[1, 2, 3].map((k) => item(700, { protein: 20 }, { foodId: `m${k}`, name: `meal ${k}`, quantity: 1, unit: 'plate' }))] });
    const r = reportOf(dates.map((d, i) => (i === 1 ? feast(d) : i === 3 ? heavy(d) : usual(d))));
    const ids = r.insights.map((x) => x.id);
    expect(ids).toContain('check_amounts');
    expect(r.insights.find((x) => x.id === 'check_amounts')!.params).toEqual({ n: 1, name: 'Biryani', quantity: 2, unit: 'kg', date: dates[1] });
    // Tuesday is named by the amount; Thursday has no single odd amount, so it keeps its own prompt.
    expect(r.insights.filter((x) => x.id === 'implausible_day').map((x) => x.params.date)).toEqual([dates[3]]);
  });

  it('is kept, without its numbers, in low-pressure mode', () => {
    const odd = dates.map((d, i) => (i === 1 ? { ...usual(d), items: [...usual(d).items, item(null, {}, { pending: false, name: 'Rice', quantity: 20, unit: 'katori' })] } : usual(d)));
    const r = reportOf(odd, { numbersHidden: true });
    expect(r.insights.find((x) => x.id === 'check_amounts')).toEqual({ id: 'check_amounts', priority: 2, params: {} });
  });
});

describe('the score can be left out altogether (NUTRIENT_SCORE)', () => {
  it('is withheld as "off": nothing computed, no history, no trend, and nothing else in the report changes', () => {
    const days = [...earlier(1, 2, 3, 4), ...dates.map((d) => usual(d))];
    const on = reportOf(days, { weeks: 8 });
    const off = reportOf(days, { weeks: 8, config: { score: false } });
    expect(on.score.shown).toBe(90);
    expect(off.score).toEqual({ value: null, shown: null, isMinimum: false, points: 0, outOf: 0, range: null, components: [], withheld: 'off' });
    expect(off.scoreTrend).toBeNull();
    expect(off.history.map((h) => h.score)).toEqual(Array(8).fill(null));
    expect(off.nutrients).toEqual(on.nutrients);
    expect(off.insights).toEqual(on.insights);
    expect(off.quality).toEqual(on.quality);
    expect(off.week.start).toBe(WEEK);
  });
});
