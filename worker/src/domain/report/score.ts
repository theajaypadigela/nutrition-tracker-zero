/**
 * The "Nutrient mix" (WEEKLY_BREAKDOWN_PLAN.md 5.5): a 0 to 100 summary of how well the MIX of what was
 * logged, per calorie, covers the person's reference intakes and stays inside the sodium standard. It is a
 * descriptive summary built on densities per 1,000 kcal, pooled over the assessed days, so under-logging
 * and partial logging cannot skew it and eating less or more does not move it; how much was eaten is judged
 * by the energy card and the low-intake rule. It is not validated against outcomes and never claims health.
 *
 * Unknown parts earn nothing and stay in the denominator, so missing data can never RAISE the score by
 * construction: with every part known it reads "about N", with any unknown "at least N", and when the
 * unknown parts are worth more than a quarter of the points it is withheld.
 */
import { REPORT_CONFIG, scoreComponents, type ReportConfig, type ScoreComponentSpec } from '../reference/scoring';
import { totalsOf } from '../intake/totals';
import type { IntakeDay } from '../intake/types';
import { coverageOf } from '../quality/coverage';
import type { ScoreComponent } from './types';
import type { NutrientKey } from '../nutrients';

/** 1 at or below `full`, 0 at or above `zero`, linear between: the shape of a limit component. */
export function linear(x: number, full: number, zero: number): number {
  return x <= full ? 1 : x >= zero ? 0 : (zero - x) / (zero - full);
}

export interface ScoreInput {
  days: readonly IntakeDay[];
  /** Which days count: indices into `days`. */
  indices: readonly number[];
  /** Recommended reference intake per day, for the adequacy components. Never a custom override (plan 6.1). */
  standards: Partial<Record<NutrientKey, number>>;
  /** The recommended energy target, kcal a day, that "target density" is measured against. */
  energyTarget: number;
  /** The reference set the standards come from, for the words of the breakdown (the National Academies' when left out). */
  referenceSet?: 'nasem' | 'icmr_nin';
}

export interface ScoreResult {
  /** The score 0 to 100 to one decimal, or null when there is nothing to score or too much is unknown. */
  value: number | null;
  /** Components even when withheld, so the breakdown can say what is unknown. */
  components: ScoreComponent[];
  points: number;
  outOf: number;
}

/** The raw score over `indices` (all of `days` that count, or a subset for the leave-one-day-out range). */
export function computeScore(input: ScoreInput, cfg: ReportConfig = REPORT_CONFIG): ScoreResult {
  const { days, indices, standards, energyTarget, referenceSet } = input;
  const picked = indices.map((i) => days[i]!);
  const kcal = totalsOf(picked, 'calories').known;
  if (picked.length === 0 || kcal <= 0 || energyTarget <= 0) return { value: null, components: [], points: 0, outOf: 0 };

  const components: ScoreComponent[] = [];
  for (const spec of scoreComponents(cfg, referenceSet)) components.push(scoreComponent(spec, picked, kcal, standards, energyTarget, cfg));

  const outOf = components.reduce((s, c) => s + c.outOf, 0);
  const points = components.reduce((s, c) => s + c.points, 0);
  const unknown = components.filter((c) => !c.scorable).reduce((s, c) => s + c.outOf, 0);
  if (outOf === 0 || unknown / outOf > cfg.maxUnknownShare) return { value: null, components, points, outOf };
  return { value: Math.round((1000 * points) / outOf) / 10, components, points, outOf };
}

function scoreComponent(
  spec: ScoreComponentSpec,
  days: readonly IntakeDay[],
  kcal: number,
  standards: Partial<Record<NutrientKey, number>>,
  energyTarget: number,
  cfg: ReportConfig,
): ScoreComponent {
  const t = totalsOf(days, spec.nutrient);
  const density = (t.known / kcal) * 1000;
  const base = { id: spec.id, outOf: spec.points, standard: spec.standard, density };

  if (spec.shape === 'sodium') {
    // A limit: a partial total can prove "over" (zero credit), never "within the limit" (plan 7.1).
    const coverage = coverageOf(t, true);
    const credit = linear(density, cfg.sodiumDensityFull, cfg.sodiumDensityZero);
    const scorable = coverage >= 1 || credit === 0;
    return { ...base, coverage, scorable, points: scorable ? spec.points * credit : 0 };
  }

  if (spec.shape === 'share_of_energy') {
    // A limit as a share of the logged energy (HEI-2020): the same rule as sodium, a partial total can prove "over", never "within".
    const coverage = coverageOf(t, true);
    const share = (spec.kcalPerGram! * t.known) / kcal;
    const credit = linear(share, spec.fullAtOrBelow!, spec.zeroAtOrAbove!);
    const scorable = coverage >= 1 || credit === 0;
    return { ...base, coverage, scorable, points: scorable ? spec.points * credit : 0 };
  }

  const coverage = coverageOf(t, false);
  const reference = standards[spec.nutrient];
  if (reference === undefined || reference <= 0) return { ...base, coverage, scorable: false, points: 0 };
  // Full credit from 90% of the reference density, the same edge as "on target"; the known amounts are a valid minimum.
  const targetDensity = reference / (energyTarget / 1000);
  const credit = Math.min(1, density / (cfg.meetsRatio * targetDensity));
  const scorable = coverage >= cfg.coverageForScore;
  return { ...base, coverage, scorable, points: scorable ? spec.points * credit : 0 };
}

/**
 * The range of the score when each assessed day is left out in turn: a visible measure of how much one
 * day drives it (plan 5.5). Null when the full score is withheld or there are fewer than four days.
 */
export function jackknife(input: ScoreInput, cfg: ReportConfig = REPORT_CONFIG): [number, number] | null {
  if (input.indices.length < 4 || computeScore(input, cfg).value === null) return null;
  const values: number[] = [];
  for (const left of input.indices) {
    const v = computeScore({ ...input, indices: input.indices.filter((i) => i !== left) }, cfg).value;
    if (v !== null) values.push(v);
  }
  return values.length ? [Math.min(...values), Math.max(...values)] : null;
}

/** The card's figure: nearest 5, and rounded DOWN when a component is unknown ("at least N"). */
export function shownScore(value: number, isMinimum: boolean): number {
  return (isMinimum ? Math.floor(value / 5) : Math.round(value / 5)) * 5;
}
