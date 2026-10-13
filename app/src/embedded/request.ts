import { utf8Encode } from './polyfills';

/**
 * A `Request` as far as the Worker reads one: method, url, headers, and a body it pulls through `getReader()`. Hermes's own Request
 * has no stream body, so this stands in for it (the Worker's size cap reads the body that way).
 */
export function makeRequest(method: string, url: string, headers: Record<string, string>, body?: string): Request {
  const bytes = body === undefined ? null : utf8Encode(body);
  const h = new Headers(headers);
  if (bytes) h.set('content-length', String(bytes.length));
  return {
    method,
    url,
    headers: h,
    body: bytes
      ? {
          getReader() {
            let sent = false;
            return {
              async read() {
                if (sent || bytes.length === 0) return { done: true as const, value: undefined };
                sent = true;
                return { done: false as const, value: bytes };
              },
              async cancel() {
                sent = true;
              },
            };
          },
        }
      : null,
  } as unknown as Request;
}
