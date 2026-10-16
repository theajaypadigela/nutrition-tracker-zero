import { describe, expect, it } from 'vitest';
import {
  CALLBACK_FUNCTION,
  CALLBACK_MAX_MINUTES,
  CALLBACK_MIN_MINUTES,
  callbackClock,
  callbackDelayWords,
  callbackReply,
  minutesUntilClock,
  parseCallbackMinutes,
  resolveCallback,
} from '../../src/domain/callback';

describe('parseCallbackMinutes', () => {
  it.each([
    [{ minutes: 20 }, 20],
    [{ minutes: '10' }, 10],
    [{ minutes: 30.4 }, 30],
    [{ minutes: 59.6 }, 60],
    [{ minutes: 1 }, 1],
    [{ minutes: 720 }, 720],
    [JSON.stringify({ minutes: 45 }), 45],
    [{ delayMinutes: 15 }, 15],
    [{ delay_minutes: '25' }, 25],
  ])('reads %j as %s minutes', (raw, minutes) => {
    expect(parseCallbackMinutes(raw)).toEqual({ minutes });
  });

  it.each([[{}], [null], [undefined], ['soon'], [{ minutes: 'soon' }], [{ minutes: '' }], [{ minutes: NaN }], [{ minutes: Infinity }], [[20]], ['{bad json']])(
    'asks the model for the minutes when it gets %j',
    (raw) => {
      expect(parseCallbackMinutes(raw)).toEqual({ error: expect.stringContaining('how many minutes') });
    },
  );

  it('refuses a call back that is not in the future or is more than twelve hours away, saying what to offer', () => {
    expect(parseCallbackMinutes({ minutes: 0 })).toEqual({ error: expect.stringContaining('at least 1 minute') });
    expect(parseCallbackMinutes({ minutes: 0.4 })).toEqual({ error: expect.stringContaining('at least 1 minute') });
    expect(parseCallbackMinutes({ minutes: -10 })).toEqual({ error: expect.stringContaining('at least 1 minute') });
    expect(parseCallbackMinutes({ minutes: 721 })).toEqual({ error: expect.stringContaining('within 12 hours') });
    expect(parseCallbackMinutes({ minutes: 100000 })).toEqual({ error: expect.stringContaining('regular daily call') });
  });

  it('keeps the schema the model sees in step with the limits the parser enforces', () => {
    expect(CALLBACK_FUNCTION.name).toBe('schedule_callback');
    // a delay or a time of day, never both required: the model gives what the person said
    expect(CALLBACK_FUNCTION.parameters.required).toEqual([]);
    expect(CALLBACK_FUNCTION.parameters.properties.minutes).toMatchObject({ type: 'integer', minimum: CALLBACK_MIN_MINUTES, maximum: CALLBACK_MAX_MINUTES });
    expect(CALLBACK_FUNCTION.parameters.properties.time).toMatchObject({ type: 'string' });
    expect(CALLBACK_FUNCTION.parameters.properties.time.description).toContain('"21:00"');
  });
});

describe('how a delay is said', () => {
  it.each([
    [1, '1 minute'],
    [20, '20 minutes'],
    [59, '59 minutes'],
    [60, '1 hour'],
    [90, '1 hour 30 minutes'],
    [120, '2 hours'],
    [121, '2 hours 1 minute'],
    [720, '12 hours'],
  ])('%s minutes is "%s"', (minutes, words) => {
    expect(callbackDelayWords(minutes)).toBe(words);
  });

  it('writes the clock in the person\'s own time zone, across midnight and the 12 o\'clock edges', () => {
    const noonUtc = Date.UTC(2026, 9, 17, 12, 0, 0);
    expect(callbackClock(noonUtc, 'UTC')).toBe('12:00 pm');
    expect(callbackClock(noonUtc, 'Asia/Kolkata')).toBe('5:30 pm');
    expect(callbackClock(Date.UTC(2026, 9, 17, 0, 5, 0), 'UTC')).toBe('12:05 am');
    expect(callbackClock(Date.UTC(2026, 9, 17, 18, 40, 0), 'Asia/Kolkata')).toBe('12:10 am'); // 00:10 the next day there
    expect(callbackClock(Date.UTC(2026, 9, 17, 23, 59, 0), 'UTC')).toBe('11:59 pm');
  });

  it('tells the model what to say and what to do next', () => {
    const at = Date.UTC(2026, 9, 17, 10, 50, 0);
    expect(callbackReply(20, at, 'Asia/Kolkata')).toBe('Done. I will call them again in 20 minutes, at 4:20 pm. Tell them that, then say goodbye and end the call.');
  });
});


