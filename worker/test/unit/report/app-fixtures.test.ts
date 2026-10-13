/**
 * The app's test fixtures are the engine's real output (app/__tests__/fixtures/reports.json). When the engine changes what it sends,
 * this fails until `npm run fixtures:app` is run, so the app's tests never drift away from the Worker.
 */
import { describe, expect, it } from 'vitest';
import checkedIn from '../../../../app/__tests__/fixtures/reports.json';
import checkedInMeta from '../../../../app/__tests__/fixtures/meta.json';
import { metaNutrients } from '../../../src/routes/meta';
import { buildAppFixtures } from './app-fixtures';

describe('the weekly reports the app tests draw screens from', () => {
  it('are what the engine produces now (run `npm run fixtures:app` after a change)', () => {
    expect(JSON.parse(JSON.stringify(buildAppFixtures()))).toEqual(checkedIn);
  });

  it('carry the catalogue as /meta serves it', () => {
    expect({ nutrients: JSON.parse(JSON.stringify(metaNutrients())) }).toEqual(checkedInMeta);
  });

  it('cover every state the report screens replace content with', () => {
    const f = buildAppFixtures();
    expect(f.few_days.coverage.confidence).toBe('insufficient');
    expect(f.generic.mode).toBe('generic');
    expect(f.reference_only.mode).toBe('reference_only');
    expect(f.low_pressure.display.numbersHidden).toBe(true);
    expect(f.low_pressure_personal.display.numbersHidden).toBe(true);
    expect(f.ordinary.score.shown).toBe(90);
    expect(f.crash_diet_confirmed.score.withheld).toBe('low_intake');
    expect(f.pending.score.withheld).toBe('unknown_foods');
    expect(f.thin_data.score.withheld).toBe('thin_data');
    expect(f.score_off.score.withheld).toBe('off');
    expect(f.check_amounts.insights.map((i) => i.id)).toContain('check_amounts');
    expect(f.ordinary.nutrients.find((n) => n.nutrient === 'protein')!.trend).not.toBeNull();
  });
});
