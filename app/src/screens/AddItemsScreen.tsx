import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Check, Plus } from 'lucide-react-native';
import { api, errorMessage } from '@/api/client';
import type { Meal } from '@/api/types';
import { Button, Card, Chip, Divider, FormGroup, LoadingState, Notice, SectionHeader, Text } from '@/components/kit';
import { FoodPickerSheet } from '@/components/log/FoodPickerSheet';
import { LogRow, type LogRowData } from '@/components/log/LogRow';
import { MealTiles } from '@/components/log/MealTiles';
import { SearchTrigger } from '@/components/log/SearchTrigger';
import { UnitSheet } from '@/components/log/UnitSheet';
import { StackScreen } from '@/components/layout/StackScreen';
import { deviceTimeZone } from '@/components/TimezoneField';
import { useFoodChoices } from '@/hooks/useFoodChoices';
import { fill } from '@/i18n/fill';
import { strings, where } from '@/i18n/strings';
import type { RootStackParamList } from '@/navigation/types';
import { useMeta } from '@/state/MetaContext';
import { space } from '@/theme';
import { quantityText, validQuantity } from '@/utils/amounts';
import { dayHeading, localDateIn } from '@/utils/dates';
import { amountFor, searchKey, suggestionsFor, type FoodChoice } from '@/utils/foodChoices';
import { readNumber } from '@/utils/foodData';
import { capitalize } from '@/utils/format';
import { mealAt } from '@/utils/meals';

/** How many of a meal's foods sit on the screen as one-tap chips; the rest are in the dropdown. */
const QUICK_COUNT = 8;
/** The longest a chip's name is before it is cut short: a chip is one line high. */
const CHIP_NAME_MAX = 26;

const short = (name: string) => (name.length > CHIP_NAME_MAX ? `${name.slice(0, CHIP_NAME_MAX - 1).trimEnd()}…` : name);

/**
 * Log food by hand. Pick the meal; pick foods (the dropdown opens on your own usual foods for that meal, best first, and searches
 * everything; a food that is not there can be added); set the amounts with - and +; add them all at once. The most-logged foods of the
 * meal are also chips on the screen, so the usual meal is a few taps. Each food keeps the meal it was added under, so a whole day can
 * be entered in one go: add breakfast, change the meal, add lunch.
 */
