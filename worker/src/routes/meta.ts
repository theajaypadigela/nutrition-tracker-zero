import { json } from '../http';
import { ENERGY_SHARE, NUTRIENTS, type NutrientKey } from '../domain/nutrients';
import { ENGINE_VERSION } from '../domain/targets/types';
import { BASE_UNITS, LOGGED_UNITS, MEALS } from '../domain/units';
import type { Router } from '../router';

/** Where a nutrient sits on the "All nutrients" screen (plan 5.2). */
const GROUP: Record<NutrientKey, 'energy_and_macros' | 'get_enough' | 'keep_in_check' | 'vitamins_and_minerals'> = {
  calories: 'energy_and_macros',
  protein: 'energy_and_macros',
  carbs: 'energy_and_macros',
  fat: 'energy_and_macros',
  saturatedFat: 'keep_in_check',
  fiber: 'get_enough',
  potassium: 'get_enough',
  calcium: 'get_enough',
  iron: 'get_enough',
  magnesium: 'get_enough',
  zinc: 'get_enough',
  sodium: 'keep_in_check',
  sugar: 'keep_in_check',
  addedSugar: 'keep_in_check',
  vitaminA: 'vitamins_and_minerals',
  vitaminC: 'vitamins_and_minerals',
  vitaminD: 'vitamins_and_minerals',
  vitaminE: 'vitamins_and_minerals',
  vitaminK: 'vitamins_and_minerals',
  vitaminB12: 'vitamins_and_minerals',
  folate: 'vitamins_and_minerals',
};

/** The reference sets a profile can choose: the US and Canada's National Academies, and India's ICMR-NIN (Phase 6). */
const REFERENCE_SETS = [
  { id: 'nasem', label: 'US and Canada (National Academies)', available: true },
  { id: 'icmr_nin', label: 'India (ICMR-NIN)', available: true },
];

/** The catalogue as `GET /meta` serves it (also what the app's test fixtures are made from). */
export function metaNutrients() {
  return NUTRIENTS.map(({ key, label, unit, kind, window, defaultGoal }) => ({
    key,
    label,
    unit,
    kind,
    window,
    group: GROUP[key],
    defaultGoal,
    ...(ENERGY_SHARE[key] ? { energyShare: ENERGY_SHARE[key] } : {}),
  }));
}

export function registerMeta(router: Router) {
  router.add('GET', '/health', 'none', () => json({ ok: true, service: 'nutrition-tracker-zero' }));

  router.add('GET', '/meta', 'app', () =>
    json({
      units: LOGGED_UNITS,
      baseUnits: BASE_UNITS,
      meals: MEALS,
      // `defaultGoal` is the generic reference (2,000 kcal adult), not a personal target; `kind` says
      // what a target for the nutrient means; `window` which span judges it.
      engineVersion: ENGINE_VERSION,
      referenceSets: REFERENCE_SETS,
      nutrients: metaNutrients(),
    }),
  );
}
