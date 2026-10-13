/**
 * The health profile, its targets, weigh-ins, export and erasure (WEEKLY_BREAKDOWN_PLAN.md sections 6, 8, 9.3).
 * Every route here but `preview` and the one-time secret claim needs the profile's own secret: the shared app
 * token alone cannot read or change anyone's body measurements (8.3.2).
 *
 * What is stored, and what is not. A personalised profile stores its inputs, weigh-ins and versioned target
 * sets. A reference-only profile stores the mode, two flags and the consent, and NO body data: switching to
 * it erases the body rows. The safety answers are read once and never written anywhere.
 */
import { randomToken, sha256Hex } from '../auth';
import { badRequest, conflict, HttpError, json, noContent, notFound, nowIso, readJson } from '../http';
import { SOURCES, type Source, type SourceId } from '../domain/reference/sources';
import { daysBetween, isValidDate, localDateIn } from '../domain/time';
import { goalRowsStatement, insertSetStatement, latestWeight, loadHealth, modeOf, profileInputOf, sameSet, storedSafety, targetsWithAdvice, weightsStatement, withCurrentAgeBand, type HealthProfileRow, type HealthState, type WeightRow } from '../health';
import { computeTargets, genericTargetSet, referenceOnlySet } from '../domain/targets/engine';
import { BMI_MAX, BMI_MIN, entryGate } from '../domain/targets/eligibility';
import { ageOn, bmiOf, parseBirth, parseHealthProfile, parseSafety, WEIGHT_RANGE_KG } from '../domain/targets/profile';
import { setInForce } from '../domain/report/weekly';
import type { HealthProfileInput, Mode, SafetyAnswers, Target, TargetSet, Warning } from '../domain/targets/types';
import type { Ctx, Router } from '../router';
import { asObject } from '../validate';

const BODY_FIELDS = ['birthYear', 'birthMonth', 'sexForCalc', 'heightCm', 'weightKg', 'activity', 'goal', 'pace', 'pattern', 'referenceSet'] as const;
const MAX_CONSENT_VERSION = 40;
/** A re-check is asked for when two weigh-ins a day apart differ by more than this (plan 7.7). */
const IMPLAUSIBLE_DAILY_CHANGE_KG = 3;
/** A new weight changes the targets only when it moves the weight by more than 3% or 2 kg, whichever is larger (plan 6.2). */
const MATERIAL_SHARE = 0.03;
const MATERIAL_KG = 2;
/** The loss goal's check-in comes due after this many weeks (plan 8.1 G11). */
export const LOSS_CHECK_IN_WEEKS = 12;

// ---- response shapes -----------------------------------------------------------------------------------

export function profileJson(row: HealthProfileRow | null, weight: WeightRow | null) {
  if (!row) return { mode: 'generic' as Mode };
  const personalised = row.target_mode === 'personalised';
  return {
    mode: modeOf(row),
    ...(personalised
      ? {
          birthYear: row.birth_year,
          ...(row.birth_month !== null ? { birthMonth: row.birth_month } : {}),
          sexForCalc: row.sex_for_calc,
          heightCm: row.height_cm,
          activity: row.activity_level,
          goal: row.goal,
          pace: row.pace,
          pattern: row.diet_pattern,
          referenceSet: row.reference_set,
          ...(weight ? { weightKg: weight.weight_kg, weightDate: weight.local_date } : {}),
        }
      : {}),
    dietInteractingMedicine: row.diet_interacting_medicine === 1,
    numbersHidden: row.numbers_hidden === 1,
    consentVersion: row.consent_version,
    consentedAt: row.consented_at,
  };
}

/** The set as the app consumes it: what was computed, and every number with its reason and source. */
export function targetSetJson(set: TargetSet) {
  return {
    id: set.id,
    effectiveFrom: set.effectiveFrom,
    engineVersion: set.engineVersion,
    referenceSet: set.referenceSet,
    mode: set.mode,
    inputs: set.inputs,
    energy: set.energy,
    targets: set.targets,
    warnings: set.warnings,
    availableGoals: set.availableGoals,
  };
}

