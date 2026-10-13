import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Trash2 } from 'lucide-react-native';
import { api, errorMessage } from '@/api/client';
import type { Item, Meal } from '@/api/types';
import { Button, Chip, Field, Notice, Sheet, Text } from '@/components/kit';
import { useMeta } from '@/state/MetaContext';
import { size, space } from '@/theme';
import { capitalize, formatNumber } from '@/utils/format';

interface FoodErrors {
  foodName: string;
  quantity: string;
  servingSize: string;
}

const NO_ERRORS: FoodErrors = { foodName: '', quantity: '', servingSize: '' };

/**
 * Edit one logged item: name, quantity, unit and meal. When the item doesn't count yet it says
 * why and links to the fix; when `onDelete` is given it also offers to remove the item.
 */
export function EditItemSheet({
  item,
  isOpen,
  onClose,
  onSaved,
  onDelete,
}: {
  item: Item | null;
  isOpen: boolean;
  onClose: () => void;
  /** Called after the item was saved on the server. */
  onSaved: () => void;
  onDelete?: (item: Item) => void;
}) {
  const navigation = useNavigation();
  const meta = useMeta();
  const [foodName, setFoodName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [servingSize, setServingSize] = useState('');
  const [meal, setMeal] = useState<Meal | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [errors, setErrors] = useState<FoodErrors>(NO_ERRORS);

  useEffect(() => {
    if (isOpen && item) {
      setFoodName(item.rawName);
      setQuantity(String(item.quantity));
      setServingSize(item.unit);
      setMeal(item.meal);
      setSaveError('');
      setErrors(NO_ERRORS);
    }
  }, [isOpen, item]);

  const validateForm = () => {
    const next = { ...NO_ERRORS };
    let valid = true;

    if (!foodName.trim()) {
      next.foodName = 'Food name is required';
      valid = false;
    }

    if (!quantity.trim()) {
      next.quantity = 'Required';
      valid = false;
    } else if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
      next.quantity = 'Must be above 0';
      valid = false;
    }

    if (!servingSize.trim()) {
      next.servingSize = 'Required';
      valid = false;
    }

    setErrors(next);
    return valid;
  };

  const handleSave = async () => {
    if (!item || !validateForm()) return;

    setIsSaving(true);
    setSaveError('');

    try {
      await api.updateItem(item.id, {
        name: foodName.trim(),
        quantity: Number(quantity),
        unit: servingSize.trim(),
        meal,
      });
      onSaved();
      onClose();
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
      setIsSaving(false);
    }
  };

  const goTo = (go: () => void) => {
    onClose();
    go();
  };

  const unitOptions = item && !meta.units.includes(item.unit) ? [...meta.units, item.unit] : meta.units;
  const counted =
    item?.status === 'resolved'
      ? meta.nutrients
          .filter(n => item.nutrients[n.key] != null)
          .slice(0, 7)
          .map(n => `${n.label} ${formatNumber(item.nutrients[n.key]!, 1)} ${n.unit}`)
          .join(' · ')
      : '';

  return (
    <Sheet
      visible={isOpen}
      onClose={onClose}
      title="Edit food item"
      footer={<Button label="Save changes" size="lg" fullWidth loading={isSaving} onPress={handleSave} />}
    >
      {item?.status === 'pending_food' ? (
        <Notice
          tone="warning"
          action={{
            label: 'Enter food values',
            onPress: () => goTo(() => navigation.navigate('FoodEditor', { name: item.rawName, unitHint: item.unit })),
          }}
        >
          Nobody has entered values for "{item.normalizedName}" yet, so it doesn't count toward your totals.
        </Notice>
      ) : null}
      {item?.status === 'pending_unit' && item.foodId ? (
        <Notice
          tone="warning"
          action={{
            label: `Convert ${item.unit}`,
            onPress: () =>
              goTo(() =>
                navigation.navigate('UnitConversion', {
                  foodId: item.foodId!,
                  foodName: item.foodName ?? item.rawName,
                  baseUnit: item.baseUnit ?? '',
                  unit: item.unit,
                }),
              ),
          }}
        >
          {item.foodName} is stored per {item.baseUnit}; nobody has said how much one {item.unit} is yet.
        </Notice>
      ) : null}

      <Field
        label="Food name"
        value={foodName}
        onChangeText={text => {
          setFoodName(text);
          if (errors.foodName) setErrors({ ...errors, foodName: '' });
        }}
        placeholder="e.g. idli"
        autoCapitalize="none"
        error={errors.foodName}
      />

      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View style={{ flex: 1 }}>
          <Field
            label="Quantity"
            value={quantity}
            onChangeText={text => {
              setQuantity(text);
              if (errors.quantity) setErrors({ ...errors, quantity: '' });
            }}
            placeholder="1"
            keyboardType="decimal-pad"
            error={errors.quantity}
          />
        </View>
        <View style={{ flex: 1.3 }}>
          <Field
            label="Unit"
            value={servingSize}
            onChangeText={text => {
              setServingSize(text);
              if (errors.servingSize) setErrors({ ...errors, servingSize: '' });
            }}
            placeholder="bowl, cup…"
            autoCapitalize="none"
            error={errors.servingSize}
          />
        </View>
      </View>

      {/* Bleeds to the sheet's edges so the chips scroll under the side padding. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={{ marginHorizontal: -size.gutter }}
        contentContainerStyle={{ paddingHorizontal: size.gutter, gap: space.sm }}
      >
        {unitOptions.map(u => (
          <Chip key={u} label={u} selected={servingSize.trim() === u} onPress={() => setServingSize(u)} />
        ))}
      </ScrollView>

      <View style={{ gap: space.sm }}>
        <Text variant="smallStrong" tone="secondary">
          Meal
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {meta.meals.map(m => (
            <Chip key={m} label={capitalize(m)} selected={meal === m} onPress={() => setMeal(meal === m ? null : m)} />
          ))}
        </View>
      </View>

      {counted ? <Notice tone="info">Counts as {item?.foodName}: {counted}</Notice> : null}
      {saveError ? <Notice tone="danger">{saveError}</Notice> : null}

      {item && onDelete ? (
        <Button
          label="Delete item"
          icon={Trash2}
          variant="dangerGhost"
          fullWidth
          onPress={() => {
            onClose();
            onDelete(item);
          }}
        />
      ) : null}
    </Sheet>
  );
}
