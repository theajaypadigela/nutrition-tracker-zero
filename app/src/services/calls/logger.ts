/**
 * Single structured logging path for the reminder system (§H: zero silent failures).
 *
 * Every scheduling refusal, parse failure, permission gap, and reconciliation repair
 * goes through here so there is one place to inspect (and later forward to a remote
 * sink). Kept dependency-light: console today, swappable later.
 */

export type ReminderLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type ReminderLogEvent = {
  level: ReminderLogLevel;
  /** Stable, greppable event code, e.g. 'reconcile.armed', 'parse.failed'. */
  code: string;
  message: string;
  data?: Record<string, unknown>;
  at: number;
};

type Sink = (event: ReminderLogEvent) => void;

const RING_BUFFER_LIMIT = 200;
const ringBuffer: ReminderLogEvent[] = [];

const consoleSink: Sink = event => {
  const line = `[reminders] ${event.code}: ${event.message}`;
  const payload = event.data ?? {};
  switch (event.level) {
    case 'error':
      console.error(line, payload);
      break;
    case 'warn':
      console.warn(line, payload);
      break;
    default:
      console.log(line, payload);
  }
};

let sinks: Sink[] = [consoleSink];

export function addReminderLogSink(sink: Sink): () => void {
  sinks.push(sink);
  return () => {
    sinks = sinks.filter(s => s !== sink);
  };
}

function emit(
  level: ReminderLogLevel,
  code: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  const event: ReminderLogEvent = { level, code, message, data, at: Date.now() };
  ringBuffer.push(event);
  if (ringBuffer.length > RING_BUFFER_LIMIT) {
    ringBuffer.shift();
  }
  for (const sink of sinks) {
    try {
      sink(event);
    } catch {
      // A failing sink must never break reminder logic.
    }
  }
}

export const reminderLog = {
  debug: (code: string, message: string, data?: Record<string, unknown>) =>
    emit('debug', code, message, data),
  info: (code: string, message: string, data?: Record<string, unknown>) =>
    emit('info', code, message, data),
  warn: (code: string, message: string, data?: Record<string, unknown>) =>
    emit('warn', code, message, data),
  error: (code: string, message: string, data?: Record<string, unknown>) =>
    emit('error', code, message, data),
};

/** Recent events, newest last. For the reminder-health surface / debugging. */
export function recentReminderLogs(): ReminderLogEvent[] {
  return [...ringBuffer];
}