/** The sources for the bases a list of targets cites, so the app can show a title and a link without its own copy. */
export function sourcesOf(targets: readonly Target[]): Record<string, Source> {
  const out: Record<string, Source> = {};
  for (const t of targets) out[t.basis] = SOURCES[t.basis as SourceId];
  return out;
}

/** The 12-week check-in of a loss goal (plan 8.1 G11): due after twelve weeks without the safety check being asked again. */
export function checkInOf(set: TargetSet | null, today: string): { due: boolean; weeks: number } | null {
  if (!set || set.inputs?.goalApplied !== 'lose' || !set.lossStartedOn) return null;
  const weeks = Math.floor(daysBetween(set.lossStartedOn, today) / 7);
  return { due: weeks >= LOSS_CHECK_IN_WEEKS, weeks };
}

// ---- deciding the profile ------------------------------------------------------------------------------

type Decision =
  | { kind: 'reference_only'; warnings: Warning[] }
  | { kind: 'personalised'; set: TargetSet; input: HealthProfileInput; warnings: Warning[] };

/**
 * Turns a request into a decision, without storing anything. `existing` lets a save leave fields out, taking
 * them from what is stored; a preview never reads stored health data and so passes none.
 */
function decide(args: {
  raw: Record<string, unknown>;
  safety: SafetyAnswers;
  hasSafety: boolean;
  existing: { row: HealthProfileRow; weightKg: number | null } | null;
  today: string;
}): Decision {
  const { raw, safety, hasSafety, existing, today } = args;
  const bodyPresent = BODY_FIELDS.some((f) => raw[f] !== undefined);
  const stored = existing && existing.row.target_mode === 'personalised' ? profileInputOf(existing.row, existing.weightKg) : null;

  // Safety answers and age first, before any body field is even read (G1 to G4).
  const birth = raw.birthYear !== undefined ? parseBirth(raw, today) : null;
  if (birth && !birth.ok) throw badRequest(birth.error, { field: birth.field });
  const age = birth ? ageOn(today, birth.value.birthYear, birth.value.birthMonth) : null;
  const effectiveSafety = hasSafety ? safety : { ...safety, dietInteractingMedicine: existing?.row.diet_interacting_medicine === 1 };
  const early = entryGate({ age, bmi: null, safety: effectiveSafety });
  if (early.mode === 'reference_only') return { kind: 'reference_only', warnings: early.warnings };

  // A save with a body but no safety answers needs a profile that already passed the check.
  if (!hasSafety && !stored) {
    if (existing?.row.target_mode === 'reference_only') throw new HttpError(400, 'safety_required', 'Answer the safety check to set personal targets.');
    if (!existing) throw new HttpError(400, 'safety_required', 'Answer the safety check to set personal targets.');
  }
  if (!bodyPresent && !stored) throw badRequest('profile must include your birth year, sex, height, weight, activity and goal', { field: 'profile' });

  const merged = {
    ...(stored ? { birthYear: stored.birthYear, birthMonth: stored.birthMonth, sexForCalc: stored.sexForCalc, heightCm: stored.heightCm, weightKg: stored.weightKg, activity: stored.activity, goal: stored.goal, pace: stored.pace, pattern: stored.pattern, referenceSet: stored.referenceSet } : {}),
    ...Object.fromEntries(Object.entries(raw).filter(([k]) => (BODY_FIELDS as readonly string[]).includes(k))),
  };
  const parsed = parseHealthProfile(merged, today);
  if (!parsed.ok) throw badRequest(parsed.error, { field: parsed.field });
  const set = computeTargets(parsed.value, today, { safety: effectiveSafety, id: crypto.randomUUID() });
  if (set.mode === 'reference_only') return { kind: 'reference_only', warnings: set.warnings };
  return { kind: 'personalised', set, input: parsed.value, warnings: set.warnings };
}

// ---- the routes ----------------------------------------------------------------------------------------

