import React from 'react';
import { ScrollView, View } from 'react-native';
import type { Meal } from '@/api/types';
import { Chip, Field, Text } from '@/components/kit';
import { useMeta } from '@/state/MetaContext';
import { space } from '@/theme';
import { capitalize } from '@/utils/format';

export interface ItemDraft {
  name: string;
  quantity: string;
  unit: string | null;
  meal: Meal | null;
}

export type DraftErrors = Partial<Record<'name' | 'quantity' | 'unit', string>>;

export const emptyDraft = (meal: Meal | null = null): ItemDraft => ({ name: '', quantity: '1', unit: null, meal });

export function draftErrors(d: ItemDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (!d.name.trim()) errors.name = 'Enter what you ate';
  const q = Number(d.quantity);
  if (!Number.isFinite(q) || q <= 0) errors.quantity = 'Must be above 0';
  if (!d.unit?.trim()) errors.unit = 'Pick a unit';
  return errors;
}

/**
 * One food to log: which meal, what, how much. The meal and the unit are each one tap on a chip;
 * the unit is also a free text field for anything not in the list ("ladle", "handful").
 */
export default function ItemForm({
  draft,
  onChange,
  errors = {},
}: {
  draft: ItemDraft;
  onChange: (d: ItemDraft) => void;
  errors?: DraftErrors;
}) {
  const meta = useMeta();
  return (
    <View style={{ gap: space.lg }}>
      <View style={{ gap: space.sm }}>
        <Text variant="smallStrong" tone="secondary">
          Meal
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {meta.meals.map(m => (
            <Chip
              key={m}
              label={capitalize(m)}
              selected={draft.meal === m}
              onPress={() => onChange({ ...draft, meal: draft.meal === m ? null : m })}
            />
          ))}
        </View>
      </View>

      <Field
        label="Food"
        required
        value={draft.name}
        onChangeText={name => onChange({ ...draft, name })}
        placeholder="e.g. idli"
        autoCapitalize="none"
        error={errors.name}
      />

      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View style={{ flex: 1 }}>
          <Field
            label="Quantity"
            required
            value={draft.quantity}
            onChangeText={quantity => onChange({ ...draft, quantity })}
            placeholder="1"
            keyboardType="decimal-pad"
            error={errors.quantity}
          />
        </View>
        <View style={{ flex: 1.3 }}>
          <Field
            label="Unit"
            required
            value={draft.unit ?? ''}
            onChangeText={unit => onChange({ ...draft, unit })}
            placeholder="piece, bowl, cup…"
            autoCapitalize="none"
            error={errors.unit}
          />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginHorizontal: -space.lg }} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}>
        {meta.units.map(u => (
          <Chip key={u} label={u} selected={draft.unit?.trim() === u} onPress={() => onChange({ ...draft, unit: u })} />
        ))}
      </ScrollView>
    </View>
  );
}
