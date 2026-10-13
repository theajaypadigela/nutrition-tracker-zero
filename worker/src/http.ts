export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string = code,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: Record<string, unknown>) =>
  new HttpError(400, 'bad_request', message, details);
export const notFound = (message = 'Not found') => new HttpError(404, 'not_found', message);
export const conflict = (code: string, message: string, details?: Record<string, unknown>) =>
  new HttpError(409, code, message, details);

export function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export const noContent = () => new Response(null, { status: 204 });

export function errorResponse(err: HttpError): Response {
  return json({ error: { code: err.code, message: err.message, ...err.details } }, err.status);
}

const DEFAULT_MAX_BODY = 256 * 1024;

const tooLarge = () => new HttpError(413, 'payload_too_large', 'Request body too large');

/**
 * The body, read with a hard size cap that holds while it streams: a chunked upload with no Content-Length is stopped at the cap,
 * never buffered whole first.
 */
async function readCapped(req: Request, maxBytes: number): Promise<Uint8Array> {
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** Reads a JSON body with a hard size cap. Throws HttpError 400/413. */
export async function readJson<T = unknown>(req: Request, maxBytes = DEFAULT_MAX_BODY): Promise<T> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw tooLarge();
  const buf = await readCapped(req, maxBytes);
  if (buf.byteLength === 0) throw badRequest('Expected a JSON body');
  try {
    return JSON.parse(new TextDecoder().decode(buf)) as T;
  } catch {
    throw badRequest('Body is not valid JSON');
  }
}

export const nowIso = () => new Date().toISOString();

/**
 * An error message as it may be logged: at most 200 characters, with any quoted value cut out. D1's own messages can quote a bound
 * value ("not supported for value '…'"), and a log line must never carry what a person typed (plan 8.3.6).
 */
export function logSafe(message: string): string {
  return message.replace(/'[^']*'|"[^"]*"/g, "'…'").slice(0, 200);
}
