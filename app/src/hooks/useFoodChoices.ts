import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '@/api/client';
import type { Food, HistoryFood } from '@/api/types';
import { buildCatalog, type Catalog } from '@/utils/foodChoices';

/**
 * The foods the log screen offers: the person's own log, the foods list and the common foods as one catalog. It loads when the screen
 * is focused and again each time the person comes back to it (a food added meanwhile is there), and `retry` loads it again.
 *
 * Either request may fail, say because the Worker has not been updated to serve the log yet, or the phone is offline. The catalog then
 * holds what did load, and the common foods, so the screen keeps working, and `failed` says so, so the screen can tell the person
 * instead of passing the common foods off as their own. `ready` turns true once both have answered, whichever way, so a list that is
 * on its way is never shown as the common foods first. An answer that arrives after a newer request was made is ignored.
 */
export function useFoodChoices(): { catalog: Catalog; ready: boolean; failed: boolean; retry: () => Promise<void> } {
  const [loaded, setLoaded] = useState<{ history: HistoryFood[] | null; foods: Food[] | null } | null>(null);
  const alive = useRef(true);
  const latest = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const run = ++latest.current;
    const [history, foods] = await Promise.all([
      api.getFoodHistory().then(
        r => r.foods,
        () => null,
      ),
      api.listFoods().then(
        r => r,
        () => null,
      ),
    ]);
    if (alive.current && run === latest.current) setLoaded({ history, foods });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const catalog = useMemo(() => buildCatalog({ history: loaded?.history ?? null, foods: loaded?.foods ?? null }), [loaded]);
  return { catalog, ready: loaded !== null, failed: loaded !== null && (loaded.history === null || loaded.foods === null), retry: load };
}
