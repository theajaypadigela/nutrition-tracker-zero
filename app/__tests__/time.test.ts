import { nextDailyOccurrence, parseCallTime } from '@/services/calls/time';

describe('nextDailyOccurrence', () => {
  it('fires later today in Asia/Kolkata', () => {
    const from = Date.parse('2026-10-04T06:00:00Z'); // 11:30 IST
    expect(new Date(nextDailyOccurrence({ hour: 20, minute: 0 }, from, 'Asia/Kolkata')).toISOString()).toBe('2026-10-04T14:30:00.000Z');
  });
  it('rolls to tomorrow once the time has passed', () => {
    const from = Date.parse('2026-10-04T14:30:00Z'); // exactly 20:00 IST
    expect(new Date(nextDailyOccurrence({ hour: 20, minute: 0 }, from, 'Asia/Kolkata')).toISOString()).toBe('2026-10-05T14:30:00.000Z');
  });
  it('keeps wall-clock time across a DST change', () => {
    const from = Date.parse('2026-03-07T12:00:00Z'); // Sat, EST
    const sat = nextDailyOccurrence({ hour: 20, minute: 0 }, from, 'America/New_York');
    const sun = nextDailyOccurrence({ hour: 20, minute: 0 }, sat, 'America/New_York');
    expect(new Date(sat).toISOString()).toBe('2026-03-08T01:00:00.000Z'); // 20:00 EST
    expect(new Date(sun).toISOString()).toBe('2026-03-09T00:00:00.000Z'); // 20:00 EDT
  });
});

describe('parseCallTime', () => {
  it('accepts HH:MM only', () => {
    expect(parseCallTime('07:05')).toEqual({ hour: 7, minute: 5 });
    expect(parseCallTime('24:00')).toBeNull();
    expect(parseCallTime(null)).toBeNull();
  });
});
