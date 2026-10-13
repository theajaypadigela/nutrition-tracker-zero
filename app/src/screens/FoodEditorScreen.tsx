import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { ChevronDown, ChevronUp, Plus } from 'lucide-react-native';
import { api, ApiError, errorMessage } from '@/api/client';
import type { Food } from '@/api/types';
import { Button, Chip, Field, FormGroup, InlineField, ListGroup, ListRow, LoadingState, Notice, Text } from '@/components/kit';
import { StackScreen } from '@/components/layout/StackScreen';
import type { RootStackParamList } from '@/navigation/types';
import { useMeta } from '@/state/MetaContext';
import { space } from '@/theme';
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
      setShowMore(meta.nutrients.slice(MAIN_COUNT).some(n => f.nutrients[n.key] != null));
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
    // The failing field can be off-screen in a form this long, so say it in the footer too.
    if (Object.keys(errs).length) {
      setError('Check the highlighted fields.');
      return;
    }

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
          Alert.alert(
            'Food added',
            `${res.resolvedCount} item${res.resolvedCount === 1 ? '' : 's'} now count${res.resolvedCount === 1 ? 's' : ''}, for everyone who logged it.`,
          );
        }
        navigation.goBack();
      } catch (e) {
        if (e instanceof ApiError && e.code === 'name_taken') {
          setError(`${e.message}. Use "Same as existing…" in Pending to link it instead.`);
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
  const moreCount = meta.nutrients.length - MAIN_COUNT;

  return (
    <StackScreen
      title={editing ? 'Edit food' : 'Enter food values'}
      subtitle="Shared with everyone"
      footer={
        <>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Button
            testID="save-food"
            label={editing ? 'Save food' : 'Add food'}
            size="lg"
            fullWidth
            loading={saving}
            disabled={loading}
            onPress={save}
          />
        </>
      }
      gap={space.xl}
    >
      {loading ? (
        <LoadingState />
      ) : (
        <>
          {!editing ? (
            <Notice tone="info">
              Values you enter are shared with everyone and fix all past and future logs of this food. Use a label or a
              trusted source.
            </Notice>
          ) : null}

          <Field
            label="Name"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="e.g. Idli"
            autoCapitalize="words"
            error={fieldErrors.displayName}
          />

          <FormGroup
            title="Values are per"
            hint={baseUnit ? `The nutrients below are for ${base}.` : 'Pick the serving the values describe.'}
          >
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {meta.baseUnits.map(u => (
                <Chip key={u} label={perBase(u)} selected={baseUnit === u} onPress={() => setBaseUnit(u)} />
              ))}
            </View>
            {fieldErrors.baseUnit ? (
              <Text variant="small" tone="danger">
                {fieldErrors.baseUnit}
              </Text>
            ) : null}
          </FormGroup>

          <FormGroup title={`Nutrients per ${base}`}>
            <ListGroup>
              {nutrientsShown.map(n => (
                <InlineField
                  key={n.key}
                  label={n.key === 'calories' ? `${n.label} *` : n.label}
                  unit={n.unit}
                  value={values[n.key] ?? ''}
                  onChangeText={v => setValues({ ...values, [n.key]: v })}
                  placeholder={n.key === 'calories' ? 'Required' : 'Unknown'}
                  error={fieldErrors[n.key]}
                />
              ))}
            </ListGroup>
            {moreCount > 0 ? (
              <Button
                label={showMore ? 'Fewer nutrients' : `More nutrients (${moreCount})`}
                icon={showMore ? ChevronUp : ChevronDown}
                variant="ghost"
                size="sm"
                style={{ alignSelf: 'center' }}
                onPress={() => setShowMore(!showMore)}
              />
            ) : null}
          </FormGroup>

          {editing && food ? (
            <>
              <FormGroup title="Also called">
                {food.aliases.length > 0 ? (
                  <ListGroup>
                    {food.aliases.map(a => (
                      <ListRow
                        key={a}
                        title={a}
                        right={<Button label="Remove" variant="dangerGhost" size="sm" onPress={() => removeAlias(a)} />}
                      />
                    ))}
                  </ListGroup>
                ) : (
                  <Text variant="small" tone="muted" style={{ paddingHorizontal: space.xs }}>
                    No other names yet.
                  </Text>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
                  <View style={{ flex: 1 }}>
                    <Field value={alias} onChangeText={setAlias} placeholder="e.g. chawal" autoCapitalize="none" />
                  </View>
                  <Button label="Add" icon={Plus} variant="soft" disabled={!alias.trim()} onPress={addAlias} />
                </View>
              </FormGroup>

              <FormGroup title="Unit conversions" hint={food.units.length === 0 ? 'None yet. Pending shows the ones people need.' : undefined}>
                {food.units.length > 0 ? (
                  <ListGroup>
                    {food.units.map(u => (
                      <ListRow
                        key={u.unit}
                        title={`1 ${u.unit} = ${Math.round(u.servings * 1000) / 1000} × ${food.baseUnit}`}
                        chevron={false}
                        onPress={() =>
                          navigation.navigate('UnitConversion', {
                            foodId: food.id,
                            foodName: food.displayName,
                            baseUnit: food.baseUnit,
                            unit: u.unit,
                          })
                        }
                        right={<Button label="Remove" variant="dangerGhost" size="sm" onPress={() => removeUnit(u.unit)} />}
                      />
                    ))}
                  </ListGroup>
                ) : null}
              </FormGroup>
            </>
          ) : null}
        </>
      )}
    </StackScreen>
  );
}
