import React, { createContext, useContext } from 'react';
import { api } from '@/api/client';
import type { Meta } from '@/api/types';
import { useAsync } from '@/hooks/useAsync';

/** Fallback so forms work offline; the server's /meta is authoritative. */
export const FALLBACK_META: Meta = {
  units: ['piece', 'slice', 'katori', 'bowl', 'plate', 'cup', 'glass', 'tbsp', 'tsp', 'serving', 'g', 'kg', 'ml', 'l'],
  baseUnits: ['piece', 'slice', 'katori', 'bowl', 'plate', 'cup', 'glass', 'tbsp', 'tsp', 'serving', '100 g', '100 ml'],
  meals: ['breakfast', 'lunch', 'snack', 'dinner'],
  nutrients: [
    { key: 'calories', label: 'Calories', unit: 'kcal', defaultGoal: 2500 },
    { key: 'protein', label: 'Protein', unit: 'g', defaultGoal: 180 },
    { key: 'carbs', label: 'Carbs', unit: 'g', defaultGoal: 250 },
    { key: 'fat', label: 'Fat', unit: 'g', defaultGoal: 70 },
    { key: 'fiber', label: 'Fiber', unit: 'g', defaultGoal: 30 },
    { key: 'sugar', label: 'Sugar', unit: 'g', defaultGoal: 40 },
    { key: 'sodium', label: 'Sodium', unit: 'mg', defaultGoal: 2300 },
  ],
};

const Ctx = createContext<Meta>(FALLBACK_META);

export function MetaProvider({ children }: { children: React.ReactNode }) {
  const { data } = useAsync(() => api.meta(), []);
  return <Ctx.Provider value={data ?? FALLBACK_META}>{children}</Ctx.Provider>;
}

export const useMeta = () => useContext(Ctx);
