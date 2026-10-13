/** Reference-data integrity (WEEKLY_BREAKDOWN_PLAN.md 11.3): structure, units, sources and pinned hashes. */
import { describe, expect, it } from 'vitest';
import { NUTRIENTS } from '../../src/domain/nutrients';
import {
  AGE_BANDS,
  GENERIC_ENERGY_KCAL,
  MICRO_KEYS,
  NASEM_MICROS,
  PLANT_BASED_PATTERNS,
  ageBandOf,
  genericReference,
  microReference,
  stableStringify,
} from '../../src/domain/reference/nasem';
import { tableHashes } from '../../src/domain/reference/hashes';
import { SOURCES, isSourceId } from '../../src/domain/reference/sources';
import { REPORT_CONFIG, SCORE_COMPONENTS } from '../../src/domain/reference/scoring';
import { genericTargetSet } from '../../src/domain/targets/engine';
import { microTarget } from '../../src/domain/targets/micros';

describe('the NASEM tables', () => {
  it('cover every age from 19 to 100 in four bands with no gap or overlap', () => {
    const bands = new Map<string, number[]>();
    for (let age = 19; age <= 100; age++) bands.set(ageBandOf(age), [...(bands.get(ageBandOf(age)) ?? []), age]);
    expect([...bands.keys()]).toEqual([...AGE_BANDS]);
    expect(bands.get('19-30')).toHaveLength(12);
    expect(bands.get('31-50')).toHaveLength(20);
    expect(bands.get('51-70')).toHaveLength(20);
    expect(bands.get('>70')).toHaveLength(30);
  });

  it('have every micronutrient for both sexes and all four bands, with a source and a unit that matches the catalogue', () => {
    for (const key of MICRO_KEYS) {
      const table = NASEM_MICROS[key];
      expect(table.female).toHaveLength(4);
      expect(table.male).toHaveLength(4);
      expect(isSourceId(table.basis)).toBe(true);
      const catalogueUnit = NUTRIENTS.find((n) => n.key === key)!.unit;
      // Vitamin A is in retinol activity equivalents, which the catalogue calls mcg.
      expect(table.unit.replace(' RAE', ''), key).toBe(catalogueUnit);
      for (const row of [...table.female, ...table.male]) {
        expect(row.ref).toBeGreaterThan(0);
        // An Adequate Intake has no EAR; an RDA does, and the EAR is below it.
        if (row.type === 'AI') expect(row.ear).toBeUndefined();
        else expect(row.ear!).toBeLessThan(row.ref);
      }
    }
  });

  it('keeps the Upper Level only where it covers food, and in the right place', () => {
    const covers = (k: (typeof MICRO_KEYS)[number]) => NASEM_MICROS[k].upper?.scope === 'all_sources';
    expect(MICRO_KEYS.filter(covers).sort()).toEqual(['calcium', 'iron', 'vitaminC', 'vitaminD', 'zinc']);
    expect(NASEM_MICROS.vitaminA.upper!.scope).toBe('preformed_only');
    expect(NASEM_MICROS.vitaminE.upper!.scope).toBe('supplements_only');
    expect(NASEM_MICROS.magnesium.upper!.scope).toBe('supplements_only');
    expect(NASEM_MICROS.vitaminK.upper).toBeUndefined();
    expect(NASEM_MICROS.potassium.upper).toBeUndefined();
    // A target carries an upper level only for those.
    expect(microTarget('calcium', 'female', '19-30', 'omnivore').upperLevel).toBe(2500);
    expect(microTarget('calcium', 'female', '51-70', 'omnivore').upperLevel).toBe(2000);
    expect(microTarget('vitaminA', 'female', '19-30', 'omnivore').upperLevel).toBeUndefined();
    expect(microTarget('magnesium', 'male', '19-30', 'omnivore').upperLevel).toBeUndefined();
  });

  it('takes the mean of the two rows for `average`, and multiplies iron by 1.8 for a plant-based pattern only', () => {
    expect(microReference('vitaminK', 'average', '31-50').value).toBe(105);
    expect(microReference('iron', 'average', '31-50').value).toBe(13);
    for (const pattern of PLANT_BASED_PATTERNS) expect(microTarget('iron', 'male', '31-50', pattern).value).toBe(14.4);
    for (const pattern of ['omnivore', 'pescatarian'] as const) expect(microTarget('iron', 'male', '31-50', pattern).value).toBe(8);
    expect(microTarget('iron', 'male', '31-50', 'vegan').plantBasedAdjusted).toBe(true);
    // Zinc gets no multiplier: the Academies found not enough data for one.
    expect(microTarget('zinc', 'male', '31-50', 'vegan').value).toBe(11);
  });

  it('pins a content hash of every table, so any edit shows up in review', () => {
    expect(tableHashes()).toEqual({
      micros: expect.stringMatching(/^[0-9a-f]{8}$/),
      eer: expect.stringMatching(/^[0-9a-f]{8}$/),
      macros: expect.stringMatching(/^[0-9a-f]{8}$/),
      generic: expect.stringMatching(/^[0-9a-f]{8}$/),
      icmr: expect.stringMatching(/^[0-9a-f]{8}$/),
    });
    // The values below were computed when the tables were checked against Appendix B and E (and the NASEM examples); the ICMR-NIN one
    // when its tables were read from the report's pages and cross-checked against a second reading of the same pages (it still needs a
    // second person to re-derive them from the official publication, plan 11.3).
    expect(tableHashes()).toMatchInlineSnapshot(`
      {
        "eer": "4fbe60e7",
        "generic": "516add8f",
        "icmr": "05cfeb05",
        "macros": "dd6b1166",
        "micros": "2da1a70d",
      }
    `);
  });

  it('is serialised the same however a table is written', () => {
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(stableStringify({ a: [2, { c: 2, d: 1 }], b: 1 }));
  });
});

