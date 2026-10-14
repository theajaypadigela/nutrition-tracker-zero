import { describe, expect, it } from 'vitest';
import { buildAssistant } from '../../src/vapi/assistant';
import { planMeals } from '../../src/vapi/meals';
import { buildFirstMessage, formatClock } from '../../src/vapi/prompt';
import { localTimeIn } from '../../src/domain/time';
import { endOfCallReportOf, isStartFailure, metadataOf, parseArguments, toolCallsOf } from '../../src/vapi/parse';
import { LOGGED_UNITS } from '../../src/domain/units';

describe('buildAssistant on the phone (webhookUrl null)', () => {
  const a = buildAssistant({
    userId: 'u1',
    name: 'Asha Rao',
    localDate: '2026-10-04',
    localTime: '13:05',
    callRowId: 7,
    webhookUrl: null,
    alreadyLogged: [],
  });
  const tool = a.model.tools[0] as ReturnType<typeof import('../../src/vapi/assistant').saveFoodsTool>;

  it('makes save_foods a client-side tool the model does not wait on', () => {
    expect(tool.function.name).toBe('save_foods');
    expect(tool.async).toBe(true);
    expect('server' in tool).toBe(false);
  });
  it('sends nothing to a server and listens for the messages the app needs', () => {
    const loose = a as Record<string, unknown>;
    expect('server' in loose).toBe(false);
    expect('serverMessages' in loose).toBe(false);
    expect(loose.clientMessages).toEqual(['tool-calls', 'transcript', 'conversation-update', 'speech-update', 'status-update']);
    expect(JSON.stringify(a)).not.toMatch(/https?:\/\//);
  });
  it('tells the model no reply comes back, so it neither waits nor saves twice', () => {
    const prompt = a.model.messages[0]!.content;
    expect(prompt).toContain('sends no reply');
    expect(prompt).toContain('do not call it a second time');
  });
});

describe('buildAssistant', () => {
  const a = buildAssistant({
    userId: 'u1',
    name: 'Asha Rao',
    localDate: '2026-10-04',
    localTime: '13:05',
    callRowId: 7,
    webhookUrl: 'https://w.example/vapi/webhook/tok',
    alreadyLogged: [{ raw_name: 'idli', quantity: 2, unit: 'piece', meal: 'breakfast' }],
  });
  const tool = a.model.tools[0] as ReturnType<typeof import('../../src/vapi/assistant').saveFoodsTool>;

  it('points the tool and the assistant at the webhook', () => {
    expect(tool.server?.url).toBe('https://w.example/vapi/webhook/tok');
    const loose = a as Record<string, any>;
    expect(loose.server.url).toBe('https://w.example/vapi/webhook/tok');
    expect(loose.serverMessages).toEqual(['tool-calls', 'end-of-call-report']);
    expect('clientMessages' in loose).toBe(false);
    expect(tool.async).toBe(false);
    expect(a.model.messages[0]!.content).not.toContain('sends no reply');
  });

  it('asks the assistant to check an unusually large amount before recording it (plan 7.7)', () => {
    const prompt = a.model.messages[0]!.content;
    expect(prompt).toContain('If an amount sounds unusually large');
    expect(prompt).toContain('say it back and check it before you record it');
    expect(prompt).not.toMatch(/calorie target|weight|BMI/i);
  });

  it('uses the shared unit list in the tool enum and the prompt', () => {
    expect(tool.function.parameters.properties.items.items.properties.unit.enum).toEqual([...LOGGED_UNITS]);
    expect(a.model.messages[0]!.content).toContain(LOGGED_UNITS.join(', '));
  });
  it('includes time, date, weekday and already-logged context', () => {
    const prompt = a.model.messages[0]!.content;
    expect(prompt).toContain('It is 1:05 pm on Sunday, 2026-10-04, their local time.');
    expect(prompt).toContain('2 piece idli (breakfast)');
    expect(a.firstMessage).toBe(
      "Good afternoon, Asha! Quick food check-in. I already have your breakfast. Let's go meal by meal. Have you had lunch yet?",
    );
  });
  it('walks only the meals that make sense at this time, skipping logged ones', () => {
    const prompt = a.model.messages[0]!.content;
    expect(prompt).toContain("- lunch: first ask whether they've had lunch yet; if not, skip it.");
    expect(prompt).toContain('- snacks and drinks between meals');
    expect(prompt).not.toContain('- breakfast:');
    expect(prompt).not.toContain('- dinner:');
    expect(prompt).toContain("Don't ask about: breakfast (already logged); dinner (still ahead today).");
    expect(prompt).toContain('wish them a nice dinner');
  });
  it('has endCall, no recording, metadata, 10 min cap', () => {
    expect(a.model.tools[1]).toMatchObject({ function: { name: 'mark_day_complete', parameters: { required: ['confirmed'] } } });
    expect(a.model.tools[2]).toEqual({ type: 'endCall' });
    expect(a.model.messages[0]!.content).toContain('Should I mark this day as complete?');
    expect(a.artifactPlan.recordingEnabled).toBe(false);
    expect(a.metadata).toEqual({ userId: 'u1', localDate: '2026-10-04', callRowId: 7 });
    expect(a.maxDurationSeconds).toBe(600);
  });
});

describe('planMeals', () => {
  const states = (time: string, logged: (string | null)[] = []) =>
    Object.fromEntries(planMeals(time, logged).map((s) => [s.meal, s.state]));

  it('asks only about breakfast in the morning', () => {
    expect(states('08:00')).toEqual({ breakfast: 'check', lunch: 'later', snack: 'later', dinner: 'later' });
    expect(states('10:00')).toEqual({ breakfast: 'ask', lunch: 'later', snack: 'later', dinner: 'later' });
    expect(states('11:00')).toEqual({ breakfast: 'ask', lunch: 'later', snack: 'ask', dinner: 'later' });
  });
  it('checks a meal during its window and asks once it is past', () => {
    expect(states('12:30')).toMatchObject({ lunch: 'check', dinner: 'later' });
    expect(states('15:00')).toMatchObject({ lunch: 'ask', dinner: 'later' });
    expect(states('20:00')).toEqual({ breakfast: 'ask', lunch: 'ask', snack: 'ask', dinner: 'check' });
    expect(states('22:30')).toMatchObject({ dinner: 'ask' });
  });
  it('skips logged meals but still asks about snacks', () => {
    expect(states('20:00', ['breakfast', 'snack', null])).toEqual({ breakfast: 'logged', lunch: 'ask', snack: 'ask', dinner: 'check' });
    expect(states('10:00', ['dinner'])).toMatchObject({ dinner: 'logged' });
  });
});

describe('buildFirstMessage', () => {
  const first = (time: string, logged: (string | null)[] = []) =>
    buildFirstMessage('Asha Rao', time, planMeals(time, logged), logged.length);

  it('opens on the first meal worth asking about', () => {
    expect(first('08:15')).toBe('Good morning, Asha! Quick food check-in. Have you had breakfast yet?');
    expect(first('10:00')).toBe('Good morning, Asha! Quick food check-in. What did you have for breakfast?');
    expect(first('20:00')).toBe("Good evening, Asha! Quick food check-in. Let's go meal by meal. What did you have for breakfast?");
    expect(first('20:00', ['breakfast', 'lunch'])).toBe(
      "Good evening, Asha! Quick food check-in. I already have your breakfast and lunch. Let's go meal by meal. Did you have any snacks or drinks between meals, like tea or coffee?",
    );
  });
  it('falls back to "anything else" when nothing is due', () => {
    expect(first('09:00', ['breakfast'])).toBe(
      'Good morning, Asha! Quick food check-in. I already have your breakfast. Did you have anything else to eat or drink?',
    );
    expect(first('09:00', [null, null])).toBe(
      'Good morning, Asha! Quick food check-in. I already have 2 items for today. Have you had breakfast yet?',
    );
  });
});

describe('local time', () => {
  it('reads the wall clock in the user timezone', () => {
    expect(localTimeIn('Asia/Kolkata', new Date('2026-10-04T04:45:00Z'))).toBe('10:15');
    expect(localTimeIn('Asia/Kolkata', new Date('2026-10-04T18:40:00Z'))).toBe('00:10');
    expect(formatClock('00:10')).toBe('12:10 am');
    expect(formatClock('12:30')).toBe('12:30 pm');
    expect(formatClock('20:05')).toBe('8:05 pm');
  });
});

describe('parse', () => {
  it('reads arguments as object or JSON string', () => {
    expect(parseArguments({ items: [] })).toEqual({ items: [] });
    expect(parseArguments('{"items":[1]}')).toEqual({ items: [1] });
    expect(parseArguments('not json')).toBeNull();
  });
  it('reads toolCallList and toolWithToolCallList', () => {
    expect(toolCallsOf({ toolCallList: [{ id: 't1', function: { name: 'save_foods', arguments: '{}' } }] })).toEqual([
      { id: 't1', name: 'save_foods', arguments: '{}' },
    ]);
    expect(toolCallsOf({ toolWithToolCallList: [{ toolCall: { id: 't2', function: { name: 'x', arguments: {} } } }] })).toEqual([
      { id: 't2', name: 'x', arguments: {} },
    ]);
  });
  it('finds metadata wherever it is echoed', () => {
    expect(metadataOf({ call: { assistant: { metadata: { callRowId: 3, localDate: '2026-10-04' } } } })).toEqual({ callRowId: 3, localDate: '2026-10-04' });
    expect(metadataOf({ assistant: { metadata: { callRowId: '4' } } })).toEqual({ callRowId: 4, localDate: null });
    expect(metadataOf({})).toEqual({ callRowId: null, localDate: null });
  });
  it('computes duration from timestamps and truncates transcripts', () => {
    const r = endOfCallReportOf({
      endedReason: 'customer-ended-call',
      startedAt: '2026-10-04T14:30:00.000Z',
      endedAt: '2026-10-04T14:32:05.500Z',
      artifact: { transcript: 'x'.repeat(200_000) },
    });
    expect(r.durationSeconds).toBe(125.5);
    expect(r.transcript).toHaveLength(100_000);
  });
  it('builds a transcript from messages when needed', () => {
    const r = endOfCallReportOf({ artifact: { messages: [{ role: 'bot', message: 'Hi' }, { role: 'user', message: 'Two idlis' }] } });
    expect(r.transcript).toBe('AI: Hi\nUser: Two idlis');
  });
  it('classifies start failures', () => {
    expect(isStartFailure('call.start.error-get-assistant')).toBe(true);
    expect(isStartFailure('customer-did-not-give-microphone-permission')).toBe(true);
    expect(isStartFailure('customer-ended-call')).toBe(false);
    expect(isStartFailure(null)).toBe(false);
  });
});
