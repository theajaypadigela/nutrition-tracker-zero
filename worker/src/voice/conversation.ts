// Share meal rules and the completion question across voice providers.
import { buildFirstMessage, buildSystemPrompt, formatLogged } from '../vapi/prompt';
import { planMeals } from '../vapi/meals';
import { LOGGED_UNITS, MEALS } from '../domain/units';
import { weekdayOf } from '../domain/time';
import type { VoiceContext } from './provider';

export function conversation(c: VoiceContext) {
  const plan = planMeals(c.localTime, c.alreadyLogged.map(i => i.meal));
  return {
    greeting: buildFirstMessage(c.user.name, c.localTime, plan, c.alreadyLogged.length),
    prompt: buildSystemPrompt({ name: c.user.name, weekday: weekdayOf(c.localDate), localDate: c.localDate,
      localTime: c.localTime, alreadyLogged: formatLogged(c.alreadyLogged), units: LOGGED_UNITS, plan }) +
      '\nWait for the save_foods result. If it reports an error, explain briefly, correct the list and retry; never say it was saved before success. To finish this conversation, you MUST call end_call with your short goodbye in its message argument. The app speaks that message and hangs up. Do not speak a separate goodbye or stop responding without calling end_call. This also applies when there is nothing to save. Do not call end_call before all saves have completed and the user has answered the day-completion question (unless they want to stop early).',
    functions: [
      { name: 'save_foods', description: 'Save the complete user-confirmed list of new foods from this call; corrections replace that list.',
        parameters: { type: 'object', required: ['items'], properties: { items: { type: 'array', items: {
          type: 'object', required: ['name', 'quantity', 'unit'], properties: {
            name: { type: 'string' }, quantity: { type: 'number' }, unit: { type: 'string', enum: [...LOGGED_UNITS] },
            meal: { type: 'string', enum: [...MEALS] },
          },
        } } } } },
      { name: 'mark_day_complete', description: 'Mark the call day complete only after an explicit yes to "Should I mark this day as complete?" Never call for food read-back confirmation alone.',
        parameters: { type: 'object', required: ['confirmed'], properties: {
          confirmed: { type: 'boolean', enum: [true], description: 'True only when the user explicitly agrees to mark the whole day complete.' },
        } } },
      { name: 'end_call', description: 'Speak a short goodbye and end the conversation. Required after saves and the day-completion question, or when the user wants to stop early.',
        parameters: { type: 'object', required: ['message'], properties: {
          message: { type: 'string', description: 'The short goodbye that the app will speak before hanging up.' },
        } } },
    ],
  };
}
