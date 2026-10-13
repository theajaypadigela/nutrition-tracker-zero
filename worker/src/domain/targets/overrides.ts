/**
 * Custom and care-team targets (WEEKLY_BREAKDOWN_PLAN.md 6.1, 6.4, 6.7). A typed number changes what a
 * bar is drawn against and nothing else: it never changes the score's standards, which are fixed
 * reference values. Applying an override is pure; the bounds that decide whether a typed number is
 * accepted are in `checkOverride`.
 */
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
  ok: boolean;
  /** Why it was refused, in plain words. */
  message?: string;
  /** Accepted, but worth saying something about (plan 6.4). */
  note?: string;
}

const ENERGY_CEILING_SHARE = 1.25;

/**
 * Whether a typed number for a nutrient is acceptable, against the recommended set when there is one
 * (plan 6.4). Outside the bounds the person is told why; an unusual but reasonable value is accepted with a note.
 */
export function checkOverride(args: { nutrient: NutrientKey; value: number; set: TargetSet | null; sex: SexForCalc | null }): OverrideCheck {
  const { nutrient, value, set, sex } = args;
  if (!Number.isFinite(value) || value <= 0) return { ok: false, message: `${nutrient} must be a positive number` };
  const base = set?.targets.find((t) => t.nutrient === nutrient);
  if (nutrient === 'calories') {
    const floor = CALORIE_FLOOR[sex ?? 'female'];
    if (value < floor) return { ok: false, message: `Targets under ${floor.toLocaleString('en-US')} kcal need a doctor or dietitian` };
    const maintenance = set?.energy?.maintenance;
    if (maintenance && value > Math.round((ENERGY_CEILING_SHARE * maintenance) / 10) * 10) {
      return { ok: false, message: 'That is more than 125% of your estimated needs. If you are very active, choose a higher activity level instead.' };
    }
    return { ok: true };
  }
  if (!base) return { ok: true };
  switch (nutrient) {
    case 'protein': {
      const weight = set?.inputs?.weightKg;
      if (weight) {
        const min = 0.8 * Math.min(weight, 30 * ((set?.inputs?.heightCm ?? 170) / 100) ** 2);
        if (value < min) return { ok: false, message: `Protein under ${Math.round(min)} g is below the recommended allowance of 0.8 g per kg` };
        if (value > 2.0 * weight) {
          return { ok: true, note: 'No authority sets an upper limit for healthy adults; 2.0 g per kg is the highest figure guidelines treat as typical. With kidney disease, talk to your care team first.' };
        }
      }
      return { ok: true };
    }
    case 'sodium':
      if (value > 2300) return { ok: false, message: 'Sodium limits above 2,300 mg are not offered: that is the level where cutting back is expected to help' };
      if (value < 1500) return { ok: true, note: 'A limit under 1,500 mg asks for less than the body usually needs.' };
      return { ok: true };
    case 'fat':
    case 'carbs': {
      const energy = set?.energy?.target;
      const kcal = value * (ENERGY_SHARE[nutrient]?.kcalPerGram ?? 4);
      if (energy && kcal > energy) return { ok: false, message: 'That alone is more energy than your energy target' };
      return { ok: true, note: 'Saved as your own number. The usual range is a share of energy, shown as information.' };
    }
    case 'saturatedFat':
    case 'addedSugar':
      // A personal limit: any positive number. Above the recommended 10% of energy it is accepted with a note, not refused (plan 6.4).
      return value > base.value ? { ok: true, note: 'That is more than 10% of your energy target, the limit WHO recommends.' } : { ok: true };
    default: {
      // A vitamin or mineral: 50% of the recommended value, up to the upper level where it covers food, otherwise 300%.
      if (value < base.value * 0.5) return { ok: true, note: 'That is under half of the recommended value.' };
      const ceiling = base.upperLevel ?? base.value * 3;
      if (value > ceiling) return { ok: false, message: `That is above ${ceiling.toLocaleString('en-US')}, the most this target allows` };
      return { ok: true };
    }
  }
}
