import { API_BASE_URL, APP_TOKEN, ON_DEVICE } from '@/config/local';
import { getEmbedded } from '@/embedded/runtime';
import { rememberProfileZone } from './zone';
import type {
  CallInfo,
  CallKind,
  Day,
  DayMark,
  DayRange,
  Food,
  FoodCheck,
  FoodForm,
  FoodGaps,
  FoodHistory,
  FoodInput,
  FoodIssue,
  GoalsResponseV2,
  ProfileInput,
  ProfileResponse,
  SafetyAnswers,
  TargetSetInfo,
  TargetsResponse,
  WeeklyReport,
  RangeReport,
  WeightEntry,
  Item,
  ItemInput,
  Meta,
  NutrientBreakdown,
  Profile,
  Settings,
  StartCallResponse,
  Uncached,
} from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 15_000;

/** Account credentials returned by registration/password login are 32-byte base64url tokens. */
export const isAccountCredential = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);

export const ACCOUNT_ACCESS_UPDATE_REQUIRED = 'The server needs an update to complete login.';

let currentUserId: string | null = null;

let currentSecret: string | null = null;

/** Set by the profile store; sent as X-User-Id on every request. */
export function setApiUser(userId: string | null): void {
  currentUserId = userId;
}

/**
 * The profile's secret, from secure storage. Sent as X-Profile-Secret so health routes open and goals come back
 * personal; the Worker ignores it everywhere it is not needed (WEEKLY_BREAKDOWN_PLAN.md 8.3.2).
 */
export function setApiSecret(secret: string | null): void {
  currentSecret = secret;
}

/**
 * Plain HTTP only to this machine (a local Worker over `adb reverse`, or the emulator's view of it); anything else must be HTTPS,
 * or the app token and the profile secret would cross the network in clear (plan 8.3.6). Android's network security config says the
 * same for release builds; this covers every platform.
 */
export function isAllowedBaseUrl(url: string): boolean {
  return /^https:\/\//i.test(url) || /^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?(\/|$)/i.test(url);
}

/** The status and body of an answer, whether it came over HTTP or from the Worker running inside the app. */
interface Reply {
  status: number;
  text: string;
}

