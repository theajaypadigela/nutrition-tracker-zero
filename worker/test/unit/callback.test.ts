import { describe, expect, it } from 'vitest';
import {
  CALLBACK_FUNCTION,
  CALLBACK_MAX_MINUTES,
  CALLBACK_MIN_MINUTES,
  callbackClock,
  callbackDelayWords,
  callbackReply,
  parseCallbackMinutes,
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
    expect(CALLBACK_FUNCTION.parameters.required).toEqual(['minutes']);
    expect(CALLBACK_FUNCTION.parameters.properties.minutes).toMatchObject({ type: 'integer', minimum: CALLBACK_MIN_MINUTES, maximum: CALLBACK_MAX_MINUTES });
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
