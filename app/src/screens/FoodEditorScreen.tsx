import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Flame, Repeat, Scale, Tags, Type } from 'lucide-react-native';
import { api, ApiError, errorMessage } from '@/api/client';
import type { Food } from '@/api/types';
import AppBar from '@/components/common/AppBar';
import { LoadingState, Notice } from '@/components/common/Feedback';
import { ActionButton, BottomActionBar, BOTTOM_BAR_CLEARANCE, BOTTOM_BAR_SPACE, FormInput, QuickPill, SectionCard } from '@/components/common/Form';
import { Text } from '@/components/ui/text';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboard';
import type { RootStackParamList } from '@/navigation/types';
import { useMeta } from '@/state/MetaContext';
import { tokens } from '@/theme/tokens';
import { perBase } from './FoodsScreen';

const MAIN_COUNT = 7;

function guessBase(unitHint: string | undefined, baseUnits: string[]): string | null {
  if (!unitHint) return null;
  if (unitHint === 'g' || unitHint === 'kg') return '100 g';
  if (unitHint === 'ml' || unitHint === 'l') return '100 ml';
  return baseUnits.includes(unitHint) ? unitHint : null;
}

function toText(v: number | null | undefined): string {
  return v === null || v === undefined ? '' : String(v);
}

export default function FoodEditorScreen() {
  const navigation = useNavigation();
  const { keyboardHeight, scrollProps } = useKeyboardAwareScroll(BOTTOM_BAR_CLEARANCE);
  const meta = useMeta();
  const { params } = useRoute<RouteProp<RootStackParamList, 'FoodEditor'>>();
  const editing = !!params.foodId;

  const [food, setFood] = useState<Food | null>(null);
  const [loading, setLoading] = useState(editing);
  const [displayName, setDisplayName] = useState(params.name ?? '');
  const [baseUnit, setBaseUnit] = useState<string | null>(guessBase(params.unitHint, meta.baseUnits));
  const [values, setValues] = useState<Record<string, string>>({});
  const [showMore, setShowMore] = useState(false);
  const [alias, setAlias] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const load = async () => {
    if (!params.foodId) return;
    try {
      const f = await api.getFood(params.foodId);
      setFood(f);
      setDisplayName(f.displayName);
      setBaseUnit(f.baseUnit);
      setValues(Object.fromEntries(Object.entries(f.nutrients).map(([k, v]) => [k, toText(v)])));
      setShowMore(meta.nutrients.slice(MAIN_COUNT).some((n) => f.nutrients[n.key] != null));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.foodId]);

  const save = async () => {
    const errs: Record<string, string> = {};
    const nutrients: Record<string, number | null> = {};
    for (const n of meta.nutrients) {
      const raw = (values[n.key] ?? '').trim();
      if (!raw) {
        if (n.key === 'calories') errs.calories = 'Calories are required';
        else nutrients[n.key] = null;
        continue;
      }
      const v = Number(raw);
      if (!Number.isFinite(v) || v < 0) errs[n.key] = 'Enter a number';
      else nutrients[n.key] = v;
    }
    if (!displayName.trim()) errs.displayName = 'Enter a name';
    if (!baseUnit) errs.baseUnit = 'Pick what the values are per';
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    const doSave = async () => {
      setSaving(true);
      setError(null);
      try {
        if (editing && food) {
          const res = await api.updateFood(food.id, {
            displayName: displayName.trim(),
            ...(baseUnit !== food.baseUnit ? { baseUnit: baseUnit! } : {}),
            nutrients,
          });
          const parts = [];
          if (res.resolvedCount) parts.push(`${res.resolvedCount} items resolved`);
          if (res.repended) parts.push(`${res.repended} items now need a unit conversion`);
          if (parts.length) Alert.alert('Saved', parts.join('. ') + '.');
        } else {
          const res = await api.createFood({ displayName: displayName.trim(), baseUnit: baseUnit!, nutrients });
          Alert.alert('Food added', `${res.resolvedCount} item${res.resolvedCount === 1 ? '' : 's'} now count${res.resolvedCount === 1 ? 's' : ''}, for everyone who logged it.`);
        }
        navigation.goBack();
      } catch (e) {
        if (e instanceof ApiError && e.code === 'name_taken') {
          setError(`${e.message}. Use "Same as existing…" in Uncached to link it instead.`);
        } else setError(errorMessage(e));
      } finally {
        setSaving(false);
      }
    };

    if (editing && food && baseUnit !== food.baseUnit) {
      Alert.alert(
        'Change base unit?',
        `Values must now be per ${baseUnit}. Existing unit conversions are cleared, so some items may need converting again.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Change', onPress: doSave },
        ],
      );
    } else await doSave();
  };

  const addAlias = async () => {
    if (!food || !alias.trim()) return;
    try {
      const res = await api.addAlias(food.id, alias.trim());
      setFood(res.food);
      setAlias('');
    } catch (e) {
      Alert.alert('Could not add alias', errorMessage(e));
    }
  };

  const removeAlias = (a: string) =>
    Alert.alert(`Remove "${a}"?`, 'Items logged under this name will become unknown again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            setFood((await api.removeAlias(food!.id, a)).food);
          } catch (e) {
            Alert.alert('Could not remove', errorMessage(e));
          }
        },
      },
    ]);

  const removeUnit = (u: string) =>
    Alert.alert(`Remove the ${u} conversion?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            setFood((await api.removeUnit(food!.id, u)).food);
          } catch (e) {
            Alert.alert('Could not remove', errorMessage(e));
          }
        },
      },
    ]);

  const base = baseUnit ? perBase(baseUnit) : '…';
  const nutrientsShown = showMore ? meta.nutrients : meta.nutrients.slice(0, MAIN_COUNT);

  return (
    <View className="flex-1">
      <AppBar
        title={editing ? 'Edit food' : 'Enter food values'}
        subtitle="Shared with everyone"
        variant="secondary"
        showBackButton
      />
      {loading ? (
        <LoadingState color={tokens.dashboard.green} />
      ) : (
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          {...scrollProps}
          contentContainerStyle={{ paddingBottom: BOTTOM_BAR_SPACE + keyboardHeight }}
        >
          <VStack className="p-6 gap-5">
            {!editing ? (
              <Notice tone="info">
                Values you enter are shared with everyone and fix all past and future logs of this food. Use a label or a
                trusted source.
              </Notice>
            ) : null}

            <SectionCard icon={Type} iconColor={tokens.icon.green} iconBg="bg-emerald-50" title="Food Name">
              <FormInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="e.g. Idli"
                autoCapitalize="words"
                error={fieldErrors.displayName}
              />
            </SectionCard>

            <SectionCard
              icon={Scale}
              iconColor={tokens.icon.blue}
              iconBg="bg-blue-50"
              title="Values are per"
              subtitle={baseUnit ? `Nutrients below are for ${base}` : 'Pick the serving the values describe'}
            >
              <View className="flex-row flex-wrap gap-2">
                {meta.baseUnits.map(u => (
                  <QuickPill key={u} label={perBase(u)} selected={baseUnit === u} onPress={() => setBaseUnit(u)} />
                ))}
              </View>
              {fieldErrors.baseUnit ? <Text className="text-xs text-red-500">{fieldErrors.baseUnit}</Text> : null}
            </SectionCard>

            <SectionCard icon={Flame} iconColor={tokens.icon.amber} iconBg="bg-amber-50" title={`Nutrients per ${base}`}>
              <View className="flex-row flex-wrap justify-between gap-y-3">
                {nutrientsShown.map(n => (
                  <FormInput
                    key={n.key}
                    className="w-[48%]"
                    label={`${n.label} (${n.unit})${n.key === 'calories' ? ' *' : ''}`}
                    value={values[n.key] ?? ''}
                    onChangeText={v => setValues({ ...values, [n.key]: v })}
                    keyboardType="decimal-pad"
                    placeholder={n.key === 'calories' ? 'required' : 'unknown'}
                    error={fieldErrors[n.key]}
                  />
                ))}
              </View>
              <TouchableOpacity onPress={() => setShowMore(!showMore)}>
                <Text className="text-sm font-semibold text-emerald-600">
                  {showMore ? 'Fewer nutrients' : `More nutrients (${meta.nutrients.length - MAIN_COUNT})`}
                </Text>
              </TouchableOpacity>
            </SectionCard>

            {editing && food ? (
              <>
                <SectionCard icon={Tags} iconColor={tokens.icon.violet} iconBg="bg-purple-50" title="Also called">
                  {food.aliases.length === 0 ? <Text className="text-sm text-gray-500">No other names yet.</Text> : null}
                  {food.aliases.map(a => (
                    <HStack key={a} className="items-center justify-between py-1">
                      <Text className="text-[15px] text-gray-900">{a}</Text>
                      <RemovePill onPress={() => removeAlias(a)} />
                    </HStack>
                  ))}
                  <HStack className="items-start gap-2">
                    <FormInput className="flex-1" value={alias} onChangeText={setAlias} placeholder="e.g. chawal" autoCapitalize="none" />
                    <TouchableOpacity
                      onPress={addAlias}
                      disabled={!alias.trim()}
                      className={`rounded-xl px-4 py-3.5 ${alias.trim() ? 'bg-emerald-500' : 'bg-gray-300'}`}
                    >
                      <Text className={`font-semibold ${alias.trim() ? 'text-white' : 'text-gray-500'}`}>Add</Text>
                    </TouchableOpacity>
                  </HStack>
                </SectionCard>

                <SectionCard icon={Repeat} iconColor={tokens.icon.green} iconBg="bg-emerald-50" title="Unit conversions">
                  {food.units.length === 0 ? (
                    <Text className="text-sm text-gray-500">None yet. Uncached shows the ones people need.</Text>
                  ) : null}
                  {food.units.map(u => (
                    <TouchableOpacity
                      key={u.unit}
                      onPress={() =>
                        navigation.navigate('UnitConversion', {
                          foodId: food.id,
                          foodName: food.displayName,
                          baseUnit: food.baseUnit,
                          unit: u.unit,
                        })
                      }
                      className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-200 flex-row items-center justify-between"
                    >
                      <Text className="text-[15px] text-gray-900 flex-1">
                        1 {u.unit} = {Math.round(u.servings * 1000) / 1000} × {food.baseUnit}
                      </Text>
                      <RemovePill onPress={() => removeUnit(u.unit)} />
                    </TouchableOpacity>
                  ))}
                </SectionCard>
              </>
            ) : null}
          </VStack>
        </ScrollView>
      )}

      <BottomActionBar error={error}>
        <ActionButton title={editing ? 'Save food' : 'Add food'} onPress={save} loading={saving} disabled={loading} testID="save-food" />
      </BottomActionBar>
    </View>
  );
}

function RemovePill({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} className="rounded-full bg-red-50 px-3 py-1.5 ml-2">
      <Text className="text-xs font-semibold text-red-500">Remove</Text>
    </TouchableOpacity>
  );
}