async function send(method: string, path: string, headers: Record<string, string>, body: unknown): Promise<Reply> {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  if (ON_DEVICE) {
    try {
      const reply = await getEmbedded(APP_TOKEN).request(method, path, headers, payload);
      return { status: reply.status, text: reply.body };
    } catch (e) {
      throw new ApiError(500, 'on_device', `The data on this phone could not be opened: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (!__DEV__ && !isAllowedBaseUrl(API_BASE_URL)) {
    throw new ApiError(0, 'insecure_server', 'The server address must start with https://');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, { method, headers, body: payload, signal: controller.signal });
    return { status: res.status, text: res.status === 204 ? '' : await res.text() };
  } catch {
    throw new ApiError(0, 'network', controller.signal.aborted ? 'The server took too long to answer' : 'Could not reach the server');
  } finally {
    clearTimeout(timer);
  }
}

export async function request<T>(method: string, path: string, body?: unknown, credentials?: { userId: string; secret: string }): Promise<T> {
  const headers: Record<string, string> = { authorization: `Bearer ${APP_TOKEN}` };
  const userId = credentials ? credentials.userId : currentUserId;
  const secret = credentials ? credentials.secret : currentSecret;
  if (userId) headers['x-user-id'] = userId;
  if (secret) headers['x-profile-secret'] = secret;
  if (body !== undefined) headers['content-type'] = 'application/json';

  const { status, text } = await send(method, path, headers, body);
  if (status === 204) return undefined as T;
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // fall through with null
  }
  if (status < 200 || status >= 300) {
    const err = parsed?.error ?? {};
    const { code, message, ...details } = err;
    throw new ApiError(status, code ?? 'http_error', message ?? `Request failed (${status})`, details);
  }
  return parsed as T;
}

/**
 * Only when the Worker runs inside the app: hands a Vapi message (the call's save_foods, then its end-of-call report) to the
 * Worker's webhook handler, because no server exists to receive it. A hosted Worker is posted to by Vapi itself, so this is a no-op.
 */
export async function deliverVapiMessage(payload: unknown): Promise<unknown> {
  if (!ON_DEVICE || !currentUserId) return null;
  const reply = await getEmbedded(APP_TOKEN).deliverVapi(currentUserId, payload);
  try {
    return reply.body ? JSON.parse(reply.body) : null;
  } catch {
    return null;
  }
}

const enc = encodeURIComponent;

/** Whenever the settings come back, keep the profile's time zone fresh for every screen (see zone.ts). */
function rememberZone(settings: Settings): Settings {
  rememberProfileZone(settings.id, settings.timezone);
  return settings;
}

export const api = {
  health: () => request<{ ok: boolean }>('GET', '/health'),
  meta: () => request<Meta>('GET', '/meta'),

  listProfiles: () => request<{ profiles: Profile[] }>('GET', '/profiles').then((r) => r.profiles),
  /** Returns the new profile and its credential, to store automatically in secure storage. */
  createProfile: (name: string, extra: { timezone?: string; callTime?: string | null } = {}) =>
    request<{ profile: Profile; secret: string }>('POST', '/profiles', { name, ...extra }),
  /** Makes an account and its profile. Answers like createProfile: the profile and its one-time secret. 409 `name_taken`; 400 for a short password. */
  register: (username: string, password: string) =>
    request<{ profile: Profile; secret: string }>('POST', '/auth/register', { username, password }),
  /** The account and a credential for its saved data. 401 `invalid_credentials` for every way of being wrong. */
  login: async (username: string, password: string) => {
    const account = await request<{ profile: Profile; secret: string }>('POST', '/auth/login', { username, password });
    // An older server returns only the profile ID. Accepting that as login would reuse a missing/stale credential forever.
    if (!account?.profile?.id || !isAccountCredential(account.secret)) {
      throw new ApiError(503, 'auth_upgrade_required', ACCOUNT_ACCESS_UPDATE_REQUIRED);
    }
    // Verify access before storing the account or leaving Login. Use the returned identity, never the previous account's headers.
    await request<ProfileResponse>('GET', '/me/profile', undefined, { userId: account.profile.id, secret: account.secret });
    return account;
  },

  getSettings: () => request<Settings>('GET', '/me/settings').then(rememberZone),
  updateSettings: (patch: Partial<Pick<Settings, 'name' | 'timezone' | 'callTime' | 'callEnabled'>> & { vapiPublicKey?: string | null }) =>
    request<Settings>('PUT', '/me/settings', patch).then(rememberZone),

  getGoals: () => request<GoalsResponseV2>('GET', '/me/goals'),
  updateGoals: (goals: Record<string, number | null>, origin: 'custom' | 'care_team' = 'custom') =>
    request<GoalsResponseV2>('PUT', '/me/goals', { goals, origin }),

  // ---- personal targets (health-scoped routes need the profile's secret)
  getHealthProfile: () => request<ProfileResponse>('GET', '/me/profile'),
  saveHealthProfile: (body: { profile?: ProfileInput; safety?: SafetyAnswers; consentVersion?: string }) =>
    request<ProfileResponse>('PUT', '/me/profile', body),
  /** The same computation without saving: no secret needed, and it never reads stored health data. */
  previewTargets: (profile: ProfileInput, safety: SafetyAnswers) =>
    request<{ targetSet: TargetSetInfo }>('POST', '/me/targets/preview', { profile, safety }).then((r) => r.targetSet),
  getTargets: (date?: string) => request<TargetsResponse>('GET', `/me/targets${date ? `?date=${date}` : ''}`),
  getWeights: () => request<{ weights: WeightEntry[] }>('GET', '/me/weights').then((r) => r.weights),
  addWeight: (weightKg: number, opts: { date?: string; confirm?: boolean } = {}) =>
    request<{ weight: WeightEntry; targetSet: TargetSetInfo | null; changed: boolean }>('POST', '/me/weights', { weightKg, ...opts }),
  deleteWeight: (date: string) => request<void>('DELETE', `/me/weights/${date}`),
  exportHealthData: () => request<Record<string, unknown>>('GET', '/me/export'),
  deleteHealthData: () => request<void>('DELETE', '/me/health-data'),
  deleteProfile: () => request<void>('DELETE', '/me'),

  startCall: (kind: CallKind) => request<StartCallResponse>('POST', '/calls/start', { kind }),
  callStarted: (callId: number, vapiCallId: string) =>
    request<{ call: CallInfo }>('POST', `/calls/${callId}/started`, { vapiCallId }).then((r) => r.call),
  callFailed: (callId: number, reason: string) =>
    request<{ call: CallInfo }>('POST', `/calls/${callId}/failed`, { reason: reason.slice(0, 500) }).then((r) => r.call),
  latestCall: () => request<{ call: CallInfo | null }>('GET', '/calls/latest').then((r) => r.call),

  getDay: (date: string) => request<Day>('GET', `/days/${date}`),
  getDays: (from: string, to: string) => request<DayRange>('GET', `/days?from=${from}&to=${to}`),
  /** "This day is complete / looks incomplete / leave it out of my reports" (plan 7.2). */
  setDayStatus: (date: string, status: DayMark) => request<{ date: string; status: DayMark }>('PUT', `/days/${date}/status`, { status }),
  clearDayStatus: (date: string) => request<void>('DELETE', `/days/${date}/status`),
  /** The whole weekly view for the week containing `start` (a Monday is snapped to), with up to eight weeks of history. */
  getRangeReport: (from: string, to: string) => request<RangeReport>('GET', `/reports/range?from=${enc(from)}&to=${enc(to)}`),
  /** The logged items that add up to one nutrient's total over a span of days, each with what it contributed (the figure's own arithmetic). */
  getNutrientBreakdown: (from: string, to: string, nutrient: string) =>
    request<NutrientBreakdown>('GET', `/reports/breakdown?from=${enc(from)}&to=${enc(to)}&nutrient=${enc(nutrient)}`),
  getWeeklyReport: (start?: string, weeks?: number) => {
    const q = [start ? `start=${start}` : '', weeks ? `weeks=${weeks}` : ''].filter(Boolean).join('&');
    return request<WeeklyReport>('GET', `/reports/weekly${q ? `?${q}` : ''}`);
  },
  addItems: (date: string, items: ItemInput[], callId?: number) =>
    request<{ items: Item[] }>('POST', `/days/${date}/items`, { items, callId }).then((r) => r.items),
  updateItem: (id: string, patch: Partial<ItemInput>) =>
    request<{ item: Item }>('PATCH', `/items/${enc(id)}`, patch).then((r) => r.item),
  deleteItem: (id: string) => request<void>('DELETE', `/items/${enc(id)}`),

  uncached: () => request<Uncached>('GET', '/uncached'),

  listFoods: (q?: string) => request<{ foods: Food[] }>('GET', `/foods${q ? `?q=${enc(q)}` : ''}`).then((r) => r.foods),
  getFood: (id: string) => request<{ food: Food }>('GET', `/foods/${enc(id)}`).then((r) => r.food),
  createFood: (input: FoodInput) => request<{ food: Food; resolvedCount: number; warnings: FoodIssue[] }>('POST', '/foods', input),
  updateFood: (id: string, patch: Partial<FoodInput>) =>
    request<{ food: Food; resolvedCount: number; repended: number; warnings: FoodIssue[] }>('PUT', `/foods/${enc(id)}`, patch),
  /** The editor's dry run: the same checks as a save, nothing written (plan 7.4). */
  checkFood: (input: { baseUnit: string; nutrients: Record<string, number | null>; units?: { unit: string; servings: number }[]; form?: FoodForm | null }) =>
    request<FoodCheck>('POST', '/foods/check', input),
  /** The foods eaten in the last four weeks that lack values the report needs, most energy first. */
  getFoodGaps: () => request<FoodGaps>('GET', '/foods/gaps'),
  /** This person's own log, food by food, ranked for each meal by how often and how lately (the log screen's suggestions). */
  getFoodHistory: () => request<FoodHistory>('GET', '/foods/history'),
  addAlias: (id: string, alias: string) =>
    request<{ food: Food; resolvedCount: number }>('POST', `/foods/${enc(id)}/aliases`, { alias }),
  removeAlias: (id: string, alias: string) =>
    request<{ food: Food; repended: number }>('DELETE', `/foods/${enc(id)}/aliases/${enc(alias)}`),
  setUnit: (id: string, unit: string, servings: number) =>
    request<{ food: Food; resolvedCount: number }>('PUT', `/foods/${enc(id)}/units/${enc(unit)}`, { servings }),
  removeUnit: (id: string, unit: string) =>
    request<{ food: Food; repended: number }>('DELETE', `/foods/${enc(id)}/units/${enc(unit)}`),
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