function upsertProfile(db: D1Database, p: {
  userId: string;
  mode: 'personalised' | 'reference_only';
  input: ReturnType<typeof profileInputOf>;
  medicine: boolean;
  numbersHidden: boolean;
  consentVersion: string;
  consentedAt: string;
  now: string;
}): D1PreparedStatement {
  const i = p.mode === 'personalised' ? p.input : null;
  return db
    .prepare(
      `INSERT INTO health_profiles (user_id, target_mode, birth_year, birth_month, sex_for_calc, height_cm, activity_level, goal, pace, diet_pattern,
                                    reference_set, diet_interacting_medicine, numbers_hidden, consent_version, consented_at, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, COALESCE(?9, 'standard'), COALESCE(?10, 'omnivore'), COALESCE(?11, 'nasem'), ?12, ?13, ?14, ?15, ?16, ?16)
       ON CONFLICT (user_id) DO UPDATE SET
         target_mode = excluded.target_mode, birth_year = excluded.birth_year, birth_month = excluded.birth_month,
         sex_for_calc = excluded.sex_for_calc, height_cm = excluded.height_cm, activity_level = excluded.activity_level,
         goal = excluded.goal, pace = excluded.pace, diet_pattern = excluded.diet_pattern, reference_set = excluded.reference_set,
         diet_interacting_medicine = excluded.diet_interacting_medicine, numbers_hidden = excluded.numbers_hidden,
         consent_version = excluded.consent_version, consented_at = excluded.consented_at, updated_at = excluded.updated_at`,
    )
    .bind(
      p.userId,
      p.mode,
      i?.birthYear ?? null,
      i?.birthMonth ?? null,
      i?.sexForCalc ?? null,
      i?.heightCm ?? null,
      i?.activity ?? null,
      i?.goal ?? null,
      i?.pace ?? null,
      i?.pattern ?? null,
      i?.referenceSet ?? null,
      p.medicine ? 1 : 0,
      p.numbersHidden ? 1 : 0,
      p.consentVersion,
      p.consentedAt,
      p.now,
    );
}

