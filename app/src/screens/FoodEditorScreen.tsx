import React, { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { api, ApiError, errorMessage } from '@/api/client';
import type { Food } from '@/api/types';
import { Banner, Button, Card, ChipGroup, Field, Loading, Row, Screen, ScrollBody, SectionTitle } from '@/components/ui';
import type { RootStackParamList } from '@/navigation/types';
import { useMeta } from '@/state/MetaContext';

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

  if (loading) return <Loading />;
  const nutrientsShown = showMore ? meta.nutrients : meta.nutrients.slice(0, MAIN_COUNT);

  return (
    <Screen edges={['bottom']}>
      <ScrollBody>
        {error ? <Banner tone="error">{error}</Banner> : null}
        {!editing ? (
          <Text className="mb-3 mt-2 text-sm text-ink-soft">
            Values you enter are shared with everyone and fix all past and future logs of this food. Use a label or a trusted source.
          </Text>
        ) : null}
        <Card>
          <Field label="Name" value={displayName} onChangeText={setDisplayName} error={fieldErrors.displayName} autoCapitalize="words" />
          <Text className="mb-1.5 text-sm font-medium text-ink-soft">Values are per</Text>
          <ChipGroup options={meta.baseUnits} value={baseUnit} onChange={(v) => setBaseUnit(v)} labels={Object.fromEntries(meta.baseUnits.map((u) => [u, u.startsWith('100') ? u : `1 ${u}`]))} />
          {fieldErrors.baseUnit ? <Text className="text-sm text-danger">{fieldErrors.baseUnit}</Text> : null}
        </Card>

        <SectionTitle>Nutrients per {baseUnit ? (baseUnit.startsWith('100') ? baseUnit : `1 ${baseUnit}`) : '…'}</SectionTitle>
        <Card>
          {nutrientsShown.map((n) => (
            <Field
              key={n.key}
              label={`${n.label} (${n.unit})${n.key === 'calories' ? ' *' : ''}`}
              value={values[n.key] ?? ''}
              onChangeText={(v) => setValues({ ...values, [n.key]: v })}
              keyboardType="decimal-pad"
              placeholder={n.key === 'calories' ? 'required' : 'unknown'}
              error={fieldErrors[n.key]}
            />
          ))}
          <Pressable onPress={() => setShowMore(!showMore)}>
            <Text className="text-sm font-medium text-brand">{showMore ? 'Fewer nutrients' : `More nutrients (${meta.nutrients.length - MAIN_COUNT})`}</Text>
          </Pressable>
        </Card>

        {editing && food ? (
          <>
            <SectionTitle>Also called</SectionTitle>
            <Card>
              {food.aliases.length === 0 ? <Text className="mb-2 text-sm text-ink-muted">No other names yet.</Text> : null}
              {food.aliases.map((a) => (
                <Row key={a} title={a} right={<Text className="text-sm text-danger" onPress={() => removeAlias(a)}>Remove</Text>} />
              ))}
              <View className="mt-2 flex-row items-start">
                <Field className="mr-2 flex-1" value={alias} onChangeText={setAlias} placeholder="e.g. chawal" />
                <Button small title="Add" onPress={addAlias} disabled={!alias.trim()} className="mt-1" />
              </View>
            </Card>

            <SectionTitle>Unit conversions</SectionTitle>
            <Card>
              {food.units.length === 0 ? <Text className="text-sm text-ink-muted">None yet. Uncached shows the ones people need.</Text> : null}
              {food.units.map((u, i) => (
                <Row
                  key={u.unit}
                  title={`1 ${u.unit} = ${Math.round(u.servings * 1000) / 1000} × ${food.baseUnit}`}
                  last={i === food.units.length - 1}
                  onPress={() => navigation.navigate('UnitConversion', { foodId: food.id, foodName: food.displayName, baseUnit: food.baseUnit, unit: u.unit })}
                  right={<Text className="text-sm text-danger" onPress={() => removeUnit(u.unit)}>Remove</Text>}
                />
              ))}
            </Card>
          </>
        ) : null}

        <Button title={editing ? 'Save food' : 'Add food'} onPress={save} loading={saving} className="mt-2" testID="save-food" />
      </ScrollBody>
    </Screen>
  );
}
