import {
  addDays,
  addMonths,
  dayHeading,
  formatClock,
  formatDay,
  fullDayLabel,
  localDateIn,
  monthBounds,
  monthLabel,
  monthOf,
  monthWeeks,
  weekStart,
} from '@/utils/dates';

describe('dayHeading', () => {
  const today = '2026-10-11'; // a Sunday

  it('names today and yesterday and spells out the date under them', () => {
    expect(dayHeading('2026-10-11', today)).toEqual({ title: 'Today', subtitle: 'Sunday, October 11' });
    expect(dayHeading('2026-10-10', today)).toEqual({ title: 'Yesterday', subtitle: 'Saturday, October 10' });
  });

  it('uses the weekday as the title for older days of the same year', () => {
    expect(dayHeading('2026-10-07', today)).toEqual({ title: 'Wednesday', subtitle: 'October 7' });
  });

  it('adds the year for another year', () => {
    expect(dayHeading('2025-12-31', today)).toEqual({ title: 'Wednesday', subtitle: 'December 31, 2025' });
  });

  it('works across a month boundary', () => {
    expect(dayHeading('2026-10-01', '2026-10-02')).toEqual({ title: 'Yesterday', subtitle: 'Thursday, October 1' });
  });
});

describe('date helpers', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('finds the Monday of a week, including for a Sunday', () => {
    expect(weekStart('2026-10-05')).toBe('2026-10-05'); // Monday
    expect(weekStart('2026-10-08')).toBe('2026-10-05'); // Thursday
    expect(weekStart('2026-10-11')).toBe('2026-10-05'); // Sunday belongs to the week before it
    expect(weekStart('2026-10-12')).toBe('2026-10-12');
  });

  it('reads the date in the profile time zone, not the phone', () => {
    const instant = new Date('2026-10-11T20:00:00Z'); // already Monday in Kolkata, still Sunday in New York
    expect(localDateIn('Asia/Kolkata', instant)).toBe('2026-10-12');
    expect(localDateIn('America/New_York', instant)).toBe('2026-10-11');
  });

  it('formats days and clock times for people', () => {
    expect(formatDay('2026-10-11', '2026-10-11')).toBe('Today');
    expect(formatDay('2026-10-10', '2026-10-11')).toBe('Yesterday');
    expect(formatClock('20:17')).toBe('8:17 PM');
    expect(formatClock('00:05')).toBe('12:05 AM');
    expect(formatClock('12:00')).toBe('12:00 PM');
    expect(formatClock(null)).toBe('Not set');
  });
});

describe('month helpers (the calendar)', () => {
  it('moves between months across year ends', () => {
    expect(monthOf('2026-10-11')).toBe('2026-10');
    expect(addMonths('2026-10', 1)).toBe('2026-11');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-10', -10)).toBe('2025-12');
    expect(addMonths('2026-10', 0)).toBe('2026-10');
    expect(addMonths('2026-03', 24)).toBe('2028-03');
  });

  it('labels and bounds a month', () => {
    expect(monthLabel('2026-10')).toBe('October 2026');
    expect(monthLabel('2027-01')).toBe('January 2027');
    expect(monthBounds('2026-10')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(monthBounds('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthBounds('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' }); // leap year
    expect(monthBounds('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('keeps every month inside the 62-day range the Worker accepts', () => {
    for (let m = 0; m < 24; m++) {
      const { from, to } = monthBounds(addMonths('2025-01', m));
      const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
      expect(days).toBeGreaterThanOrEqual(28);
      expect(days).toBeLessThanOrEqual(31);
    }
  });

  it('lays a month out as Monday-first weeks', () => {
    // October 2026 starts on a Thursday and has 31 days: three leading blanks, five rows.
    const october = monthWeeks('2026-10');
    expect(october).toHaveLength(5);
    expect(october[0]).toEqual([null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(october[4]).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', null]);
  });

  it('handles a Monday start (no blanks), a Sunday start (six blanks) and a six-row month', () => {
    const feb2021 = monthWeeks('2021-02'); // starts on a Monday, 28 days: exactly four full weeks
    expect(feb2021).toHaveLength(4);
    expect(feb2021[0]![0]).toBe('2021-02-01');
    expect(feb2021.flat().filter(Boolean)).toHaveLength(28);

    const feb2026 = monthWeeks('2026-02'); // starts on a Sunday
    expect(feb2026[0]).toEqual([null, null, null, null, null, null, '2026-02-01']);

    const aug2026 = monthWeeks('2026-08'); // starts on a Saturday and has 31 days: six rows
    expect(aug2026).toHaveLength(6);
    expect(aug2026[5]).toEqual(['2026-08-31', null, null, null, null, null, null]);
  });

  it('always yields full rows that contain each day of the month exactly once, in order', () => {
    for (let m = 0; m < 36; m++) {
      const month = addMonths('2024-01', m);
      const weeks = monthWeeks(month);
      weeks.forEach(week => expect(week).toHaveLength(7));
      const days = weeks.flat().filter((d): d is string => d !== null);
      const { from, to } = monthBounds(month);
      expect(days[0]).toBe(from);
      expect(days[days.length - 1]).toBe(to);
      days.forEach((d, i) => i > 0 && expect(d).toBe(addDays(days[i - 1]!, 1)));
    }
  });

  it('describes a day for screen readers', () => {
    expect(fullDayLabel('2026-10-07')).toBe('Wednesday, October 7');
  });
});
