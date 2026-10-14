import { OnDeviceD1, migrate, type SqlDriver } from './d1';
import { MIGRATIONS } from './migrations.generated';
import { installPolyfills } from './polyfills';
import { makeRequest } from './request';
import { OnDeviceUrl } from './url';
import { ON_DEVICE_VOICE_PROVIDER } from '@/config/voice';

/**
 * The Worker, running inside the app on the phone's own SQLite file. The app's API client calls `request()` instead of `fetch()`,
 * so there is no server to host, no account, and nothing leaves the phone except the Vapi call itself.
 *
 * It is the very same code that runs on Cloudflare (worker/src): its router, its rules, its migrations. Only the database
 * (d1.ts over SQLite) and a few platform pieces (polyfills.ts, url.ts, request.ts) are supplied here.
 */

interface WorkerModule {
  fetch(req: Request, env: unknown): Promise<Response>;
  scheduled(event: unknown, env: unknown, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<void>;
}

export interface BackendReply {
  status: number;
  body: string;
}

export interface EmbeddedBackend {
  request(method: string, path: string, headers: Record<string, string>, body?: string): Promise<BackendReply>;
  /** Hands a Vapi message to the Worker's webhook handler, as Vapi's server would have posted it. */
  deliverVapi(userId: string, payload: unknown): Promise<BackendReply>;
}

/** Evaluated only after the polyfills: the Worker builds a TextEncoder as it loads. */
function loadWorker(): WorkerModule {
  const worker = require('../../../worker/src/index').default as WorkerModule;
  const { setUrlFactory } = require('../../../worker/src/url') as { setUrlFactory(f: (raw: string) => URL): void };
  setUrlFactory((raw) => new OnDeviceUrl(raw) as unknown as URL);
  return worker;
}

const ORIGIN = 'http://on-device';

export function createEmbedded(driver: SqlDriver, appToken: string): EmbeddedBackend {
  installPolyfills();
  migrate(driver, MIGRATIONS);
  const db = new OnDeviceD1(driver);
  // The deployment defaults (worker/wrangler.jsonc), plus ON_DEVICE: Vapi cannot call a phone, so the assistant's save tool is client-side.
  const env = {
    DB: db,
    APP_TOKEN: appToken,
    PUBLIC_BASE_URL: '',
    NUTRIENT_SCORE: '',
    SCORE_MODERATION: '',
    CALIBRATION: '',
    REQUIRE_SECRET: '',
    ON_DEVICE: '1',
    VOICE_PROVIDER: ON_DEVICE_VOICE_PROVIDER,
  };
  const worker = loadWorker();

  const send = async (method: string, path: string, headers: Record<string, string>, body?: string): Promise<BackendReply> => {
    const res = await worker.fetch(makeRequest(method, `${ORIGIN}${path}`, headers, body), env);
    return { status: res.status, body: await res.text() };
  };

  // The daily purge a deployed Worker runs on a schedule (transcripts older than 30 days): once per launch is plenty.
  worker.scheduled({}, env, { waitUntil: (p) => p.catch(() => {}) }).catch(() => {});

  return {
    request: send,
    async deliverVapi(userId, payload) {
      const row = await db.prepare('SELECT webhook_token FROM users WHERE id = ?1').bind(userId).first<{ webhook_token: string }>();
      if (!row) return { status: 404, body: '' };
      return send('POST', `/vapi/webhook/${row.webhook_token}`, { 'content-type': 'application/json' }, JSON.stringify(payload));
    },
  };
}

let instance: EmbeddedBackend | null = null;
let failure: Error | null = null;

/** The one backend for this app launch, created on first use. A failure to open or migrate the database is remembered and reported on every call. */
export function getEmbedded(appToken: string): EmbeddedBackend {
  if (instance) return instance;
  if (failure) throw failure;
  try {
    const { openDeviceDatabase } = require('./opSqlite') as typeof import('./opSqlite');
    instance = createEmbedded(openDeviceDatabase(), appToken);
    return instance;
  } catch (e) {
    failure = e instanceof Error ? e : new Error(String(e));
    throw failure;
  }
}
