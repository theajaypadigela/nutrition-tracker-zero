/** Defensive readers for Vapi server messages (shapes per PLAN.md §3; confirmed by the Phase 3 spike). */

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

export function messageOf(body: unknown): Obj | null {
  return isObj(body) && isObj(body.message) ? body.message : null;
}

export function messageType(msg: Obj): string {
  return typeof msg.type === 'string' ? msg.type : '';
}

export function callIdOf(msg: Obj): string | null {
  const call = isObj(msg.call) ? msg.call : null;
  return str(call?.id) ?? str(msg.callId);
}

export interface CallMetadata {
  callRowId: number | null;
  localDate: string | null;
}

/** metadata lives on the assistant; the docs don't say where it is echoed, so look in every likely place. */
export function metadataOf(msg: Obj): CallMetadata {
  const call = isObj(msg.call) ? msg.call : {};
  const candidates: unknown[] = [
    isObj(msg.assistant) ? msg.assistant.metadata : undefined,
    isObj(call.assistant) ? call.assistant.metadata : undefined,
    isObj(call.assistantOverrides) ? call.assistantOverrides.metadata : undefined,
    call.metadata,
    msg.metadata,
  ];
  for (const c of candidates) {
    if (!isObj(c)) continue;
    const id = typeof c.callRowId === 'string' ? Number(c.callRowId) : c.callRowId;
    if (typeof id === 'number' && Number.isSafeInteger(id) && id > 0) {
      return { callRowId: id, localDate: str(c.localDate) };
    }
  }
  return { callRowId: null, localDate: null };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

export function toolCallsOf(msg: Obj): ToolCall[] {
  const out: ToolCall[] = [];
  const push = (tc: unknown) => {
    if (!isObj(tc)) return;
    const fn = isObj(tc.function) ? tc.function : {};
    const id = str(tc.id);
    const name = str(fn.name) ?? str(tc.name);
    if (id && name) out.push({ id, name, arguments: fn.arguments ?? tc.arguments });
  };
  if (Array.isArray(msg.toolCallList)) {
    msg.toolCallList.forEach(push);
  } else if (Array.isArray(msg.toolWithToolCallList)) {
    for (const t of msg.toolWithToolCallList) if (isObj(t)) push(t.toolCall);
  }
  return out;
}

/** `arguments` may be an object or a JSON string. */
export function parseArguments(raw: unknown): Obj | null {
  if (isObj(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      return isObj(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

export const MAX_TRANSCRIPT = 100_000;

export interface EndOfCallReport {
  endedReason: string | null;
  transcript: string | null;
  durationSeconds: number | null;
}

function transcriptFromMessages(messages: unknown): string | null {
  if (!Array.isArray(messages)) return null;
  const lines: string[] = [];
  for (const m of messages) {
    if (!isObj(m)) continue;
    const text = str(m.message) ?? str(m.content);
    if (!text) continue;
    if (m.role === 'user') lines.push(`User: ${text}`);
    else if (m.role === 'bot' || m.role === 'assistant') lines.push(`AI: ${text}`);
  }
  return lines.length ? lines.join('\n') : null;
}

export function endOfCallReportOf(msg: Obj): EndOfCallReport {
  const artifact = isObj(msg.artifact) ? msg.artifact : {};
  const call = isObj(msg.call) ? msg.call : {};
  const transcript =
    str(artifact.transcript) ?? str(msg.transcript) ?? transcriptFromMessages(artifact.messages ?? msg.messages);
  const startedAt = Date.parse(String(msg.startedAt ?? call.startedAt ?? ''));
  const endedAt = Date.parse(String(msg.endedAt ?? call.endedAt ?? ''));
  let durationSeconds: number | null = null;
  if (Number.isFinite(startedAt) && Number.isFinite(endedAt) && endedAt >= startedAt) {
    durationSeconds = Math.round((endedAt - startedAt) / 100) / 10;
  } else if (typeof msg.durationSeconds === 'number' && Number.isFinite(msg.durationSeconds)) {
    durationSeconds = msg.durationSeconds;
  }
  return {
    endedReason: str(msg.endedReason) ?? str(call.endedReason),
    transcript: transcript ? transcript.slice(0, MAX_TRANSCRIPT) : null,
    durationSeconds,
  };
}

const START_FAILURES = new Set([
  'customer-did-not-give-microphone-permission',
  'assistant-not-valid',
  'assistant-not-found',
  'assistant-not-provided',
]);

/** Calls that never really started count as failed rather than no_list. */
export function isStartFailure(endedReason: string | null): boolean {
  if (!endedReason) return false;
  return (
    endedReason.startsWith('call.start.error') ||
    endedReason.startsWith('call-start-error') ||
    START_FAILURES.has(endedReason)
  );
}
