/**
 * Copy rules for the sentences the engine writes (WEEKLY_BREAKDOWN_PLAN.md 5.8, 8.4, 11.6): no moralising
 * or alarming words, no diagnosis, nothing that tells a person what to eat. The app lints its own strings table
 * the same way; these are the strings that come from the Worker.
 */
import { describe, expect, it } from 'vitest';
import personas from '../../fixtures/golden/personas.json';
import { applyOverrides } from '../../../src/domain/targets/overrides';
import { genericTargetSet } from '../../../src/domain/targets/engine';
import { compute, type FixtureInput } from './helpers';

// The plan's own wording uses "chronic-disease risk" (C.1), so "disease" alone is allowed; disease NAMES are not (8.4).
export const BANNED = /\b(good|bad|clean|cheat|guilt|guilty|fail|failed|failure|off track|needs attention|streak|perfect|diagnos\w*|deficient|deficiency|at risk|treat\w*|cure|prescri\w*|diabet\w*|anaemi\w*|anemi\w*|obes\w*|cancer|hypertension)\b/i;

describe('the engine\'s own sentences', () => {
  it('every target explains itself in plain, neutral words, for all sixteen personas and the generic set', () => {
    const sets = [...personas.personas.map((p) => compute(p.input as FixtureInput)), genericTargetSet('2026-10-12')];
    let n = 0;
    for (const set of sets) {
      for (const t of set.targets) {
        n++;
        expect(t.how, `${t.nutrient}: ${t.how}`).not.toMatch(BANNED);
        expect(t.how.length).toBeGreaterThan(20);
        expect(t.how.length).toBeLessThan(400);
        expect(t.how.endsWith('.'), t.how).toBe(true);
      }
    }
    expect(n).toBeGreaterThan(150);
  });

  it('an Adequate Intake never gets "deficient" wording, and says what falling short means', () => {
    const set = compute(personas.personas[0]!.input as FixtureInput);
    for (const k of ['potassium', 'vitaminK', 'fiber']) {
      const t = set.targets.find((x) => x.nutrient === k)!;
      expect(t.refType).toBe('AI');
    }
    expect(set.targets.find((x) => x.nutrient === 'potassium')!.how).toMatch(/says little about what you need/);
    expect(set.targets.find((x) => x.nutrient === 'vitaminK')!.how).toMatch(/says little about what you need/);
  });

  it('the upper-level sentence appears only where the level covers food', () => {
    const set = compute(personas.personas[0]!.input as FixtureInput);
    const covers = (k: string) => /upper level of/.test(set.targets.find((x) => x.nutrient === k)!.how);
    expect(['calcium', 'iron', 'zinc', 'vitaminC', 'vitaminD'].every(covers)).toBe(true);
    expect(['vitaminA', 'vitaminE', 'magnesium', 'vitaminK', 'potassium'].some(covers)).toBe(false);
  });

  it('typed numbers say whose they are', () => {
    const set = genericTargetSet('2026-10-12');
    const custom = applyOverrides(set.targets, [{ nutrient: 'protein', value: 90, origin: 'custom' }, { nutrient: 'sodium', value: 1800, origin: 'care_team' }]);
    expect(custom.find((t) => t.nutrient === 'protein')).toMatchObject({ origin: 'custom', basis: 'custom-target', value: 90 });
    expect(custom.find((t) => t.nutrient === 'sodium')).toMatchObject({ origin: 'care_team', basis: 'care-team-target', value: 1800 });
    for (const t of custom) expect(t.how).not.toMatch(BANNED);
  });
});