describe('a call back asked for as a time of day', () => {
  // 8:15 pm in Kolkata on 17 October 2026, and 20 seconds into the minute
  const NOW = Date.UTC(2026, 9, 17, 14, 45, 20);
  const KOL = 'Asia/Kolkata';

  it('counts the minutes to the next time the clock reads that', () => {
    expect(minutesUntilClock('21:00', NOW, KOL)).toBe(45);
    expect(minutesUntilClock('20:30', NOW, KOL)).toBe(15);
    expect(minutesUntilClock('9:00', NOW, KOL)).toBe(12 * 60 + 45); // 9 am tomorrow: nine and a quarter hours past midnight... 12h45
    expect(minutesUntilClock('07:00', Date.UTC(2026, 9, 17, 18, 0, 0), KOL)).toBe(450); // 11:30 pm now: 7 am is 7.5 hours away
  });

  it('never answers zero: this very minute means tomorrow', () => {
    expect(minutesUntilClock('20:15', NOW, KOL)).toBe(24 * 60);
    expect(minutesUntilClock('20:16', NOW, KOL)).toBe(1);
  });

  it('refuses what is not a time of day', () => {
    for (const bad of ['', 'nine', '25:00', '21:60', '9pm', '21', '-1:00', '12:5']) expect(minutesUntilClock(bad, NOW, KOL)).toBeNull();
  });

  it('comes out right on the night the clocks change (New York, 8 November 2026: 2:00 am falls back to 1:00 am)', () => {
    // 12:30 am EDT on the 8th; 3:00 am the same morning reads 2.5 hours later on the clock but is 3.5 hours later, because the 1 am hour happens twice
    const half = Date.UTC(2026, 10, 8, 4, 30, 0); // 00:30 EDT
    expect(minutesUntilClock('03:00', half, 'America/New_York')).toBe(3 * 60 + 30);
    // and in spring (8 March 2026: 2:00 am jumps to 3:00 am): 1:30 am EST to 4:00 am is 1.5 hours, not 2.5
    const spring = Date.UTC(2026, 2, 8, 6, 30, 0); // 01:30 EST
    expect(minutesUntilClock('04:00', spring, 'America/New_York')).toBe(90);
  });

  it('plans a delay as that long from now, and a time of day as the start of that minute', () => {
    expect(resolveCallback({ minutes: 20 }, NOW, KOL)).toEqual({ minutes: 20, at: NOW + 20 * 60_000 });
    expect(resolveCallback({ time: '21:00' }, NOW, KOL)).toEqual({ minutes: 45, at: Date.UTC(2026, 9, 17, 15, 30, 0) });
    expect(callbackClock(Date.UTC(2026, 9, 17, 15, 30, 0), KOL)).toBe('9:00 pm');
    expect(resolveCallback(JSON.stringify({ time: ' 21:00 ' }), NOW, KOL)).toMatchObject({ minutes: 45 });
  });

  it('takes the delay when both are given, and the time only when there are no minutes', () => {
    expect(resolveCallback({ minutes: 10, time: '21:00' }, NOW, KOL)).toEqual({ minutes: 10, at: NOW + 10 * 60_000 });
    expect(resolveCallback({ minutes: null, time: '21:00' }, NOW, KOL)).toMatchObject({ minutes: 45 });
  });

  it('keeps the same limits: at least a minute, at most twelve hours, and a time it can read', () => {
    expect(resolveCallback({ time: '20:15' }, NOW, KOL)).toEqual({ error: expect.stringContaining('more than 12 hours') }); // tomorrow, 24 hours
    expect(resolveCallback({ time: '09:30' }, NOW, KOL)).toEqual({ error: expect.stringContaining('more than 12 hours') }); // 13 hours
    expect(resolveCallback({ time: 'nine pm' }, NOW, KOL)).toEqual({ error: expect.stringContaining('24-hour') });
    expect(resolveCallback({}, NOW, KOL)).toEqual({ error: expect.stringContaining('how many minutes') });
    expect(resolveCallback({ minutes: 721 }, NOW, KOL)).toEqual({ error: expect.stringContaining('within 12 hours') });
  });

  it('lets a person in another time zone have their own clock: the same instant is a different 9 pm', () => {
    // 14:45 UTC is 10:45 am in New York in October (UTC-4): 9 pm there is ten and a quarter hours away, not 45 minutes
    expect(resolveCallback({ time: '21:00' }, NOW, 'America/New_York')).toEqual({ minutes: 10 * 60 + 15, at: Date.UTC(2026, 9, 18, 1, 0, 0) });
  });
});
