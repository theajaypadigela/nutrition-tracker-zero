import { json } from '../http';
import { NUTRIENTS } from '../domain/nutrients';
import { BASE_UNITS, LOGGED_UNITS, MEALS } from '../domain/units';
import type { Router } from '../router';

export function registerMeta(router: Router) {
  router.add('GET', '/health', 'none', () => json({ ok: true, service: 'nutrition-tracker-zero' }));

  router.add('GET', '/meta', 'app', () =>
    json({
      units: LOGGED_UNITS,
      baseUnits: BASE_UNITS,
      meals: MEALS,
      nutrients: NUTRIENTS.map(({ key, label, unit, defaultGoal }) => ({ key, label, unit, defaultGoal })),
    }),
  );
}
