import { LOGGED_UNITS, MEALS } from '../domain/units';
import { weekdayOf } from '../domain/time';
import { planMeals } from './meals';
import { buildFirstMessage, buildSystemPrompt, formatLogged, type LoggedItem } from './prompt';

/**
 * Model / voice / transcriber. PLAN.md §13 input 1: replace with the old dashboard assistant's values
 * once they are available; these are sensible defaults until then.
 */
export const ASSISTANT_DEFAULTS = {
  model: { provider: 'openai', model: 'gpt-4o-mini', temperature: 0.3 },
  voice: { provider: 'vapi', voiceId: 'Neha' },
  transcriber: { provider: 'deepgram', model: 'nova-3', language: 'multi' },
} as const;

export const SAVE_FOODS = 'save_foods';
const WEBHOOK_TIMEOUT_SECONDS = 20;

export interface AssistantInput {
  userId: string;
  name: string;
  localDate: string;
  /** 'HH:MM' in the user's timezone when the call starts; decides which meals to ask about. */
  localTime: string;
  callRowId: number;
  /** https://<worker>/vapi/webhook/<token> */
  webhookUrl: string;
  alreadyLogged: LoggedItem[];
}

export function saveFoodsTool(webhookUrl: string) {
  return {
    type: 'function',
    async: false,
    function: {
      name: SAVE_FOODS,
      description:
        'Save the complete, user-confirmed list of everything eaten today during this call. Call only after the user confirms the read-back.',
      parameters: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'quantity', 'unit'],
              properties: {
                name: { type: 'string', description: 'Food as the user said it, singular' },
                quantity: { type: 'number' },
                unit: { type: 'string', enum: [...LOGGED_UNITS] },
                meal: { type: 'string', enum: [...MEALS] },
              },
            },
          },
        },
      },
    },
    // A tool without server.url becomes client-side on web calls, so it always carries its own.
    server: { url: webhookUrl, timeoutSeconds: WEBHOOK_TIMEOUT_SECONDS },
    messages: [{ type: 'request-start', content: 'Saving that now.' }],
  };
}

/** Inline (transient) assistant for `vapi.start(assistant)` (PLAN.md §9.2). */
export function buildAssistant(input: AssistantInput) {
  const plan = planMeals(input.localTime, input.alreadyLogged.map((i) => i.meal));
  const systemPrompt = buildSystemPrompt({
    name: input.name,
    weekday: weekdayOf(input.localDate),
    localDate: input.localDate,
    localTime: input.localTime,
    alreadyLogged: formatLogged(input.alreadyLogged),
    units: LOGGED_UNITS,
    plan,
  });
  return {
    name: 'Daily food check-in',
    firstMessage: buildFirstMessage(input.name, input.localTime, plan, input.alreadyLogged.length),
    firstMessageMode: 'assistant-speaks-first',
    model: {
      ...ASSISTANT_DEFAULTS.model,
      messages: [{ role: 'system', content: systemPrompt }],
      tools: [saveFoodsTool(input.webhookUrl), { type: 'endCall' }],
    },
    voice: { ...ASSISTANT_DEFAULTS.voice },
    transcriber: { ...ASSISTANT_DEFAULTS.transcriber },
    server: {
      url: input.webhookUrl,
      timeoutSeconds: WEBHOOK_TIMEOUT_SECONDS,
      backoffPlan: { type: 'exponential', maxRetries: 3, baseDelaySeconds: 2 },
    },
    serverMessages: ['tool-calls', 'end-of-call-report'],
    maxDurationSeconds: 600,
    artifactPlan: { recordingEnabled: false },
    // Saves the user's credits. Shape to be confirmed by the Phase 3 spike.
    analysisPlan: { summaryPlan: { enabled: false }, successEvaluationPlan: { enabled: false } },
    metadata: { userId: input.userId, localDate: input.localDate, callRowId: input.callRowId },
  };
}
