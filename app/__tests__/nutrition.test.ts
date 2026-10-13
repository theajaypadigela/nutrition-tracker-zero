import type { DayRange, NutrientInfo } from '@/api/types';
import type { WeeklyNutrient } from '@/types/nutrition';
import {
  fmtNum,
  gradeOf,
  inferDirection,
  scoreOf,
  statusLabel,
  statusOf,
  statusTone,
  verdictOf,
  weekRangeLabel,
} from '@/utils/nutrition';
import { buildWeeklyNutrients, daysElapsed } from '@/utils/week';

const n = (amount: number, goal: number, dir: WeeklyNutrient['dir']) => ({ amount, goal, dir });

describe('statusOf', () => {
  it('rates nutrients you want more of (higher)', () => {
    expect(statusOf(n(100, 100, 'higher'))).toBe('good');
    expect(statusOf(n(150, 100, 'higher'))).toBe('good');
    expect(statusOf(n(80, 100, 'higher'))).toBe('warn');
    expect(statusOf(n(79, 100, 'higher'))).toBe('bad');
  });

  it('rates limits (lower)', () => {
    expect(statusOf(n(100, 100, 'lower'))).toBe('good');
    expect(statusOf(n(115, 100, 'lower'))).toBe('warn');
    expect(statusOf(n(116, 100, 'lower'))).toBe('bad');
  });

  it('rates a target range (window) on both sides', () => {
    expect(statusOf(n(90, 100, 'window'))).toBe('good');
    expect(statusOf(n(110, 100, 'window'))).toBe('good');
    expect(statusOf(n(75, 100, 'window'))).toBe('warn');
    expect(statusOf(n(125, 100, 'window'))).toBe('warn');
    expect(statusOf(n(74, 100, 'window'))).toBe('bad');
    expect(statusOf(n(126, 100, 'window'))).toBe('bad');
  });

  it('gives no verdict (warn) when there is no goal', () => {
    expect(statusOf(n(50, 0, 'higher'))).toBe('warn');
  });

  it('describes the verdict in words and maps it to a badge tone', () => {
    expect(statusLabel(n(100, 100, 'higher'))).toBe('Goal met');
    expect(statusLabel(n(85, 100, 'higher'))).toBe('Almost there');
    expect(statusLabel(n(10, 100, 'higher'))).toBe('Below goal');
    expect(statusLabel(n(90, 100, 'lower'))).toBe('Within limit');
    expect(statusLabel(n(200, 100, 'lower'))).toBe('Over limit');
    expect(statusLabel(n(100, 100, 'window'))).toBe('In range');
    expect(statusTone).toEqual({ good: 'success', warn: 'warning', bad: 'danger' });
  });
});

describe('score, verdict and grade', () => {
  const rows = (...statuses: ('good' | 'warn' | 'bad')[]): WeeklyNutrient[] =>
    statuses.map((s, i) => ({
      id: String(i),
      name: String(i),
      unit: 'g',
      amount: s === 'good' ? 100 : s === 'warn' ? 85 : 10,
      goal: 100,
      dailyGoal: 10,
      dir: 'higher',
      trend: [],
      loggedDays: 1,
    }));

  it('averages 100 / 70 / 30 per status', () => {
    expect(scoreOf([])).toBe(0);
    expect(scoreOf(rows('good', 'good'))).toBe(100);
    expect(scoreOf(rows('good', 'warn', 'bad'))).toBe(67);
    expect(scoreOf(rows('bad'))).toBe(30);
  });

  it('turns a score into a verdict and a grade at the documented boundaries', () => {
    expect([90, 80, 70, 60, 59].map(verdictOf)).toEqual([
      'Excellent week',
      'Strong week',
      'Good, room to grow',
      'Mixed week',
      'Needs attention',
    ]);
    expect([95, 90, 85, 80, 75, 70, 65, 60, 59].map(gradeOf)).toEqual(['A', 'A', 'A-', 'A-', 'B+', 'B', 'C', 'C', 'D']);
  });
});

describe('formatting and direction', () => {
  it('fmtNum keeps numbers short and trims zeros', () => {
    expect(fmtNum(0)).toBe('0');
    expect(fmtNum(0.4)).toBe('0.4');
    expect(fmtNum(3.5)).toBe('3.5');
    expect(fmtNum(12)).toBe('12');
    expect(fmtNum(12.34)).toBe('12.3');
    expect(fmtNum(1234.6)).toBe('1235');
    expect(fmtNum(70, 'g')).toBe('70 g');
  });

  it('infers whether more or less is better from the name', () => {
    expect(inferDirection('Sodium')).toBe('lower');
    expect(inferDirection('Sugar')).toBe('lower');
    expect(inferDirection('Calories')).toBe('window');
    expect(inferDirection('Fat')).toBe('window');
    expect(inferDirection('Protein')).toBe('higher');
    expect(inferDirection('Vitamin C')).toBe('higher');
    expect(inferDirection('Saturated fat')).toBe('lower');
  });

  it('labels a week', () => {
    expect(weekRangeLabel('2026-10-05')).toBe('Oct 5 – Oct 11');
    expect(weekRangeLabel('2026-12-28')).toBe('Dec 28 – Jan 3');
  });
});

describe('weekly view models', () => {
  const nutrients: NutrientInfo[] = [
    { key: 'calories', label: 'Calories', unit: 'kcal', defaultGoal: 2500 },
    { key: 'sodium', label: 'Sodium', unit: 'mg', defaultGoal: 2300 },
  ];
  const day = (date: string, calories: number, itemCount = 1) => ({
    date,
    itemCount,
    pendingCount: 0,
    totals: { calories: { value: calories, missingItems: 0 } },
  });
  const range: DayRange = {
    from: '2026-10-05',
    to: '2026-10-11',
    days: [day('2026-10-05', 1800), day('2026-10-06', 0, 0), day('2026-10-07', 2200), day('2026-10-08', 999)],
    goals: { calories: 2000, sodium: null },
  };

  it('counts the days of a week that have started', () => {
    expect(daysElapsed('2026-10-05', '2026-10-05')).toBe(1);
    expect(daysElapsed('2026-10-05', '2026-10-07')).toBe(3);
    expect(daysElapsed('2026-10-05', '2026-10-11')).toBe(7);
    expect(daysElapsed('2026-10-05', '2026-10-20')).toBe(7);
    expect(daysElapsed('2026-10-12', '2026-10-11')).toBe(0);
  });

  it('prorates the goal to the days elapsed and ignores days that have not happened', () => {
    const [calories, sodium] = buildWeeklyNutrients(range, '2026-10-05', '2026-10-07', nutrients);
    // Wednesday: Monday and Wednesday count, the 999 logged on Thursday does not.
    expect(calories!.trend).toEqual([1800, 0, 2200, 0, 0, 0, 0]);
    expect(calories!.amount).toBe(4000);
    expect(calories!.goal).toBe(2000 * 3);
    expect(calories!.dailyGoal).toBe(2000);
    expect(calories!.loggedDays).toBe(2);
    expect(calories!.dir).toBe('window');
    // No goal → no prorated goal, and the direction still comes from the name.
    expect(sodium!.goal).toBe(0);
    expect(sodium!.dailyGoal).toBeNull();
    expect(sodium!.dir).toBe('lower');
  });
});