describe('the generic reference (no health profile)', () => {
  it('is the same as the catalogue defaults, so the two cannot drift apart', () => {
    for (const n of NUTRIENTS) expect(genericReference(n.key), n.key).toBe(n.defaultGoal);
    expect(GENERIC_ENERGY_KCAL).toBe(2000);
  });

  it('sets no energy verdict, no score and no total-sugar target', () => {
    const set = genericTargetSet('2026-10-12');
    expect(set.mode).toBe('generic');
    // The energy reference is a label value, not an estimate of anyone's needs: the report gives it no verdict (weekly.test.ts).
    expect(set.energy).toBeNull();
    expect(set.targets.some((t) => t.scored)).toBe(false);
    expect(set.targets.find((t) => t.nutrient === 'sugar')).toBeUndefined();
    expect(set.targets.map((t) => t.nutrient)).toContain('vitaminD');
  });
});

describe('the sources registry', () => {
  it('has a title, a publisher and a link for every source the engine can cite', () => {
    for (const [id, s] of Object.entries(SOURCES)) {
      expect(s.title.length, id).toBeGreaterThan(5);
      expect(s.publisher.length, id).toBeGreaterThan(1);
      if (id !== 'custom-target' && id !== 'care-team-target') expect(s.url, id).toMatch(/^https:\/\//);
    }
  });
});

describe('the score standards and report config', () => {
  it('sum to 55 points now, in the order the plan gives', () => {
    expect(SCORE_COMPONENTS.reduce((s, c) => s + c.points, 0)).toBe(55);
    expect(SCORE_COMPONENTS.map((c) => c.id)).toEqual(['protein', 'fibre', 'potassium', 'calcium', 'iron', 'magnesium', 'zinc', 'sodium']);
    expect(REPORT_CONFIG.sodiumDensityFull).toBe(1100);
    expect(REPORT_CONFIG.sodiumDensityZero).toBe(2000);
  });
});
