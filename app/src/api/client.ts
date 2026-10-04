import { API_BASE_URL, APP_TOKEN } from '@/config/local';
import type {
  CallInfo,
  CallKind,
  Day,
  DayRange,
  Food,
  FoodInput,
  Goal,
  Item,
  ItemInput,
  Meta,
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

let currentUserId: string | null = null;

/** Set by the profile store; sent as X-User-Id on every request. */
export function setApiUser(userId: string | null): void {
  currentUserId = userId;
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { authorization: `Bearer ${APP_TOKEN}` };
  if (currentUserId) headers['x-user-id'] = currentUserId;
  if (body !== undefined) headers['content-type'] = 'application/json';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, 'network', controller.signal.aborted ? 'The server took too long to answer' : 'Could not reach the server');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // fall through with null
  }
  if (!res.ok) {
    const err = parsed?.error ?? {};
    const { code, message, ...details } = err;
    throw new ApiError(res.status, code ?? 'http_error', message ?? `Request failed (${res.status})`, details);
  }
  return parsed as T;
}

const enc = encodeURIComponent;

export const api = {
  health: () => request<{ ok: boolean }>('GET', '/health'),
  meta: () => request<Meta>('GET', '/meta'),

  listProfiles: () => request<{ profiles: Profile[] }>('GET', '/profiles').then((r) => r.profiles),
  createProfile: (name: string, extra: { timezone?: string; callTime?: string | null } = {}) =>
    request<{ profile: Profile }>('POST', '/profiles', { name, ...extra }).then((r) => r.profile),

  getSettings: () => request<Settings>('GET', '/me/settings'),
  updateSettings: (patch: Partial<Pick<Settings, 'name' | 'timezone' | 'callTime' | 'callEnabled'>> & { vapiPublicKey?: string | null }) =>
    request<Settings>('PUT', '/me/settings', patch),

  getGoals: () => request<{ goals: Goal[] }>('GET', '/me/goals').then((r) => r.goals),
  updateGoals: (goals: Record<string, number | null>) =>
    request<{ goals: Goal[] }>('PUT', '/me/goals', { goals }).then((r) => r.goals),

  startCall: (kind: CallKind) => request<StartCallResponse>('POST', '/calls/start', { kind }),
  callStarted: (callId: number, vapiCallId: string) =>
    request<{ call: CallInfo }>('POST', `/calls/${callId}/started`, { vapiCallId }).then((r) => r.call),
  callFailed: (callId: number, reason: string) =>
    request<{ call: CallInfo }>('POST', `/calls/${callId}/failed`, { reason: reason.slice(0, 500) }).then((r) => r.call),
  latestCall: () => request<{ call: CallInfo | null }>('GET', '/calls/latest').then((r) => r.call),

  getDay: (date: string) => request<Day>('GET', `/days/${date}`),
  getDays: (from: string, to: string) => request<DayRange>('GET', `/days?from=${from}&to=${to}`),
  addItems: (date: string, items: ItemInput[], callId?: number) =>
    request<{ items: Item[] }>('POST', `/days/${date}/items`, { items, callId }).then((r) => r.items),
  updateItem: (id: string, patch: Partial<ItemInput>) =>
    request<{ item: Item }>('PATCH', `/items/${enc(id)}`, patch).then((r) => r.item),
  deleteItem: (id: string) => request<void>('DELETE', `/items/${enc(id)}`),

  uncached: () => request<Uncached>('GET', '/uncached'),

  listFoods: (q?: string) => request<{ foods: Food[] }>('GET', `/foods${q ? `?q=${enc(q)}` : ''}`).then((r) => r.foods),
  getFood: (id: string) => request<{ food: Food }>('GET', `/foods/${enc(id)}`).then((r) => r.food),
  createFood: (input: FoodInput) => request<{ food: Food; resolvedCount: number }>('POST', '/foods', input),
  updateFood: (id: string, patch: Partial<FoodInput>) =>
    request<{ food: Food; resolvedCount: number; repended: number }>('PUT', `/foods/${enc(id)}`, patch),
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
