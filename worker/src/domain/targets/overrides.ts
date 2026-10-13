/**
 * Custom and care-team targets (WEEKLY_BREAKDOWN_PLAN.md 6.1, 6.4, 6.7). A typed number changes what a
 * bar is drawn against and nothing else: it never changes the score's standards, which are fixed
 * reference values. Applying an override is pure; the usual values a typed number is checked against,
 * and the warning it gets outside them, are in `overrideBounds` and `checkOverride`.
 */
import { CALORIE_CEILING } from '../goals';
import { ENERGY_SHARE, NUTRIENTS, type NutrientKey } from '../nutrients';
import { CALORIE_FLOOR } from './goal';
import type { SexForCalc, Target, TargetKind, TargetSet } from './types';

export interface Override {
  nutrient: NutrientKey;
  value: number;
  origin: 'custom' | 'care_team';
}

const catalogue = new Map(NUTRIENTS.map((n) => [n.key, n]));

/** A target from a typed number, on top of the recommended one if there is one. */
export function overrideTarget(o: Override, base?: Target): Target {
  const meta = catalogue.get(o.nutrient)!;
  const careTeam = o.origin === 'care_team';
  // Total sugars have no recommended target; a number typed for them is a personal limit (plan 6.4).
  const kind: TargetKind = base?.kind ?? (meta.kind === 'amount' ? 'limit' : meta.kind);
  const how = careTeam ? 'The number your care team gave you, as you typed it.' : 'A target you set. Reset it to go back to the recommended value.';
  let low = base?.low;
  let high = base?.high;
  if (base && kind === 'energy' && low !== undefined && high !== undefined) {
    low = o.value - (base.value - low);
    high = o.value + (high - base.value);
  } else if (base && kind === 'range' && low !== undefined && high !== undefined && base.value > 0) {
    low = (low * o.value) / base.value;
    high = (high * o.value) / base.value;
  }
  return {
    nutrient: o.nutrient,
    kind,
    unit: meta.unit,
    value: o.value,
    ...(low !== undefined ? { low } : {}),
    ...(high !== undefined ? { high } : {}),
    refType: base?.refType ?? (kind === 'energy' ? 'estimate' : kind === 'limit' ? 'limit' : kind === 'range' ? 'range' : 'estimate'),
    ...(base?.upperLevel !== undefined ? { upperLevel: base.upperLevel } : {}),
    ...(base?.shareRange ? { shareRange: base.shareRange } : {}),
    window: base?.window ?? meta.window,
    evidence: 'A',
    basis: careTeam ? 'care-team-target' : 'custom-target',
    how,
    scored: base?.scored ?? false,
    verdicts: base?.verdicts ?? true,
    origin: o.origin,
  };
}

/** The effective targets: recommended ones with each override applied, plus targets that exist only as overrides. */
export function applyOverrides(targets: readonly Target[], overrides: readonly Override[]): Target[] {
  const byNutrient = new Map(targets.map((t) => [t.nutrient, t]));
  const out = new Map(byNutrient);
  for (const o of overrides) out.set(o.nutrient, overrideTarget(o, byNutrient.get(o.nutrient)));
  // Keep the recommended order, then any new ones in the catalogue's order.
  const order = NUTRIENTS.map((n) => n.key as NutrientKey);
  return order.flatMap((k) => (out.has(k) ? [out.get(k)!] : []));
}

export interface OverrideCheck {
  /** False only for a number that cannot be a target at all. */
  ok: boolean;
  /** Why it was refused, in plain words. */
  message?: string;
  /** Saved, but away from the usual values: what to know about it (plan 6.4). */
  note?: string;
}

/**
 * The usual values for a typed number (plan 6.4). A number under `low` or over `high` is still saved, as the
 * person's own choice, with `below` or `above` said next to it. The app draws the same warning while the number is typed.
 */
export interface OverrideBounds {
  low?: number;
  high?: number;
  below?: string;
  above?: string;
}

const ENERGY_CEILING_SHARE = 1.25;
const fmt = (n: number) => n.toLocaleString('en-US');

