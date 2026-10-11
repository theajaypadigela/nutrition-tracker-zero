import React, { useState, useEffect } from 'react';
import { Dimensions, ScrollView, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../ui/text';
import { VStack } from '../ui/vstack';
import { HStack } from '../ui/hstack';
import { Icon, CloseIcon } from '../ui/icon';
import { Button, ButtonText } from '../ui/button';
import { Input, InputField } from '../ui/input';
import {
  Drawer,
  DrawerBackdrop,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
} from '../ui/drawer';
import { Heading } from '../ui/heading';
import { QuickPill } from '@/components/common/Form';
import { api, errorMessage } from '@/api/client';
import type { Item, Meal } from '@/api/types';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboard';
import { useMeta } from '@/state/MetaContext';
import { capitalize, formatNumber } from '@/utils/format';

interface FoodErrors {
  foodName: string;
  quantity: string;
  servingSize: string;
}

const NO_ERRORS: FoodErrors = { foodName: '', quantity: '', servingSize: '' };

interface EditFoodDrawerProps {
  item: Item | null;
  isOpen: boolean;
  onClose: () => void;
  /** Called after the item was saved on the server. */
  onSaved: () => void;
}

export const EditFoodDrawer: React.FC<EditFoodDrawerProps> = ({
  item,
  isOpen,
  onClose,
  onSaved,
}) => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const meta = useMeta();
  const { keyboardHeight, scrollProps } = useKeyboardAwareScroll();
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
    const newErrors = { ...NO_ERRORS };
    let isValid = true;

    if (!foodName.trim()) {
      newErrors.foodName = 'Food name is required';
      isValid = false;
    }

    if (!quantity.trim()) {
      newErrors.quantity = 'Quantity is required';
      isValid = false;
    } else if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
      newErrors.quantity = 'Quantity must be a positive number';
      isValid = false;
    }

    if (!servingSize.trim()) {
      newErrors.servingSize = 'Serving size is required';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSave = async () => {
    if (!item || !validateForm()) {
      return;
    }

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
  const counted = item?.status === 'resolved'
    ? meta.nutrients
        .filter(n => item.nutrients[n.key] != null)
        .slice(0, 7)
        .map(n => `${n.label} ${formatNumber(item.nutrients[n.key]!, 1)} ${n.unit}`)
        .join(' · ')
    : '';

  return (
    <Drawer isOpen={isOpen} size="lg" anchor="bottom" onClose={onClose} useRNModal>
      <DrawerBackdrop />
      {/* With the keyboard open the sheet sits on top of it and takes the space above:
          edge-to-edge Android doesn't resize for the keyboard, even inside the modal. */}
      <DrawerContent
        className="bg-white rounded-t-3xl"
        style={
          keyboardHeight
            ? { bottom: keyboardHeight, height: Dimensions.get('window').height - keyboardHeight - insets.top - 16 }
            : undefined
        }
      >
        <DrawerHeader className="border-b border-gray-200 pb-4">
          <Heading size="xl" className="text-gray-900 font-bold">
            Edit Food Item
          </Heading>
          <DrawerCloseButton>
            <Icon as={CloseIcon} />
          </DrawerCloseButton>
        </DrawerHeader>

        {/* flex-1 + shrink: the body scrolls inside the fixed-height sheet instead of pushing
            the footer off its bottom (gluestack's body defaults to shrink-0). */}
        <DrawerBody
          // gluestack types the body's ref as its props; at runtime it is the ScrollView.
          ref={scrollProps.ref as never}
          onScroll={scrollProps.onScroll}
          scrollEventThrottle={scrollProps.scrollEventThrottle}
          className="py-6 flex-1 shrink"
          keyboardShouldPersistTaps="handled"
        >
          <VStack space="lg">
            {/* Why this item doesn't count yet, with the fix one tap away */}
            {item?.status === 'pending_food' ? (
              <View className="bg-amber-50 p-4 rounded-xl border border-amber-200">
                <Text className="text-xs text-amber-800">
                  Nobody has entered values for "{item.normalizedName}" yet, so it doesn't count toward your totals.
                </Text>
                <TouchableOpacity
                  className="mt-2"
                  onPress={() => goTo(() => navigation.navigate('FoodEditor', { name: item.rawName, unitHint: item.unit }))}
                >
                  <Text className="text-sm font-semibold text-amber-700">Enter food values ›</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {item?.status === 'pending_unit' && item.foodId ? (
              <View className="bg-amber-50 p-4 rounded-xl border border-amber-200">
                <Text className="text-xs text-amber-800">
                  {item.foodName} is stored per {item.baseUnit}; nobody has said how much one {item.unit} is yet.
                </Text>
                <TouchableOpacity
                  className="mt-2"
                  onPress={() =>
                    goTo(() =>
                      navigation.navigate('UnitConversion', {
                        foodId: item.foodId!,
                        foodName: item.foodName ?? item.rawName,
                        baseUnit: item.baseUnit ?? '',
                        unit: item.unit,
                      }),
                    )
                  }
                >
                  <Text className="text-sm font-semibold text-amber-700">Convert {item.unit} ›</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Food Name Field */}
            <VStack space="xs">
              <Text className="text-sm font-semibold text-gray-700 mb-1">
                Food Name
              </Text>
              <Input
                variant="outline"
                size="lg"
                className={`rounded-xl border-2 ${
                  errors.foodName
                    ? 'border-red-500 bg-red-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <InputField
                  placeholder="Enter food name"
                  value={foodName}
                  onChangeText={text => {
                    setFoodName(text);
                    if (errors.foodName) {
                      setErrors({ ...errors, foodName: '' });
                    }
                  }}
                  className="text-base text-gray-900"
                />
              </Input>
              {errors.foodName ? (
                <Text className="text-xs text-red-600 mt-1">
                  {errors.foodName}
                </Text>
              ) : null}
            </VStack>

            {/* Quantity Field */}
            <VStack space="xs">
              <Text className="text-sm font-semibold text-gray-700 mb-1">
                Quantity
              </Text>
              <Input
                variant="outline"
                size="lg"
                className={`rounded-xl border-2 ${
                  errors.quantity
                    ? 'border-red-500 bg-red-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <InputField
                  placeholder="Enter quantity (e.g., 1, 2.5)"
                  value={quantity}
                  onChangeText={text => {
                    setQuantity(text);
                    if (errors.quantity) {
                      setErrors({ ...errors, quantity: '' });
                    }
                  }}
                  keyboardType="decimal-pad"
                  className="text-base text-gray-900"
                />
              </Input>
              {errors.quantity ? (
                <Text className="text-xs text-red-600 mt-1">
                  {errors.quantity}
                </Text>
              ) : null}
            </VStack>

            {/* Serving Size Field */}
            <VStack space="xs">
              <Text className="text-sm font-semibold text-gray-700 mb-1">
                Serving Size
              </Text>
              <Input
                variant="outline"
                size="lg"
                className={`rounded-xl border-2 ${
                  errors.servingSize
                    ? 'border-red-500 bg-red-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <InputField
                  placeholder="Enter serving size (e.g., bowl, cup)"
                  value={servingSize}
                  onChangeText={text => {
                    setServingSize(text);
                    if (errors.servingSize) {
                      setErrors({ ...errors, servingSize: '' });
                    }
                  }}
                  autoCapitalize="none"
                  className="text-base text-gray-900"
                />
              </Input>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <HStack className="gap-2 pt-1">
                  {unitOptions.map(u => (
                    <QuickPill key={u} label={u} selected={servingSize.trim() === u} onPress={() => setServingSize(u)} />
                  ))}
                </HStack>
              </ScrollView>
              {errors.servingSize ? (
                <Text className="text-xs text-red-600 mt-1">
                  {errors.servingSize}
                </Text>
              ) : null}
            </VStack>

            {/* Meal */}
            <VStack space="xs">
              <Text className="text-sm font-semibold text-gray-700 mb-1">
                Meal
              </Text>
              <HStack className="gap-2 flex-wrap">
                {meta.meals.map(m => (
                  <QuickPill key={m} label={capitalize(m)} selected={meal === m} onPress={() => setMeal(meal === m ? null : m)} />
                ))}
              </HStack>
            </VStack>

            {/* Helper text */}
            <View className="bg-green-50 p-4 rounded-xl border border-green-200">
              <Text className="text-xs text-green-800">
                {counted
                  ? `Counts as ${item?.foodName}: ${counted}`
                  : 'Tip: Make sure all fields are filled correctly. Quantity should be a positive number.'}
              </Text>
            </View>
            {saveError ? (
              <View className="bg-red-50 p-4 rounded-xl border border-red-200">
                <Text className="text-xs text-red-700">{saveError}</Text>
              </View>
            ) : null}
          </VStack>
        </DrawerBody>

        <DrawerFooter
          className="border-t border-gray-200 pt-4"
          style={{ paddingBottom: keyboardHeight ? 0 : Math.max(insets.bottom, 16) }}
        >
          <HStack space="md" className="w-full">
            <Button
              variant="outline"
              size="lg"
              onPress={onClose}
              className="flex-1 rounded-xl border-2 border-gray-300"
            >
              <ButtonText className="text-gray-700 font-semibold">
                Cancel
              </ButtonText>
            </Button>
            <Button
              variant="solid"
              size="lg"
              onPress={handleSave}
              isDisabled={isSaving}
              className="flex-1 rounded-xl bg-green-600"
            >
              <ButtonText className="text-white font-semibold">
                {isSaving ? 'Saving...' : 'Save Changes'}
              </ButtonText>
            </Button>
          </HStack>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};
