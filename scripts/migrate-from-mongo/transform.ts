/**
 * Old MongoDB documents → D1 rows (PLAN.md §10). Pure: no database access, so it is unit-tested
 * with sample documents. Names and units go through the Worker's own normalizers so imported rows
 * match exactly like live ones.
 */
import { normalizeName } from '../../worker/src/domain/normalize';
import { normalizeUnit } from '../../worker/src/domain/units';
import { NUTRIENT_KEYS } from '../../worker/src/domain/nutrients';

export const DEFAULT_TZ = 'Asia/Kolkata';
const MAX_NAME = 80;
const MAX_QUANTITY = 100_000;

type Id = { toString(): string } | string;
const idOf = (v: Id | undefined | null) => (v == null ? '' : String(v));
export const migId = (v: Id) => `mig_${idOf(v)}`;

export interface OldUser { _id: Id; name?: string | null; email?: string | null; timezone?: string | null; createdAt?: Date | string | null }
export interface OldSchedule { userId: string; hour?: number; minute?: number; enabled?: boolean; timezone?: string | null }
export interface OldLog { _id: Id; userId: string; logDate: Date | string }
export interface OldEntry { _id: Id; foodLogId: string; mealType?: string | null; name?: string | null; quantity?: number | null; unit?: string | null; createdAt?: Date | string | null }
export interface OldPreference { userId: string; nutrientId?: string | null; customTarget?: number | null }

export interface UserRow { id: string; name: string; timezone: string; call_time: string | null; call_enabled: number; webhook_token: string; created_at: string; updated_at: string }
export interface ItemRow { id: string; user_id: string; local_date: string; meal: string | null; raw_name: string; normalized_name: string; quantity: number; unit: string; status: 'pending_food'; source: 'import'; created_at: string }
export interface GoalRow { user_id: string; nutrient: string; target: number }

export interface Stats {
  users: number;
  renamedUsers: string[];
  items: number;
  mergedDuplicateLogs: number;
  skippedEntries: { reason: string; count: number }[];
  dateStyles: { utcMidnight: number; istMidnight: number; string: number; other: number };
  goals: number;
}

