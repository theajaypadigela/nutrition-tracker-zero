/**
 * With no server there is nobody for Vapi to post to, so the app does it: the call's client messages become the very payloads
 * Vapi's server would have sent the Worker (`tool-calls` while the call runs, `end-of-call-report` when it ends), and the Worker's
 * webhook handler does the rest exactly as it does when hosted. One code path, so saving, replacing a corrected list and
 * "no list was saved" behave the same either way.
 */

export const SAVE_FOODS = 'save_foods';
export const MARK_DAY_COMPLETE = 'mark_day_complete';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

export interface SaveFoodsCall {
  /** Vapi's id for the tool call, when the message carries one. */
  id: string | null;
  arguments: unknown;
}

/**
 * The save_foods calls in a client message. The `tool-calls` message is the documented source. The assistant's own turn in a
 * `conversation-update` carries the same call, so it is read too, in case Vapi's client message is ever missing: the bridge
 * remembers what it has handled, so seeing a call twice never saves twice.
 */
export function voiceToolCallsOf(msg: unknown): (SaveFoodsCall & { name: string })[] {
  if (!isObj(msg)) return [];
  const out: (SaveFoodsCall & { name: string })[] = [];
  const take = (tc: unknown) => {
    if (!isObj(tc)) return;
    const fn = isObj(tc.function) ? tc.function : tc;
    if (fn.name !== SAVE_FOODS && fn.name !== MARK_DAY_COMPLETE) return;
    out.push({ name: fn.name, id: typeof tc.id === 'string' && tc.id ? tc.id : null, arguments: fn.arguments ?? fn.parameters });
  };
  if (msg.type === 'tool-calls') {
    if (Array.isArray(msg.toolCallList)) msg.toolCallList.forEach(take);
    else if (Array.isArray(msg.toolWithToolCallList)) for (const t of msg.toolWithToolCallList) if (isObj(t)) take(t.toolCall);
  } else if (msg.type === 'conversation-update') {
    const history = Array.isArray(msg.conversation) ? msg.conversation : Array.isArray(msg.messagesOpenAIFormatted) ? msg.messagesOpenAIFormatted : [];
    for (const turn of history) if (isObj(turn) && turn.role === 'assistant' && Array.isArray(turn.tool_calls)) turn.tool_calls.forEach(take);
  }
  return out;
}

/** Compatibility helper for callers interested only in meal saves. */
export function saveFoodsCallsOf(msg: unknown): SaveFoodsCall[] {
  return voiceToolCallsOf(msg).filter(call => call.name === SAVE_FOODS).map(({ id, arguments: args }) => ({ id, arguments: args }));
}

export interface BridgeOptions {
  callRowId: number;
  localDate: string;
  /** Posts a payload to the Worker's webhook handler; resolves with its JSON answer (or null). */
  deliver(payload: unknown): Promise<unknown>;
  now?: () => number;
}

export type EndedReason = 'customer-ended-call' | 'assistant-ended-call' | 'pipeline-error';

export class CallBridge {
  /** Set once Vapi has answered `start`; until then the Worker finds the call by `metadata.callRowId`. */
  vapiCallId: string | null = null;
  private readonly startedAt: number;
  private readonly handled = new Set<string>();
  private readonly lines: string[] = [];
  private sent = 0;
  private reported = false;
  /** One delivery at a time, in order: the end-of-call report must never overtake a save that is still being written. */
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly o: BridgeOptions) {
    this.startedAt = (o.now ?? Date.now)();
  }

  private base(type: string): Obj {
    return {
      type,
      ...(this.vapiCallId ? { call: { id: this.vapiCallId } } : {}),
      assistant: { metadata: { callRowId: this.o.callRowId, localDate: this.o.localDate } },
    };
  }

  /** Feed every client message of the call. Never rejects: a failed save must not break the conversation. */
  onMessage(msg: unknown): Promise<void> {
    if (!isObj(msg)) return this.queue;
    if (msg.type === 'transcript' && msg.transcriptType === 'final' && typeof msg.transcript === 'string') {
      this.lines.push(`${msg.role === 'user' ? 'User' : 'AI'}: ${msg.transcript}`);
    }
    for (const call of voiceToolCallsOf(msg)) {
      const key = call.id ?? `${call.name}:args:${typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments)}`;
      if (this.handled.has(key)) continue;
      this.handled.add(key);
      const id = call.id ?? `device-${this.o.callRowId}-${++this.sent}`;
      const payload = {
        message: { ...this.base('tool-calls'), toolCallList: [{ id, function: { name: call.name, arguments: call.arguments } }] },
      };
      // If this fails the outcome reads "no list saved" and offers the manual form.
      this.queue = this.queue.then(() => this.o.deliver(payload)).then(() => undefined, () => undefined);
    }
    return this.queue;
  }

  /** The call is over: tell the Worker once, with the words spoken. Resolves when it has been written. */
  finish(endedReason: EndedReason): Promise<void> {
    if (this.reported) return this.queue;
    this.reported = true;
    const endedAt = (this.o.now ?? Date.now)();
    const payload = {
      message: {
        ...this.base('end-of-call-report'),
        endedReason,
        startedAt: new Date(this.startedAt).toISOString(),
        endedAt: new Date(endedAt).toISOString(),
        artifact: { transcript: this.lines.join('\n') },
      },
    };
    // If this fails, the stale-call sweep closes the call later.
    this.queue = this.queue.then(() => this.o.deliver(payload)).then(() => undefined, () => undefined);
    return this.queue;
  }

  get finished(): boolean {
    return this.reported;
  }
}
