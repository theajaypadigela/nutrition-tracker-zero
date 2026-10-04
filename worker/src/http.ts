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

/** Reads a JSON body with a hard size cap. Throws HttpError 400/413. */
export async function readJson<T = unknown>(req: Request, maxBytes = DEFAULT_MAX_BODY): Promise<T> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new HttpError(413, 'payload_too_large', 'Request body too large');
  const buf = await req.arrayBuffer();
  if (buf.byteLength > maxBytes) throw new HttpError(413, 'payload_too_large', 'Request body too large');
  if (buf.byteLength === 0) throw badRequest('Expected a JSON body');
  try {
    return JSON.parse(new TextDecoder().decode(buf)) as T;
  } catch {
    throw badRequest('Body is not valid JSON');
  }
}

export const nowIso = () => new Date().toISOString();