function isValidTz(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function iso(v: Date | string | null | undefined, fallback: string): string {
  const d = v instanceof Date ? v : v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : fallback;
}

function ymdIn(date: Date, tz: string): { ymd: string; hm: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  return { ymd: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` };
}

/**
 * Spring stores a LocalDate as a BSON Date at midnight in the JVM's zone. That was UTC on the EC2
 * box but may be IST from a laptop, so pick the zone in which the instant is exactly midnight.
 */
export function localDateOf(v: Date | string): { date: string | null; style: keyof Stats['dateStyles'] } {
  if (typeof v === 'string') {
    const m = /^\d{4}-\d{2}-\d{2}/.exec(v);
    return m ? { date: m[0], style: 'string' } : { date: null, style: 'other' };
  }
  if (!(v instanceof Date) || Number.isNaN(v.getTime())) return { date: null, style: 'other' };
  const utc = ymdIn(v, 'UTC');
  if (utc.hm === '00:00') return { date: utc.ymd, style: 'utcMidnight' };
  const ist = ymdIn(v, DEFAULT_TZ);
  if (ist.hm === '00:00') return { date: ist.ymd, style: 'istMidnight' };
  return { date: ist.ymd, style: 'other' };
}

export function normalizeMeal(raw: string | null | undefined): string | null {
  const m = (raw ?? '').trim().toLowerCase();
  if (!m) return null;
  if (m.includes('breakfast') || m.includes('break fast') || m === 'morning meal') return 'breakfast';
  if (m.includes('lunch') || m === 'midday meal') return 'lunch';
  if (m.includes('snack')) return 'snack';
  if (m.includes('dinner') || m.includes('supper') || m === 'evening meal') return 'dinner';
  return null;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

export function transform(
  input: { users: OldUser[]; schedules: OldSchedule[]; logs: OldLog[]; entries: OldEntry[]; preferences: OldPreference[] },
  opts: { now: string; token: () => string },
): { users: UserRow[]; items: ItemRow[]; goals: GoalRow[]; stats: Stats } {
  const stats: Stats = {
    users: 0,
    renamedUsers: [],
    items: 0,
    mergedDuplicateLogs: 0,
    skippedEntries: [],
    dateStyles: { utcMidnight: 0, istMidnight: 0, string: 0, other: 0 },
    goals: 0,
  };
  const skip = new Map<string, number>();
  const skipped = (reason: string) => skip.set(reason, (skip.get(reason) ?? 0) + 1);

  // Users: names must be unique case-insensitively (they are the profile picker).
  const schedules = new Map(input.schedules.map((s) => [idOf(s.userId), s]));
  const taken = new Set<string>();
  const users: UserRow[] = [];
  for (const u of input.users) {
    const oldId = idOf(u._id);
    const base = (u.name?.trim() || u.email?.split('@')[0]?.trim() || `User ${oldId.slice(-4)}`).slice(0, 36);
    let name = base;
    for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${base} (${i})`;
    if (name !== base) stats.renamedUsers.push(`${base} → ${name}`);
    taken.add(name.toLowerCase());
    const s = schedules.get(oldId);
    const tz = [s?.timezone, u.timezone].find(isValidTz) ?? DEFAULT_TZ;
    const hasTime = s && Number.isInteger(s.hour) && Number.isInteger(s.minute) && s.hour! >= 0 && s.hour! < 24 && s.minute! >= 0 && s.minute! < 60;
    const created = iso(u.createdAt, opts.now);
    users.push({
      id: migId(oldId),
      name,
      timezone: tz,
      call_time: hasTime ? `${pad2(s!.hour!)}:${pad2(s!.minute!)}` : null,
      call_enabled: s ? (s.enabled === false ? 0 : 1) : 1,
      webhook_token: opts.token(),
      created_at: created,
      updated_at: opts.now,
    });
  }
  stats.users = users.length;
  const knownUsers = new Set(input.users.map((u) => idOf(u._id)));

  // Logs: one per (user, day); duplicates are merged by mapping every log id to the same day.
  const logDay = new Map<string, { userId: string; date: string }>();
  const seenDays = new Set<string>();
  for (const l of input.logs) {
    const { date, style } = localDateOf(l.logDate);
    stats.dateStyles[style]++;
    if (!date || !knownUsers.has(idOf(l.userId))) continue;
    const key = `${idOf(l.userId)}|${date}`;
    if (seenDays.has(key)) stats.mergedDuplicateLogs++;
    seenDays.add(key);
    logDay.set(idOf(l._id), { userId: idOf(l.userId), date });
  }

  const items: ItemRow[] = [];
  for (const e of input.entries) {
    const day = logDay.get(idOf(e.foodLogId));
    if (!day) {
      skipped('no matching food log / user');
      continue;
    }
    const raw = (e.name ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_NAME);
    const normalized = normalizeName(raw);
    if (!normalized) {
      skipped('empty name');
      continue;
    }
    const q = Number(e.quantity);
    if (!Number.isFinite(q) || q <= 0 || q > MAX_QUANTITY) {
      skipped('bad quantity');
      continue;
    }
    const unit = normalizeUnit(e.unit ?? '') || 'serving';
    items.push({
      id: migId(e._id),
      user_id: migId(day.userId),
      local_date: day.date,
      meal: normalizeMeal(e.mealType),
      raw_name: raw,
      normalized_name: normalized,
      quantity: q,
      unit: unit.slice(0, 30),
      status: 'pending_food',
      source: 'import',
      created_at: iso(e.createdAt, opts.now),
    });
  }
  stats.items = items.length;

  const goals: GoalRow[] = [];
  const goalKeys = new Set<string>();
  for (const p of input.preferences) {
    const key = p.nutrientId ?? '';
    if (!knownUsers.has(idOf(p.userId)) || !(NUTRIENT_KEYS as string[]).includes(key)) continue;
    if (typeof p.customTarget !== 'number' || !(p.customTarget > 0)) continue;
    const k = `${idOf(p.userId)}|${key}`;
    if (goalKeys.has(k)) continue;
    goalKeys.add(k);
    goals.push({ user_id: migId(p.userId), nutrient: key, target: p.customTarget });
  }
  stats.goals = goals.length;
  stats.skippedEntries = [...skip].map(([reason, count]) => ({ reason, count }));
  return { users, items, goals, stats };
}