/** The usual values for a nutrient's typed number, against the recommended set when there is one. */
export function overrideBounds(args: { nutrient: NutrientKey; set: TargetSet | null; sex: SexForCalc | null }): OverrideBounds {
  const { nutrient, set, sex } = args;
  const base = set?.targets.find((t) => t.nutrient === nutrient);
  if (nutrient === 'calories') {
    const floor = CALORIE_FLOOR[sex ?? 'female'];
    const maintenance = set?.energy?.maintenance;
    return {
      low: floor,
      below: `Under ${fmt(floor)} kcal is lower than most guidance for adults. A doctor or dietitian can help you set a target this low.`,
      ...(maintenance
        ? {
            high: Math.round((ENERGY_CEILING_SHARE * maintenance) / 10) * 10,
            above: 'That is more than 125% of your estimated needs. If you are very active, a higher activity level in your answers gives a better estimate.',
          }
        : { high: CALORIE_CEILING, above: `That is more than ${fmt(CALORIE_CEILING)} kcal a day, far above what most people need. Check the number.` }),
    };
  }
  if (!base) return {};
  switch (nutrient) {
    case 'protein': {
      const weight = set?.inputs?.weightKg;
      if (!weight) return {};
      const low = Math.round(0.8 * Math.min(weight, 30 * ((set?.inputs?.heightCm ?? 170) / 100) ** 2));
      return {
        low,
        below: `Under ${fmt(low)} g is below the recommended allowance of 0.8 g per kg.`,
        high: Math.round(2.0 * weight),
        above: 'No authority sets an upper limit for healthy adults; 2.0 g per kg is the highest figure guidelines treat as typical. With kidney disease, talk to your care team first.',
      };
    }
    case 'sodium':
      return {
        low: 1500,
        below: 'A limit under 1,500 mg asks for less than the body usually needs.',
        high: 2300,
        above: 'Above 2,300 mg is past the level where cutting back is expected to help.',
      };
    case 'fat':
    case 'carbs': {
      // The usual share of energy, in grams; past the whole energy target when there is no range.
      if (base.low !== undefined && base.high !== undefined) {
        const range = `${fmt(Math.round(base.low))} to ${fmt(Math.round(base.high))} g`;
        return {
          low: Math.round(base.low),
          below: `Under the usual range of ${range}, a share of your energy target.`,
          high: Math.round(base.high),
          above: `Over the usual range of ${range}, a share of your energy target.`,
        };
      }
      const energy = set?.energy?.target;
      if (!energy) return {};
      return { high: Math.floor(energy / (ENERGY_SHARE[nutrient]?.kcalPerGram ?? 4)), above: 'That alone is more energy than your energy target.' };
    }
    case 'saturatedFat':
    case 'addedSugar':
      return { high: base.value, above: 'That is more than 10% of your energy target, the limit WHO recommends.' };
    default: {
      // A vitamin or mineral: half of the recommended value, up to the upper level where it covers food, otherwise three times.
      const low = base.value * 0.5;
      return {
        low,
        below: 'That is under half of the recommended value.',
        ...(base.upperLevel !== undefined
          ? { high: base.upperLevel, above: `That is above the upper level of ${fmt(base.upperLevel)} ${base.unit}, the most considered safe a day.` }
          : { high: base.value * 3, above: 'That is more than three times the recommended value.' }),
      };
    }
  }
}

/**
 * Whether a typed number can be saved, and what to say about it (plan 6.4). Any positive number is saved: a number
 * away from the usual values (`overrideBounds`) comes back with a note instead of being refused.
 */
export function checkOverride(args: { nutrient: NutrientKey; value: number; set: TargetSet | null; sex: SexForCalc | null }): OverrideCheck {
  const { nutrient, value } = args;
  if (!Number.isFinite(value) || value <= 0) return { ok: false, message: `${nutrient} must be a positive number` };
  const b = overrideBounds(args);
  if (b.low !== undefined && value < b.low) return { ok: true, note: b.below };
  if (b.high !== undefined && value > b.high) return { ok: true, note: b.above };
  return { ok: true };
}
