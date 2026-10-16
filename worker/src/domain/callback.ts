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

/** The tool, in the provider-neutral form both Deepgram's `think.functions` and Vapi's `function` take. */
export const CALLBACK_FUNCTION = {
  name: CALLBACK_TOOL,
  description:
    'Call this person again later, a number of minutes from now, when they ask to be called back ("call me again in 20 minutes", "remind me after 30 minutes", "I will eat later, call me in an hour"). Convert what they said into whole minutes.',
  parameters: {
    type: 'object',
    required: ['minutes'],
    properties: {
      minutes: {
        type: 'integer',
        minimum: CALLBACK_MIN_MINUTES,
        maximum: CALLBACK_MAX_MINUTES,
        description: 'Whole minutes from now until the call back: "in 20 minutes" is 20, "in half an hour" is 30, "in an hour" is 60, "in two hours" is 120.',
      },
    },
  },
} as const;

export type CallbackRequest = { minutes: number } | { error: string };

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
