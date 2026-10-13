import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '@/api/client';
import type { Meta } from '@/api/types';

/**
 * Fallback so forms work offline; the server's /meta is authoritative (the catalogue, kinds and generic references live there). It lists
 * every nutrient the Worker has, because a form built from a shorter list would save the rest as unknown, and the food form's rule is
 * that an empty field is 0. `__tests__/metaFallback.test.ts` keeps it equal to the Worker's own catalogue.
 */
export const FALLBACK_META: Meta = {
  units: ['piece', 'slice', 'katori', 'bowl', 'plate', 'cup', 'glass', 'tbsp', 'tsp', 'serving', 'g', 'kg', 'ml', 'l'],
  baseUnits: ['piece', 'slice', 'katori', 'bowl', 'plate', 'cup', 'glass', 'tbsp', 'tsp', 'serving', '100 g', '100 ml'],
  meals: ['breakfast', 'lunch', 'snack', 'dinner'],
  nutrients: [
    { key: 'calories', label: 'Calories', unit: 'kcal', kind: 'energy', window: 'week', group: 'energy_and_macros', defaultGoal: 2000 },
    { key: 'protein', label: 'Protein', unit: 'g', kind: 'minimum', window: 'week', group: 'energy_and_macros', defaultGoal: 50 },
    { key: 'carbs', label: 'Carbs', unit: 'g', kind: 'range', window: 'week', group: 'energy_and_macros', defaultGoal: 275, energyShare: { low: 0.45, high: 0.65, kcalPerGram: 4 } },
    { key: 'fat', label: 'Fat', unit: 'g', kind: 'range', window: 'week', group: 'energy_and_macros', defaultGoal: 78, energyShare: { low: 0.2, high: 0.35, kcalPerGram: 9 } },
    { key: 'saturatedFat', label: 'Saturated fat', unit: 'g', kind: 'limit', window: 'week', group: 'keep_in_check', defaultGoal: 22 },
    { key: 'fiber', label: 'Fiber', unit: 'g', kind: 'minimum', window: 'week', group: 'get_enough', defaultGoal: 28 },
    { key: 'sugar', label: 'Sugar', unit: 'g', kind: 'amount', window: 'week', group: 'keep_in_check', defaultGoal: null },
    { key: 'addedSugar', label: 'Added sugars', unit: 'g', kind: 'limit', window: 'week', group: 'keep_in_check', defaultGoal: 50 },
    { key: 'sodium', label: 'Sodium', unit: 'mg', kind: 'limit', window: 'week', group: 'keep_in_check', defaultGoal: 2300 },
    { key: 'vitaminA', label: 'Vitamin A', unit: 'mcg', kind: 'minimum', window: 'four_weeks', group: 'vitamins_and_minerals', defaultGoal: 800 },
    { key: 'vitaminC', label: 'Vitamin C', unit: 'mg', kind: 'minimum', window: 'four_weeks', group: 'vitamins_and_minerals', defaultGoal: 82.5 },
    { key: 'vitaminD', label: 'Vitamin D', unit: 'mcg', kind: 'minimum', window: 'four_weeks', group: 'vitamins_and_minerals', defaultGoal: 15 },
    { key: 'vitaminE', label: 'Vitamin E', unit: 'mg', kind: 'minimum', window: 'four_weeks', group: 'vitamins_and_minerals', defaultGoal: 15 },
    { key: 'vitaminK', label: 'Vitamin K', unit: 'mcg', kind: 'minimum', window: 'four_weeks', group: 'vitamins_and_minerals', defaultGoal: 105 },
    { key: 'vitaminB12', label: 'Vitamin B12', unit: 'mcg', kind: 'minimum', window: 'four_weeks', group: 'vitamins_and_minerals', defaultGoal: 2.4 },
    { key: 'folate', label: 'Folate', unit: 'mcg DFE', kind: 'minimum', window: 'four_weeks', group: 'vitamins_and_minerals', defaultGoal: 400 },
    { key: 'calcium', label: 'Calcium', unit: 'mg', kind: 'minimum', window: 'week', group: 'get_enough', defaultGoal: 1000 },
    { key: 'iron', label: 'Iron', unit: 'mg', kind: 'minimum', window: 'week', group: 'get_enough', defaultGoal: 13 },
    { key: 'potassium', label: 'Potassium', unit: 'mg', kind: 'minimum', window: 'week', group: 'get_enough', defaultGoal: 3000 },
    { key: 'magnesium', label: 'Magnesium', unit: 'mg', kind: 'minimum', window: 'week', group: 'get_enough', defaultGoal: 370 },
    { key: 'zinc', label: 'Zinc', unit: 'mg', kind: 'minimum', window: 'week', group: 'get_enough', defaultGoal: 9.5 },
  ],
  referenceSets: [
    { id: 'nasem', label: 'US and Canada (National Academies)', available: true },
    { id: 'icmr_nin', label: 'India (ICMR-NIN)', available: true },
  ],
};

const Ctx = createContext<Meta>(FALLBACK_META);

/** How long to wait before asking /meta again after it did not answer, a few times and then no more (the app is probably offline). */
const RETRY_DELAYS_MS = [2_000, 6_000, 15_000, 45_000];

export function MetaProvider({ children }: { children: React.ReactNode }) {
  const [meta, setMeta] = useState<Meta | undefined>();
  // Without the catalogue the forms run on the fallback above. If /meta did not answer, ask again; a person who opens the app on a bad
  // connection should not have to restart it to get the Worker's own list. A plain loop, so it does not depend on how renders batch.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = async (attempt: number) => {
      try {
        const answer = await api.meta();
        if (alive) setMeta(answer);
      } catch {
        if (alive && attempt < RETRY_DELAYS_MS.length) timer = setTimeout(() => ask(attempt + 1), RETRY_DELAYS_MS[attempt]);
      }
    };
    ask(0);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);
  return <Ctx.Provider value={meta ?? FALLBACK_META}>{children}</Ctx.Provider>;
}

export const useMeta = () => useContext(Ctx);
