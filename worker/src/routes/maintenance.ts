import { json } from '../http';
import { runCascade } from '../domain/resolve';
import type { Router } from '../router';

export function registerMaintenance(router: Router) {
  /**
   * Re-matches every pending_food item against the current foods and aliases. Needed after a bulk
   * import (PLAN.md §10), whose rows arrive pending and would otherwise wait for the next food save.
   */
  router.add('POST', '/maintenance/resolve-pending', 'app', async ({ env }) => {
    const { results } = await env.DB.prepare(
      `SELECT DISTINCT normalized_name FROM log_items WHERE status = 'pending_food'`,
    ).all<{ normalized_name: string }>();
    const names = results.map((r) => r.normalized_name);
    if (names.length === 0) return json({ checked: 0, resolvedCount: 0, changed: 0 });
    const result = await runCascade(env.DB, [], { foodIds: [], names });
    return json({ checked: names.length, resolvedCount: result.resolvedCount, changed: result.changed });
  });
}
