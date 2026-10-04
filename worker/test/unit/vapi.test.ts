import { describe, expect, it } from 'vitest';
import { buildAssistant } from '../../src/vapi/assistant';
import { endOfCallReportOf, isStartFailure, metadataOf, parseArguments, toolCallsOf } from '../../src/vapi/parse';
import { LOGGED_UNITS } from '../../src/domain/units';

describe('buildAssistant', () => {
  const a = buildAssistant({
    userId: 'u1',
    name: 'Asha Rao',
    localDate: '2026-10-04',
    callRowId: 7,
    webhookUrl: 'https://w.example/vapi/webhook/tok',
    alreadyLogged: [{ raw_name: 'idli', quantity: 2, unit: 'piece', meal: 'breakfast' }],
  });
  const tool = a.model.tools[0] as ReturnType<typeof import('../../src/vapi/assistant').saveFoodsTool>;

  it('points the tool and the assistant at the webhook', () => {
    expect(tool.server.url).toBe('https://w.example/vapi/webhook/tok');
    expect(a.server.url).toBe('https://w.example/vapi/webhook/tok');
    expect(a.serverMessages).toEqual(['tool-calls', 'end-of-call-report']);
  });
  it('uses the shared unit list in the tool enum and the prompt', () => {
    expect(tool.function.parameters.properties.items.items.properties.unit.enum).toEqual([...LOGGED_UNITS]);
    expect(a.model.messages[0]!.content).toContain(LOGGED_UNITS.join(', '));
  });
  it('includes date, weekday and already-logged context', () => {
    const prompt = a.model.messages[0]!.content;
    expect(prompt).toContain('Sunday, 2026-10-04');
    expect(prompt).toContain('2 piece idli (breakfast)');
    expect(a.firstMessage).toBe('Hi Asha! Quick food check-in. I already have 1 item for today. What else did you eat or drink?');
  });
  it('has endCall, no recording, metadata, 10 min cap', () => {
    expect(a.model.tools[1]).toEqual({ type: 'endCall' });
    expect(a.artifactPlan.recordingEnabled).toBe(false);
    expect(a.metadata).toEqual({ userId: 'u1', localDate: '2026-10-04', callRowId: 7 });
    expect(a.maxDurationSeconds).toBe(600);
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
