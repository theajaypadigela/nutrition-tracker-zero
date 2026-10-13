/**
 * Reading errors from the Vapi/Daily client. Kept free of any native import so it can be unit tested.
 */

/** The human-readable part of whatever the SDK threw or emitted. */
export function describeVapiError(e: unknown): string {
  const any = e as any;
  const msg = any?.error?.message ?? any?.errorMsg ?? any?.message ?? any?.error ?? e;
  const text = typeof msg === 'string' ? msg : JSON.stringify(msg);
  return (text || 'Voice call failed').slice(0, 300);
}

/**
 * True when the "error" is just the server ending the call. When the assistant hangs up (it has
 * finished, or nobody spoke for too long) Daily ejects the client and reports
 * `{ error: { type: 'ejected' }, errorMsg: 'Meeting has ended' }` before the normal call-end. That is
 * a finished call, not a connection problem: the day's outcome comes from the end-of-call report.
 */
export function isMeetingEnded(e: unknown): boolean {
  const any = e as any;
  if (any?.error?.type === 'ejected' || any?.type === 'ejected') return true;
  return /\bmeeting has ended\b/i.test(describeVapiError(e));
}
