import React from 'react';
import { ChevronDownIcon } from 'lucide-react-native';
import type { Meal } from '@/api/types';
import { useMeta } from '@/state/MetaContext';
import { capitalize } from '@/utils/format';
import { Text } from './ui/text';
import { VStack } from './ui/vstack';
import { HStack } from './ui/hstack';
import { Input, InputField } from './ui/input';
import {
  Select,
  SelectItem,
  SelectTrigger,
  SelectInput,
  SelectIcon,
  SelectPortal,
  SelectBackdrop,
  SelectContent,
  SelectDragIndicatorWrapper,
  SelectDragIndicator,
} from './ui/select';

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
  if (!Number.isFinite(q) || q <= 0) errors.quantity = 'Quantity must be a positive number';
  if (!d.unit?.trim()) errors.unit = 'Pick a unit';
  return errors;
}

const NO_MEAL = 'none';

/** The old Manual Food Log form fields: meal select, food name, quantity + unit, custom unit. */
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
  const listedUnit = draft.unit && meta.units.includes(draft.unit) ? draft.unit : undefined;
  const fieldClass = (bad?: string) => `rounded-xl border-2 ${bad ? 'border-red-400' : 'border-gray-200'}`;

  return (
    <VStack className="gap-5">
      {/* Meal Type */}
      <VStack className="gap-1">
        <Text className="text-sm font-medium text-gray-700">Meal Type</Text>
        <Select
          selectedValue={draft.meal ?? undefined}
          initialLabel={draft.meal ? capitalize(draft.meal) : undefined}
          onValueChange={val => onChange({ ...draft, meal: val === NO_MEAL ? null : (val as Meal) })}
        >
          <SelectTrigger variant="outline" size="lg" className={fieldClass()}>
            <SelectInput placeholder="Select meal type (optional)" className="flex-1" />
            <SelectIcon className="mr-3" as={ChevronDownIcon} />
          </SelectTrigger>
          <SelectPortal>
            <SelectBackdrop />
            <SelectContent>
              <SelectDragIndicatorWrapper>
                <SelectDragIndicator />
              </SelectDragIndicatorWrapper>
              {meta.meals.map(meal => (
                <SelectItem key={meal} label={capitalize(meal)} value={meal} />
              ))}
              <SelectItem label="No meal" value={NO_MEAL} />
            </SelectContent>
          </SelectPortal>
        </Select>
      </VStack>

      {/* Food Name */}
      <VStack className="gap-1">
        <Text className="text-sm font-medium text-gray-700">
          Food Name <Text className="text-red-500">*</Text>
        </Text>
        <Input variant="outline" size="lg" className={fieldClass(errors.name)}>
          <InputField
            value={draft.name}
            onChangeText={name => onChange({ ...draft, name })}
            placeholder="e.g. idli"
            autoCapitalize="none"
          />
        </Input>
        {errors.name ? <Text className="text-xs text-red-500 mt-0.5">{errors.name}</Text> : null}
      </VStack>

      {/* Quantity & Unit row */}
      <HStack className="gap-3">
        <VStack className="flex-1 gap-1">
          <Text className="text-sm font-medium text-gray-700">
            Quantity <Text className="text-red-500">*</Text>
          </Text>
          <Input variant="outline" size="lg" className={fieldClass(errors.quantity)}>
            <InputField
              value={draft.quantity}
              onChangeText={quantity => onChange({ ...draft, quantity })}
              placeholder="e.g. 2"
              keyboardType="decimal-pad"
            />
          </Input>
        </VStack>

        <VStack className="flex-1 gap-1">
          <Text className="text-sm font-medium text-gray-700">
            Unit <Text className="text-red-500">*</Text>
          </Text>
          {/* Keyed by value: typing a unit below must not leave an older pick showing here. */}
          <Select
            key={listedUnit ?? 'custom'}
            selectedValue={listedUnit}
            initialLabel={listedUnit}
            onValueChange={unit => onChange({ ...draft, unit })}
          >
            <SelectTrigger variant="outline" size="lg" className={fieldClass(errors.unit)}>
              <SelectInput placeholder="Unit" className="flex-1" />
              <SelectIcon className="mr-3" as={ChevronDownIcon} />
            </SelectTrigger>
            <SelectPortal>
              <SelectBackdrop />
              <SelectContent>
                <SelectDragIndicatorWrapper>
                  <SelectDragIndicator />
                </SelectDragIndicatorWrapper>
                {meta.units.map(u => (
                  <SelectItem key={u} label={u} value={u} />
                ))}
              </SelectContent>
            </SelectPortal>
          </Select>
        </VStack>
      </HStack>
      {errors.quantity ? <Text className="text-xs text-red-500 -mt-4">{errors.quantity}</Text> : null}
      {errors.unit ? <Text className="text-xs text-red-500 -mt-4">{errors.unit}</Text> : null}

      {/* Custom unit input if unit not in list */}
      <VStack className="gap-1">
        <Text className="text-sm text-gray-500">Or type a custom unit:</Text>
        <Input variant="outline" size="md" className="rounded-xl border-2 border-gray-200">
          <InputField
            value={draft.unit ?? ''}
            onChangeText={unit => onChange({ ...draft, unit })}
            placeholder="e.g. ladle, handful"
            autoCapitalize="none"
          />
        </Input>
      </VStack>
    </VStack>
  );
}
