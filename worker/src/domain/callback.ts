/**
 * "Can you call me again in 20 minutes?" said during a call (PLAN.md section 13 left it for later). The voice model turns the words into
 * whole minutes and calls `schedule_callback`; the phone then arms a one-shot reminder that rings (Android) or sounds (iOS) at that time,
 * even if the app is closed. This file is pure and shared: the Worker puts the tool in the assistant and answers it when a provider
 * delivers it to the server, and the app (src/services/calls/callback.ts) validates and words it the same way before arming anything.
 */

export const CALLBACK_TOOL = 'schedule_callback';

/** One minute is the least that is worth a ring; twelve hours is the most: the daily call is never further away than a day. */
export const CALLBACK_MIN_MINUTES = 1;
export const CALLBACK_MAX_MINUTES = 720;

/**
 * The tool, in the provider-neutral form both Deepgram's `think.functions` and Vapi's `function` take. A call back is asked for either as a
 * delay ("in 20 minutes": `minutes`) or as a time of day ("at nine pm": `time`); the model gives whichever the person said, and the phone
 * works out the rest, so the model never has to subtract clock times.
 */
export const CALLBACK_FUNCTION = {
  name: CALLBACK_TOOL,
  description:
    'Call this person again later, when they ask to be called back ("call me again in 20 minutes", "remind me after 30 minutes", "I will eat later, call me in an hour", "call me at nine pm"). Give `minutes` when they say how long to wait, or `time` when they say a time of day. Give exactly one of the two.',
  parameters: {
    type: 'object',
    required: [],
    properties: {
      minutes: {
        type: 'integer',
        minimum: CALLBACK_MIN_MINUTES,
        maximum: CALLBACK_MAX_MINUTES,
        description: 'Whole minutes from now, when they say how long: "in 20 minutes" is 20, "in half an hour" is 30, "in an hour" is 60, "in two hours" is 120.',
      },
      time: {
        type: 'string',
        description: 'A time of day in 24-hour HH:MM, in their own local time, when they say a clock time: "at nine pm" is "21:00", "at half past eight in the evening" is "20:30", "at 7" in the morning is "07:00".',
      },
    },
  },
} as const;

export type CallbackRequest = { minutes: number } | { error: string };

/** A call back worked out: how many minutes from now, and the exact moment it rings. */
export type CallbackPlan = { minutes: number; at: number } | { error: string };

function asArguments(raw: unknown): Record<string, unknown> | null {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * The minutes the model asked for, or the sentence it should say back to the person. A fraction rounds to the nearest minute; a number in
 * a string ("20") is accepted, because a model sometimes quotes it. Nothing here guesses what a person meant: that is the model's job.
 */
export function parseCallbackMinutes(raw: unknown): CallbackRequest {
  const args = asArguments(raw);
  const value = args?.minutes ?? args?.delayMinutes ?? args?.delay_minutes;
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    return { error: 'I need to know how many minutes from now to call back. Ask when they would like the call, then try again with the minutes.' };
  }
  const minutes = Math.round(n);
  if (minutes < CALLBACK_MIN_MINUTES) return { error: `The call back has to be at least ${CALLBACK_MIN_MINUTES} minute from now. Ask for a later time.` };
  if (minutes > CALLBACK_MAX_MINUTES) {
    return { error: `I can only call back within ${CALLBACK_MAX_MINUTES / 60} hours. Offer a shorter time; the regular daily call will still come at its usual time.` };
  }
  return { minutes };
}

/** Minutes since local midnight at `at` in `timeZone`. */
function localMinutesOfDay(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return (get('hour') % 24) * 60 + get('minute');
}

/**
 * Whole minutes from `now` to the next time the clock in `timeZone` reads `hhmm` ("21:00"), never zero: this very minute means the next day.
 * Null when `hhmm` is not a time of day. Worked out against the zone's own clock, so a night the clocks change comes out right.
 */
export function minutesUntilClock(hhmm: string, now: number, timeZone: string): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
  if (!m) return null;
  const target = Number(m[1]) * 60 + Number(m[2]);
  let minutes = (target - localMinutesOfDay(now, timeZone) + 1440) % 1440 || 1440;
  // Where that lands on the clock, after any change of the clocks in between: nudge by what is left over (at most a couple of passes).
  for (let pass = 0; pass < 3; pass++) {
    const landed = localMinutesOfDay(now + minutes * 60_000, timeZone);
    const off = ((target - landed + 720 + 1440) % 1440) - 720;
    if (off === 0) break;
    minutes += off;
  }
  return minutes;
}

/**
 * What the model asked for, as a plan: `minutes` from now (an exact delay), or `time` of day (the next time the clock reads it, which rings
 * at the start of that minute). The same limits as `parseCallbackMinutes`: at least a minute away, at most twelve hours.
 */
export function resolveCallback(raw: unknown, now: number, timeZone: string): CallbackPlan {
  const args = asArguments(raw);
  const time = typeof args?.time === 'string' ? args.time : null;
  const hasMinutes = args !== null && (args.minutes ?? args.delayMinutes ?? args.delay_minutes) !== undefined && (args.minutes ?? args.delayMinutes ?? args.delay_minutes) !== null;
  if (time !== null && !hasMinutes) {
    const wait = minutesUntilClock(time, now, timeZone);
    if (wait === null) return { error: 'I could not read that time. Ask what time they would like the call, and give it as hours and minutes in 24-hour form, for example 21:00.' };
    if (wait > CALLBACK_MAX_MINUTES) {
      return { error: `That is more than ${CALLBACK_MAX_MINUTES / 60} hours away. Offer a time within ${CALLBACK_MAX_MINUTES / 60} hours; the regular daily call will still come at its usual time.` };
    }
    const minuteStart = Math.floor(now / 60_000) * 60_000;
    return { minutes: wait, at: minuteStart + wait * 60_000 };
  }
  const asked = parseCallbackMinutes(raw);
  return 'error' in asked ? asked : { minutes: asked.minutes, at: now + asked.minutes * 60_000 };
}

/** "20 minutes", "1 minute", "1 hour", "1 hour 30 minutes", "2 hours": how long it will be, as the person would say it. */
export function callbackDelayWords(minutes: number): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (minutes < 60) return plural(minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? plural(hours, 'hour') : `${plural(hours, 'hour')} ${plural(rest, 'minute')}`;
}

/** "4:20 pm" in the person's time zone, for the reply the voice model reads out and for the screens. */
export function callbackClock(at: number, timeZone: string): string {
  // 24-hour parts, then the am/pm worked out here: the same call time.ts makes, which every JS engine the app runs on supports.
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const hour = get('hour') % 24;
  return `${hour % 12 || 12}:${String(get('minute')).padStart(2, '0')} ${hour < 12 ? 'am' : 'pm'}`;
}

/** What the voice model is told once the reminder is set: the time, so it can say it back, and nothing about how it works. */
export function callbackReply(minutes: number, at: number, timeZone: string): string {
  return `Done. I will call them again in ${callbackDelayWords(minutes)}, at ${callbackClock(at, timeZone)}. Tell them that, then say goodbye and end the call.`;
}