export default function AddItemsScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<RootStackParamList, 'AddItems'>>();
  const meta = useMeta();
  const { catalog, ready, failed, retry } = useFoodChoices();

  // Opened for a meal, for "Other" (null: the group of items with no meal), or for no meal in particular (the time of day decides).
  const [meal, setMeal] = useState<Meal | null>(() =>
    params.meal === undefined ? mealAt(new Date().getHours(), new Date().getMinutes()) : params.meal,
  );
  const [rows, setRows] = useState<LogRowData[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [unitFor, setUnitFor] = useState<string | null>(null);
  const lastId = useRef(0);

  const suggestions = useMemo(() => suggestionsFor(catalog, meal), [catalog, meal]);
  const quick = suggestions.top.slice(0, QUICK_COUNT);
  // What is already in the list for the meal being shown: the same food may be added for another meal too.
  const added = useMemo(() => new Set(rows.filter(r => r.meal === meal).map(r => r.choiceKey)), [rows, meal]);

  const addRow = (row: Omit<LogRowData, 'id' | 'meal'>) => {
    const id = `r${++lastId.current}`;
    setRows(prev => (prev.some(r => r.choiceKey === row.choiceKey && r.meal === meal) ? prev : [...prev, { ...row, id, meal }]));
  };
  const rowOf = (choice: FoodChoice): Omit<LogRowData, 'id' | 'meal'> => {
    const amount = amountFor(choice, meal);
    return { choiceKey: choice.key, name: choice.name, foodId: choice.foodId, quantity: quantityText(amount.quantity), unit: amount.unit, units: choice.units };
  };
  const toggle = (choice: FoodChoice) =>
    added.has(choice.key) ? setRows(prev => prev.filter(r => !(r.choiceKey === choice.key && r.meal === meal))) : addRow(rowOf(choice));
  const logByName = (name: string) =>
    addRow({ choiceKey: `name:${searchKey(name)}`, name: name.trim(), foodId: null, quantity: '1', unit: 'serving', units: [] });

  // A food just made in the food form comes back as a param: it goes into the list, and the param is cleared so it is not added twice.
  const addedFood = params.addedFood;
  useEffect(() => {
    if (!addedFood) return;
    addRow({
      choiceKey: `food:${addedFood.foodId}`,
      name: addedFood.name,
      foodId: addedFood.foodId,
      quantity: quantityText(addedFood.quantity),
      unit: addedFood.unit,
      units: addedFood.units,
    });
    setNotice(fill(strings.log.addedFood, { name: addedFood.name }));
    navigation.setParams({ addedFood: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addedFood]);

  const change = (id: string, patch: Partial<LogRowData>) => setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  const setQuantity = (id: string, quantity: string) => {
    change(id, { quantity });
    if (errors[id]) setErrors(({ [id]: _cleared, ...rest }) => rest);
  };

  // The list, a group to a meal in the order of the day, with the meal as a heading once it holds more than one. It is saved as shown.
  const groups = [...meta.meals, null]
    .map(m => ({ meal: m, rows: rows.filter(r => r.meal === m) }))
    .filter(g => g.rows.length > 0);

  const save = async () => {
    const wrong: Record<string, string> = {};
    for (const r of rows) if (!validQuantity(r.quantity)) wrong[r.id] = strings.log.quantityError;
    setErrors(wrong);
    if (Object.keys(wrong).length > 0) {
      setError(strings.log.checkAmounts);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.addItems(
        params.date,
        groups.flatMap(g => g.rows).map(r => ({ name: r.name.trim(), quantity: readNumber(r.quantity)!, unit: r.unit.trim(), meal: r.meal })),
        params.callId,
      );
      navigation.goBack();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const heading = dayHeading(params.date, localDateIn(deviceTimeZone()));
  const when = heading.title === 'Today' || heading.title === 'Yesterday' ? heading.title : `${heading.title}, ${heading.subtitle}`;
  const unitRow = rows.find(r => r.id === unitFor) ?? null;
  const count = rows.length;

  const oneMeal = groups.length === 1 ? groups[0]!.meal : undefined;
  const label =
    count === 0
      ? strings.log.addNone
      : oneMeal
        ? fill(count === 1 ? strings.log.addOneTo : strings.log.addManyTo, { n: count, meal: oneMeal })
        : fill(count === 1 ? strings.log.addOne : strings.log.addMany, { n: count });
  const listTitle = meal
    ? fill(suggestions.personal ? strings.log.usual : strings.log.common, { meal })
    : suggestions.personal
      ? strings.log.usualAny
      : strings.log.commonAny;

  return (
    <>
      <StackScreen
        title={strings.log.title}
        subtitle={when}
        gap={space.xl}
        footer={
          <>
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <Button testID="save-items" label={label} size="lg" fullWidth loading={saving} disabled={count === 0} onPress={save} />
          </>
        }
      >
        <FormGroup title={strings.log.meal} hint={meal === null ? strings.log.noMealHint : undefined}>
          <MealTiles meals={meta.meals} value={meal} onChange={setMeal} />
        </FormGroup>

        <View style={{ gap: space.lg }}>
          <SearchTrigger
            testID="open-picker"
            label={strings.log.searchPrompt}
            accessibilityLabel={strings.log.searchLabel}
            onPress={() => setPicker(true)}
          />
          {failed ? (
            <Notice tone="warning" testID="load-failed" action={{ label: strings.log.retry, onPress: retry }}>
              {strings.log.loadFailed}
            </Notice>
          ) : null}
          {ready ? (
            <FormGroup title={listTitle}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {quick.map(choice => (
                  <Chip
                    key={choice.key}
                    testID={`quick-${choice.key}`}
                    label={short(choice.name)}
                    icon={added.has(choice.key) ? Check : Plus}
                    selected={added.has(choice.key)}
                    onPress={() => toggle(choice)}
                  />
                ))}
              </View>
            </FormGroup>
          ) : (
            <LoadingState />
          )}
        </View>

        {notice ? (
          <Notice tone="success" onDismiss={() => setNotice(null)}>
            {notice}
          </Notice>
        ) : null}

        <View style={{ gap: space.md }}>
          <SectionHeader
            title={strings.log.toAdd}
            right={
              count > 0 ? (
                <Text variant="small" tone="muted">
                  {fill(strings.log.toAddCount, { n: count })}
                </Text>
              ) : null
            }
          />
          {count === 0 ? (
            <Card>
              <Text variant="small" tone="muted" align="center">
                {strings.log.empty}
              </Text>
            </Card>
          ) : (
            <Card padding="none">
              {groups.map((g, gi) => (
                <React.Fragment key={g.meal ?? 'other'}>
                  {gi > 0 ? <Divider /> : null}
                  {groups.length > 1 ? (
                    <View style={{ paddingHorizontal: space.lg, paddingTop: space.md }} testID={`group-${g.meal ?? 'other'}`}>
                      <Text variant="overline" tone="muted">
                        {g.meal ? capitalize(g.meal) : strings.log.groupOther}
                      </Text>
                    </View>
                  ) : null}
                  {g.rows.map((row, i) => (
                    <React.Fragment key={row.id}>
                      {i > 0 ? <Divider /> : null}
                      <LogRow
                        row={row}
                        error={errors[row.id]}
                        counted={row.foodId !== null || !ready}
                        unitSetUp={row.foodId === null || row.units.length === 0 || row.units.includes(row.unit)}
                        onQuantity={text => setQuantity(row.id, text)}
                        onPickUnit={() => setUnitFor(row.id)}
                        onRemove={() => setRows(prev => prev.filter(r => r.id !== row.id))}
                      />
                    </React.Fragment>
                  ))}
                </React.Fragment>
              ))}
            </Card>
          )}
        </View>

        <Text variant="caption" tone="muted">
          {where.addItemsNote}
        </Text>
      </StackScreen>

      <FoodPickerSheet
        visible={picker}
        onClose={() => setPicker(false)}
        meal={meal}
        catalog={catalog}
        ready={ready}
        added={added}
        onPick={choice => addRow(rowOf(choice))}
        onAddNew={name => navigation.navigate('FoodEditor', { name, forLog: { date: params.date } })}
        onUseName={logByName}
      />
      <UnitSheet
        visible={unitRow !== null}
        onClose={() => setUnitFor(null)}
        name={unitRow?.name ?? ''}
        current={unitRow?.unit ?? ''}
        forFood={unitRow?.units ?? []}
        all={meta.units}
        onPick={unit => unitRow && change(unitRow.id, { unit })}
      />
    </>
  );
}
