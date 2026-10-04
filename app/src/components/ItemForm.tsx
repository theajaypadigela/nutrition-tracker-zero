import React from 'react';
import { Text, View } from 'react-native';
import type { Meal } from '@/api/types';
import { useMeta } from '@/state/MetaContext';
import { capitalize } from '@/utils/format';
import { ChipGroup, Field } from './ui';

export interface ItemDraft {
  name: string;
  quantity: string;
  unit: string | null;
  meal: Meal | null;
}

export const emptyDraft = (): ItemDraft => ({ name: '', quantity: '1', unit: null, meal: null });

export function draftError(d: ItemDraft): string | null {
  if (!d.name.trim()) return 'Enter what you ate';
  const q = Number(d.quantity);
  if (!Number.isFinite(q) || q <= 0) return 'Quantity must be a positive number';
  if (!d.unit) return 'Pick a unit';
  return null;
}

export default function ItemForm({ draft, onChange, error }: { draft: ItemDraft; onChange: (d: ItemDraft) => void; error?: string | null }) {
  const meta = useMeta();
  const unitOptions = draft.unit && !meta.units.includes(draft.unit) ? [...meta.units, draft.unit] : meta.units;
  return (
    <View>
      <Field label="Food" value={draft.name} onChangeText={(name) => onChange({ ...draft, name })} placeholder="e.g. idli" />
      <Field
        label="Quantity"
        value={draft.quantity}
        onChangeText={(quantity) => onChange({ ...draft, quantity })}
        keyboardType="decimal-pad"
      />
      <Text className="mb-1.5 text-sm font-medium text-ink-soft">Unit</Text>
      <ChipGroup options={unitOptions} value={draft.unit} onChange={(unit) => onChange({ ...draft, unit })} />
      <Text className="mb-1.5 mt-2 text-sm font-medium text-ink-soft">Meal (optional)</Text>
      <ChipGroup
        options={meta.meals}
        value={draft.meal}
        onChange={(meal) => onChange({ ...draft, meal })}
        labels={Object.fromEntries(meta.meals.map((m) => [m, capitalize(m)]))}
        allowNone
      />
      {error ? <Text className="mt-1 text-sm text-danger">{error}</Text> : null}
    </View>
  );
}
