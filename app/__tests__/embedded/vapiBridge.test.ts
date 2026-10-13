import { CallBridge, saveFoodsCallsOf } from '@/embedded/vapi';

/** The `tool-calls` client message exactly as a live Vapi web call delivered it (2026-10-13): the call under three names, `arguments` an object. */
const LIVE_TOOL_CALLS = {
  type: 'tool-calls',
  toolCalls: [
    { id: 'call_G2ZOwGGC', type: 'function', function: { name: 'save_foods', arguments: { items: [{ name: 'idli', quantity: 2, unit: 'piece', meal: 'breakfast' }, { name: 'tea', quantity: 1, unit: 'cup', meal: 'breakfast' }] } } },
  ],
  toolCallList: [
    { id: 'call_G2ZOwGGC', type: 'function', function: { name: 'save_foods', arguments: { items: [{ name: 'idli', quantity: 2, unit: 'piece', meal: 'breakfast' }, { name: 'tea', quantity: 1, unit: 'cup', meal: 'breakfast' }] } } },
  ],
  toolWithToolCallList: [{ type: 'function', function: { name: 'save_foods' }, toolCall: { id: 'call_G2ZOwGGC', type: 'function', function: { name: 'save_foods', arguments: { items: [] } } } }],
};

describe('saveFoodsCallsOf', () => {
  it('reads a live tool-calls message once, whatever it names the list', () => {
    const calls = saveFoodsCallsOf(LIVE_TOOL_CALLS);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.id).toBe('call_G2ZOwGGC');
    expect((calls[0]!.arguments as { items: unknown[] }).items).toHaveLength(2);
  });

  it('falls back to toolWithToolCallList, and ignores other tools and other messages', () => {
    expect(saveFoodsCallsOf({ type: 'tool-calls', toolWithToolCallList: [{ toolCall: { id: 'x', function: { name: 'save_foods', arguments: '{}' } } }] })).toHaveLength(1);
    expect(saveFoodsCallsOf({ type: 'tool-calls', toolCallList: [{ id: 'x', function: { name: 'endCall' } }] })).toEqual([]);
    expect(saveFoodsCallsOf({ type: 'transcript', transcript: 'save_foods' })).toEqual([]);
    expect(saveFoodsCallsOf(null)).toEqual([]);
    expect(saveFoodsCallsOf('tool-calls')).toEqual([]);
  });

  it('finds the call in the assistant turn of a conversation-update, with and without an id', () => {
    const calls = saveFoodsCallsOf({
      type: 'conversation-update',
      conversation: [
        { role: 'system', content: 'save_foods' },
        { role: 'assistant', tool_calls: [{ id: 't1', function: { name: 'save_foods', arguments: '{"items":[]}' } }, { function: { name: 'save_foods', arguments: '{}' } }] },
      ],
    });
    expect(calls.map((c) => c.id)).toEqual(['t1', null]);
  });
});

describe('CallBridge', () => {
  const make = () => {
    const sent: any[] = [];
    let unblock!: () => void;
    const gate = new Promise<void>((resolve) => (unblock = resolve));
    const bridge = new CallBridge({
      callRowId: 7,
      localDate: '2026-10-13',
      now: (() => {
        let t = Date.parse('2026-10-13T10:00:00Z');
        return () => (t += 30_000);
      })(),
      deliver: async (payload) => {
        await gate;
        sent.push(payload);
        return null;
      },
    });
    return { bridge, sent, unblock };
  };

  it('posts a live tool call once, and not again when the history repeats it', async () => {
    const { bridge, sent, unblock } = make();
    bridge.vapiCallId = 'v1';
    const p = bridge.onMessage(LIVE_TOOL_CALLS);
    unblock();
    await p;
    await bridge.onMessage({ type: 'conversation-update', conversation: [{ role: 'assistant', tool_calls: LIVE_TOOL_CALLS.toolCalls }] });
    expect(sent).toHaveLength(1);
    expect(sent[0].message).toMatchObject({
      type: 'tool-calls',
      call: { id: 'v1' },
      assistant: { metadata: { callRowId: 7, localDate: '2026-10-13' } },
      toolCallList: [{ id: 'call_G2ZOwGGC', function: { name: 'save_foods' } }],
    });
  });

  it('gives a call with no id its own, and posts a changed list again', async () => {
    const { bridge, sent, unblock } = make();
    unblock();
    await bridge.onMessage({ type: 'tool-calls', toolCallList: [{ function: { name: 'save_foods', arguments: { items: [{ name: 'a', quantity: 1, unit: 'piece' }] } } }] });
    await bridge.onMessage({ type: 'tool-calls', toolCallList: [{ function: { name: 'save_foods', arguments: { items: [{ name: 'a', quantity: 2, unit: 'piece' }] } } }] });
    await bridge.onMessage({ type: 'tool-calls', toolCallList: [{ function: { name: 'save_foods', arguments: { items: [{ name: 'a', quantity: 2, unit: 'piece' }] } } }] });
    expect(sent.map((s) => s.message.toolCallList[0].id)).toEqual(['device-7-1', 'device-7-2']);
    expect(sent[0].message.call).toBeUndefined();
  });

  it('writes the report once, after any save still in flight, with the words spoken and the times', async () => {
    const { bridge, sent, unblock } = make();
    bridge.vapiCallId = 'v1';
    await bridge.onMessage({ type: 'transcript', transcriptType: 'final', role: 'assistant', transcript: 'Hello' });
    await bridge.onMessage({ type: 'transcript', transcriptType: 'partial', role: 'user', transcript: 'ha' });
    await bridge.onMessage({ type: 'transcript', transcriptType: 'final', role: 'user', transcript: 'Hi' });
    const save = bridge.onMessage(LIVE_TOOL_CALLS);
    const done = bridge.finish('assistant-ended-call');
    const again = bridge.finish('customer-ended-call');
    expect(sent).toHaveLength(0);
    unblock();
    await Promise.all([save, done, again]);
    expect(sent.map((s) => s.message.type)).toEqual(['tool-calls', 'end-of-call-report']);
    expect(sent[1].message).toMatchObject({ endedReason: 'assistant-ended-call', artifact: { transcript: 'AI: Hello\nUser: Hi' } });
    expect(Date.parse(sent[1].message.endedAt)).toBeGreaterThan(Date.parse(sent[1].message.startedAt));
    expect(bridge.finished).toBe(true);
  });

  it('survives a failing delivery: the call carries on and a later report still goes out', async () => {
    let calls = 0;
    const bridge = new CallBridge({
      callRowId: 1,
      localDate: '2026-10-13',
      deliver: async () => {
        calls++;
        if (calls === 1) throw new Error('disk full');
        return null;
      },
    });
    await expect(bridge.onMessage(LIVE_TOOL_CALLS)).resolves.toBeUndefined();
    await expect(bridge.finish('assistant-ended-call')).resolves.toBeUndefined();
    expect(calls).toBe(2);
  });
});
