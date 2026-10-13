/**
 * Reading a request and logging an error safely (security review): the size cap holds while a body streams in, so a chunked upload
 * with no Content-Length is stopped at the cap, and an error message never carries a value someone typed.
 */
import { describe, expect, it } from 'vitest';
import { HttpError, logSafe, readJson } from '../../src/http';

/** A body that arrives in chunks, with no Content-Length, as a chunked upload does. */
function chunked(chunks: string[]): Request {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Request('https://zero.example/x', { method: 'POST', body, duplex: 'half' } as RequestInit);
}

describe('readJson', () => {
  it('reads a chunked body under the cap', async () => {
    expect(await readJson(chunked(['{"a":', '1}']), 64)).toEqual({ a: 1 });
  });

  it('stops a chunked body at the cap, with no Content-Length to go by', async () => {
    const err = await readJson(chunked(['{"a":"', 'x'.repeat(40), 'x'.repeat(40), '"}']), 64).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(413);
  });

  it('refuses a declared length over the cap before reading anything, and an empty or broken body', async () => {
    const declared = new Request('https://zero.example/x', { method: 'POST', body: '{}', headers: { 'content-length': '999999' } });
    expect(((await readJson(declared, 64).catch((e: unknown) => e)) as HttpError).status).toBe(413);
    expect(((await readJson(new Request('https://zero.example/x', { method: 'POST' })).catch((e: unknown) => e)) as HttpError).status).toBe(400);
    expect(((await readJson(chunked(['{nope'])).catch((e: unknown) => e)) as HttpError).message).toBe('Body is not valid JSON');
  });
});

describe('logSafe', () => {
  it('cuts out quoted values, such as the one a D1 type error quotes, and keeps the rest', () => {
    expect(logSafe("D1_TYPE_ERROR: Type 'object' not supported for value '{\"weight\":61}'")).toBe("D1_TYPE_ERROR: Type '…' not supported for value '…'");
    expect(logSafe('UNIQUE constraint failed: users.name')).toBe('UNIQUE constraint failed: users.name');
    expect(logSafe('say "hello"')).toBe("say '…'");
  });

  it('is at most 200 characters', () => expect(logSafe('x'.repeat(500))).toHaveLength(200));
});