function upsertWeight(db: D1Database, userId: string, date: string, kg: number, now: string): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO weight_entries (id, user_id, local_date, weight_kg, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (user_id, local_date) DO UPDATE SET weight_kg = excluded.weight_kg`,
    )
    .bind(crypto.randomUUID(), userId, date, kg, now);
}

/** The set a new profile save should append, or null if it says the same as the newest one. */
function nextSet(set: TargetSet, state: HealthState, hasSafety: boolean): TargetSet | null {
  const latest = state.sets[state.sets.length - 1] ?? null;
  // A loss goal's twelve weeks run from when it started; answering the safety check again restarts them (plan 8.1 G11).
  if (set.inputs?.goalApplied === 'lose') {
    set.lossStartedOn = latest?.inputs?.goalApplied === 'lose' && !hasSafety ? (latest.lossStartedOn ?? set.effectiveFrom) : set.effectiveFrom;
  } else set.lossStartedOn = null;
  return latest && sameSet(set, latest) ? null : set;
}

export function registerProfile(router: Router) {
  /** A profile made before secrets existed claims one, once. Whoever claims first wins (plan 8.3.2). */
  router.add('POST', '/me/secret', 'user', async ({ env, user }: Ctx) => {
    if (user!.secret_hash) throw conflict('secret_already_set', 'This profile already has a secret.');
    const secret = randomToken();
    const res = await env.DB.prepare('UPDATE users SET secret_hash = ?1, updated_at = ?2 WHERE id = ?3 AND secret_hash IS NULL')
      .bind(await sha256Hex(secret), nowIso(), user!.id)
      .run();
    if (res.meta.changes === 0) throw conflict('secret_already_set', 'This profile already has a secret.');
    return json({ secret }, 201);
  });

  router.add('GET', '/me/profile', 'secret', async ({ env, user }: Ctx) => {
    const today = localDateIn(user!.timezone);
    const state = await loadHealth(env.DB, user!.id);
    const { sets, added } = withCurrentAgeBand(state, today);
    if (added) await env.DB.batch([insertSetStatement(env.DB, user!.id, added, nowIso())]);
    const current = setInForce(sets, today);
    return json({
      profile: profileJson(state.profile, latestWeight(state.weights)),
      targetSet: current && state.profile?.target_mode === 'personalised' ? targetSetJson(current) : null,
      checkIn: checkInOf(current, today),
    });
  });

  router.add('PUT', '/me/profile', 'secret', async ({ req, env, user }: Ctx) => {
    const db = env.DB;
    const body = asObject(await readJson(req));
    const raw = body.profile === undefined || body.profile === null ? {} : asObject(body.profile);
    const today = localDateIn(user!.timezone);
    const now = nowIso();
    const state = await loadHealth(db, user!.id);
    const existing = state.profile;
    const hasSafety = body.safety !== undefined && body.safety !== null;
    const bodyPresent = BODY_FIELDS.some((f) => raw[f] !== undefined);

    if (raw.numbersHidden !== undefined && typeof raw.numbersHidden !== 'boolean') throw badRequest('numbersHidden must be true or false', { field: 'numbersHidden' });
    if (body.consentVersion !== undefined && (typeof body.consentVersion !== 'string' || body.consentVersion.length < 1 || body.consentVersion.length > MAX_CONSENT_VERSION)) {
      throw badRequest(`consentVersion must be 1-${MAX_CONSENT_VERSION} characters`, { field: 'consentVersion' });
    }
    const safetyParsed = parseSafety(body.safety);
    if (!safetyParsed.ok) throw badRequest(safetyParsed.error, { field: safetyParsed.field });
    const safety = safetyParsed.value;
    const consentVersion = (body.consentVersion as string | undefined) ?? existing?.consent_version;
    if (!consentVersion) throw new HttpError(400, 'consent_required', 'Say you have seen what is stored, and why, before saving.');

    // A display-only change: low-pressure mode, or a new consent version. Nothing is recomputed.
    if (!bodyPresent && !hasSafety) {
      if (!existing) throw new HttpError(400, 'profile_required', 'Save a health profile first.');
      if (raw.numbersHidden === undefined && body.consentVersion === undefined) throw badRequest('Nothing to update');
      await db
        .prepare('UPDATE health_profiles SET numbers_hidden = COALESCE(?1, numbers_hidden), consent_version = ?2, consented_at = CASE WHEN ?3 THEN ?4 ELSE consented_at END, updated_at = ?4 WHERE user_id = ?5')
        .bind(raw.numbersHidden === undefined ? null : raw.numbersHidden ? 1 : 0, consentVersion, body.consentVersion !== undefined ? 1 : 0, now, user!.id)
        .run();
      const after = await loadHealth(db, user!.id);
      return json({ profile: profileJson(after.profile, latestWeight(after.weights)), targetSet: currentSetJson(after, today), warnings: [] });
    }

    const weight = latestWeight(state.weights);
    const decision = decide({ raw, safety, hasSafety, existing: existing ? { row: existing, weightKg: weight?.weight_kg ?? null } : null, today });
    const numbersHidden = raw.numbersHidden !== undefined ? (raw.numbersHidden as boolean) : hasSafety && safety.eatingDisorder ? true : existing?.numbers_hidden === 1;
    const medicine = hasSafety ? safety.dietInteractingMedicine : existing?.diet_interacting_medicine === 1;
    const consentedAt = body.consentVersion !== undefined || !existing ? now : existing.consented_at;

    if (decision.kind === 'reference_only') {
      // Nothing about the body is kept, and nothing says why. Anything stored before is erased with it.
      await db.batch([
        db.prepare('DELETE FROM weight_entries WHERE user_id = ?').bind(user!.id),
        db.prepare('DELETE FROM target_sets WHERE user_id = ?').bind(user!.id),
        upsertProfile(db, { userId: user!.id, mode: 'reference_only', input: null, medicine, numbersHidden, consentVersion, consentedAt, now }),
      ]);
      const after = await loadHealth(db, user!.id);
      return json({ profile: profileJson(after.profile, null), targetSet: null, warnings: [{ id: 'reference_only', severity: 'info' }, ...decision.warnings.filter((w) => w.id !== 'reference_only' && (w.id === 'under_19' || w.id === 'bmi_out_of_range'))] });
    }

    const fresh = nextSet(decision.set, state, hasSafety);
    const writes = [
      upsertProfile(db, { userId: user!.id, mode: 'personalised', input: decision.input, medicine, numbersHidden, consentVersion, consentedAt, now }),
      upsertWeight(db, user!.id, today, decision.input.weightKg, now),
      ...(fresh ? [insertSetStatement(db, user!.id, fresh, now)] : []),
    ];
    await db.batch(writes);
    const after = await loadHealth(db, user!.id);
    const current = fresh ?? setInForce(after.sets, today);
    return json({ profile: profileJson(after.profile, latestWeight(after.weights)), targetSet: current ? targetSetJson(current) : null, warnings: decision.warnings, checkIn: checkInOf(current, today) });
  });

  /** The same computation without saving: for the live preview in onboarding and "what if" edits. It never reads stored health data, so it needs no secret. */
  router.add('POST', '/me/targets/preview', 'user', async ({ req, user }: Ctx) => {
    const body = asObject(await readJson(req));
    const raw = body.profile === undefined || body.profile === null ? {} : asObject(body.profile);
    const safetyParsed = parseSafety(body.safety);
    if (!safetyParsed.ok) throw badRequest(safetyParsed.error, { field: safetyParsed.field });
    const today = localDateIn(user!.timezone);
    const decision = decide({ raw, safety: safetyParsed.value, hasSafety: true, existing: null, today });
    if (decision.kind === 'reference_only') return json({ targetSet: targetSetJson(referenceOnlySet(today, decision.warnings)) });
    return json({ targetSet: targetSetJson({ ...decision.set, id: null }) });
  });

  router.add('GET', '/me/targets', 'secret', async ({ env, url, user }: Ctx) => {
    const today = localDateIn(user!.timezone);
    const date = url.searchParams.get('date') ?? today;
    if (!isValidDate(date)) throw badRequest('date must be YYYY-MM-DD');
    const state = await loadHealth(env.DB, user!.id);
    const { sets, added } = withCurrentAgeBand(state, today);
    if (added) await env.DB.batch([insertSetStatement(env.DB, user!.id, added, nowIso())]);
    const mode = modeOf(state.profile);
    const hidden = state.profile?.numbers_hidden === 1;
    const set = mode === 'personalised' ? setInForce(sets, date) : null;
    const base = mode === 'generic' ? genericTargetSet(date) : mode === 'reference_only' ? referenceOnlySet(date, [{ id: 'reference_only', severity: 'info' }]) : set!;
    // Low-pressure mode never receives a number it was asked to hide: the targets screen is not shown (plan 8.2).
    if (hidden) return json({ mode, numbersHidden: true, targetSet: { id: base.id, effectiveFrom: base.effectiveFrom, engineVersion: base.engineVersion, mode: base.mode, warnings: base.warnings }, targets: [], sources: {}, checkIn: null });
    const targets = targetsWithAdvice(base, state.goals, mode);
    return json({ mode, numbersHidden: false, targetSet: targetSetJson(base), targets, sources: sourcesOf(targets), checkIn: checkInOf(set, today) });
  });

  router.add('GET', '/me/weights', 'secret', async ({ env, url, user }: Ctx) => {
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if ((from && !isValidDate(from)) || (to && !isValidDate(to))) throw badRequest('from and to must be YYYY-MM-DD');
    const { results } = await weightsStatement(env.DB, user!.id, from ?? '0000-01-01', to ?? '9999-12-31').all<WeightRow>();
    return json({ weights: results.map((w) => ({ date: w.local_date, weightKg: w.weight_kg })) });
  });

  router.add('POST', '/me/weights', 'secret', async ({ req, env, user }: Ctx) => {
    const db = env.DB;
    const body = asObject(await readJson(req));
    const today = localDateIn(user!.timezone);
    const date = body.date === undefined ? today : String(body.date);
    if (!isValidDate(date)) throw badRequest('date must be YYYY-MM-DD', { field: 'date' });
    if (date > today) throw badRequest('A weigh-in cannot be in the future', { field: 'date' });
    const kg = typeof body.weightKg === 'string' ? Number(body.weightKg) : body.weightKg;
    if (typeof kg !== 'number' || !Number.isFinite(kg) || kg < WEIGHT_RANGE_KG.min || kg > WEIGHT_RANGE_KG.max) {
      throw badRequest(`weightKg must be between ${WEIGHT_RANGE_KG.min} and ${WEIGHT_RANGE_KG.max}`, { field: 'weightKg' });
    }
    const state = await loadHealth(db, user!.id);
    const row = state.profile;
    if (!row || row.target_mode !== 'personalised') throw new HttpError(409, 'weights_not_available', 'Weigh-ins are only kept with personal targets.');
    // A weight that would put the BMI outside the range is refused, not stored: it would silently erase the profile.
    const bmi = bmiOf(kg, row.height_cm!);
    if (bmi < BMI_MIN || bmi > BMI_MAX) throw badRequest('That weight does not look right for your height. Check it and try again.', { field: 'weightKg' });
    const previous = [...state.weights].reverse().find((w) => w.local_date !== date && Math.abs(daysBetween(w.local_date, date)) <= 1);
    if (previous && Math.abs(previous.weight_kg - kg) > IMPLAUSIBLE_DAILY_CHANGE_KG && body.confirm !== true) {
      throw conflict('weight_change_large', `That is more than ${IMPLAUSIBLE_DAILY_CHANGE_KG} kg different from the day before. Is that right?`, { previousKg: previous.weight_kg });
    }
    const now = nowIso();
    const writes: D1PreparedStatement[] = [upsertWeight(db, user!.id, date, kg, now)];
    let added: TargetSet | null = null;
    const latest = latestWeight(state.weights);
    const newest = !latest || date >= latest.local_date;
    const setNow = state.sets[state.sets.length - 1] ?? null;
    if (newest && setNow?.inputs) {
      const threshold = Math.max(MATERIAL_SHARE * setNow.inputs.weightKg, MATERIAL_KG);
      if (Math.abs(kg - setNow.inputs.weightKg) >= threshold) {
        const input = profileInputOf(row, kg)!;
        const fresh = computeTargets(input, today, { safety: storedSafety(row), id: crypto.randomUUID() });
        if (fresh.mode === 'personalised') {
          fresh.lossStartedOn = fresh.inputs?.goalApplied === 'lose' ? (setNow.lossStartedOn ?? today) : null;
          added = fresh;
          writes.push(insertSetStatement(db, user!.id, fresh, now));
        }
      }
    }
    await db.batch(writes);
    return json({ weight: { date, weightKg: kg }, targetSet: added ? targetSetJson(added) : null, changed: added !== null }, 201);
  });

  router.add('DELETE', '/me/weights/:date', 'secret', async ({ env, params, user }: Ctx) => {
    if (!isValidDate(params.date!)) throw badRequest('date must be YYYY-MM-DD');
    const res = await env.DB.prepare('DELETE FROM weight_entries WHERE user_id = ?1 AND local_date = ?2').bind(user!.id, params.date!).run();
    if (res.meta.changes === 0) throw notFound('No weigh-in on that date');
    return noContent();
  });

  /** Everything stored about the person's health, as JSON (plan 8.3.3). */
  router.add('GET', '/me/export', 'secret', async ({ env, user }: Ctx) => {
    const db = env.DB;
    const [profile, sets, weights, marks, goals] = await db.batch([
      db.prepare('SELECT * FROM health_profiles WHERE user_id = ?').bind(user!.id),
      db.prepare('SELECT * FROM target_sets WHERE user_id = ? ORDER BY effective_from, created_at, id').bind(user!.id),
      db.prepare('SELECT local_date, weight_kg, created_at FROM weight_entries WHERE user_id = ? ORDER BY local_date').bind(user!.id),
      db.prepare('SELECT local_date, status, updated_at FROM day_status WHERE user_id = ? ORDER BY local_date').bind(user!.id),
      goalRowsStatement(db, user!.id),
    ]);
    const p = (profile as D1Result<HealthProfileRow>).results[0] ?? null;
    return json({
      exportedAt: nowIso(),
      profile: p ? { ...p, user_id: undefined } : null,
      targetSets: (sets as D1Result<{ id: string; effective_from: string; engine_version: string; reference_set: string; inputs_json: string; targets_json: string; created_at: string }>).results.map((s) => ({
        id: s.id,
        effectiveFrom: s.effective_from,
        engineVersion: s.engine_version,
        referenceSet: s.reference_set,
        inputs: JSON.parse(s.inputs_json),
        targets: JSON.parse(s.targets_json),
        createdAt: s.created_at,
      })),
      weights: (weights as D1Result<{ local_date: string; weight_kg: number; created_at: string }>).results.map((w) => ({ date: w.local_date, weightKg: w.weight_kg, createdAt: w.created_at })),
      dayMarks: (marks as D1Result<{ local_date: string; status: string; updated_at: string }>).results.map((m) => ({ date: m.local_date, status: m.status, updatedAt: m.updated_at })),
      goals: (goals as D1Result<{ nutrient: string; target: number; origin: string; updated_at: string | null }>).results,
    });
  });

  /** Erases the health tables and the care-team numbers; the food log and every other number the person typed stay. */
  router.add('DELETE', '/me/health-data', 'secret', async ({ env, user }: Ctx) => {
    const db = env.DB;
    await db.batch([
      db.prepare('DELETE FROM day_status WHERE user_id = ?').bind(user!.id),
      db.prepare('DELETE FROM target_sets WHERE user_id = ?').bind(user!.id),
      db.prepare('DELETE FROM weight_entries WHERE user_id = ?').bind(user!.id),
      db.prepare('DELETE FROM health_profiles WHERE user_id = ?').bind(user!.id),
      db.prepare("DELETE FROM user_goals WHERE user_id = ? AND origin = 'care_team'").bind(user!.id),
    ]);
    return noContent();
  });

  /**
   * Deletes the whole profile. `calls`, `log_items` and `user_goals` reference `users(id)` WITHOUT a cascade, and
   * so does `foods.added_by`, so a plain DELETE FROM users fails: the rows go first, in one batch, then the
   * names come off the shared foods (which stay, without a name), then the user, which cascades through the
   * health tables (plan 9.1).
   */
  router.add('DELETE', '/me', 'secret', async ({ env, user }: Ctx) => {
    const db = env.DB;
    const id = user!.id;
    await db.batch([
      db.prepare('DELETE FROM log_items WHERE user_id = ?').bind(id),
      db.prepare('DELETE FROM calls WHERE user_id = ?').bind(id),
      db.prepare('DELETE FROM user_goals WHERE user_id = ?').bind(id),
      db.prepare('UPDATE foods SET added_by = NULL WHERE added_by = ?').bind(id),
      db.prepare('UPDATE food_aliases SET added_by = NULL WHERE added_by = ?').bind(id),
      db.prepare('UPDATE food_units SET added_by = NULL WHERE added_by = ?').bind(id),
      db.prepare('DELETE FROM users WHERE id = ?').bind(id),
    ]);
    return noContent();
  });
}

function currentSetJson(state: HealthState, today: string) {
  const current = state.profile?.target_mode === 'personalised' ? setInForce(state.sets, today) : null;
  return current ? targetSetJson(current) : null;
}
