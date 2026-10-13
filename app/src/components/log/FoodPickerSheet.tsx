import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Apple, Check } from 'lucide-react-native';
import type { Meal } from '@/api/types';
import { Button, EmptyState, FormGroup, Icon, ListGroup, LoadingState, SearchField, Sheet, Text } from '@/components/kit';
import { usePressed } from '@/components/kit/usePressed';
import { fill } from '@/i18n/fill';
import { strings } from '@/i18n/strings';
import { createStyles, space, useTheme } from '@/theme';
import { amountFor, hasExactMatch, searchChoices, suggestionsFor, type Catalog, type FoodChoice } from '@/utils/foodChoices';
import { formatQuantity } from '@/utils/format';

const useStyles = createStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 60, paddingHorizontal: space.lg, paddingVertical: space.md },
  body: { flex: 1, minWidth: 0, gap: 2 },
}));

/** "Usually 3 piece" for a food the person has logged (at this meal, or at another), else the amount it starts from. */
function hintFor(choice: FoodChoice, meal: Meal | null): string {
  const { quantity, unit } = amountFor(choice, meal);
  const amount = formatQuantity(quantity, unit);
  return choice.history ? fill(strings.log.picker.usually, { amount }) : amount;
}

function PickRow({ choice, meal, added, onPress }: { choice: FoodChoice; meal: Meal | null; added: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { pressed, handlers } = usePressed();
  return (
    <Pressable
      testID={`pick-${choice.key}`}
      accessibilityRole="button"
      accessibilityLabel={added ? `${choice.name}, added` : choice.name}
      accessibilityState={{ disabled: added }}
      onPress={added ? undefined : onPress}
      {...handlers}
      style={[styles.row, pressed && !added ? { backgroundColor: colors.surfaceMuted } : null]}
    >
      <View style={styles.body}>
        <Text variant="bodyStrong" tone={added ? 'muted' : 'text'} numberOfLines={1}>
          {choice.name}
        </Text>
        <Text variant="small" tone="muted" numberOfLines={1}>
          {hintFor(choice, meal)}
        </Text>
      </View>
      {added ? <Icon as={Check} size="md" tone="primary" /> : null}
    </Pressable>
  );
}

/**
 * The foods dropdown, open: a search box pinned on top and a list under it. With nothing typed the list is the person's own foods for
 * this meal, best first (or, if they have logged nothing for it, what many people have at it), then what else they log, then the foods
 * list. Typing searches all of them. A food that is not found can be added as a new food item, or logged by name without values.
 */
export function FoodPickerSheet({
  visible,
  onClose,
  meal,
  catalog,
  ready,
  added,
  onPick,
  onAddNew,
  onUseName,
}: {
  visible: boolean;
  onClose: () => void;
  meal: Meal | null;
  catalog: Catalog;
  /** False until the person's log and the foods list have loaded: the common foods are not shown in place of a list that is on its way. */
  ready: boolean;
  /** The keys of the foods already in the list to add for this meal. */
  added: ReadonlySet<string>;
  onPick: (choice: FoodChoice) => void;
  /** The person wants a food of this name that is not there: add it as a new food item. */
  onAddNew: (name: string) => void;
  /** Log this name as it is, without values. */
  onUseName: (name: string) => void;
}) {
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  const q = query.trim();
  const suggestions = useMemo(() => suggestionsFor(catalog, meal), [catalog, meal]);
  const results = useMemo(() => (q ? searchChoices(catalog, q, meal) : []), [catalog, q, meal]);
  const exact = useMemo(() => hasExactMatch(catalog, q), [catalog, q]);
  const t = strings.log;

  const rows = (choices: FoodChoice[]) => (
    <ListGroup>
      {choices.map(c => (
        <PickRow
          key={c.key}
          choice={c}
          meal={meal}
          added={added.has(c.key)}
          onPress={() => {
            onPick(c);
            onClose();
          }}
        />
      ))}
    </ListGroup>
  );
  const addNew = () => {
    onClose();
    onAddNew(q);
  };
  const useName = () => {
    onClose();
    onUseName(q);
  };
  const mealName = meal ?? '';
  const listTitle = meal ? fill(suggestions.personal ? t.usual : t.common, { meal: mealName }) : suggestions.personal ? t.usualAny : t.commonAny;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      tall
      testID="food-picker"
      title={t.picker.title}
      subtitle={meal ? fill(t.picker.subtitleMeal, { meal: mealName }) : t.picker.subtitleNone}
      header={<SearchField testID="picker-search" value={query} onChangeText={setQuery} placeholder={t.picker.search} />}
    >
      {q === '' ? (
        !ready ? (
          <LoadingState />
        ) : (
          <>
            <FormGroup title={listTitle}>{rows(suggestions.top)}</FormGroup>
            {suggestions.also.length > 0 ? <FormGroup title={t.picker.also}>{rows(suggestions.also)}</FormGroup> : null}
            {suggestions.all.length > 0 ? (
              <FormGroup title={t.picker.all} hint={suggestions.moreCount > 0 ? t.picker.moreHint : undefined}>
                {rows(suggestions.all)}
              </FormGroup>
            ) : null}
          </>
        )
      ) : (
        <>
          {results.length > 0 ? (
            rows(results)
          ) : (
            <EmptyState icon={Apple} title={fill(t.picker.none, { query: q })} body={t.picker.noneBody} />
          )}
          {!exact ? (
            <View style={{ gap: space.sm }}>
              <Button
                testID="add-new-food"
                label={results.length > 0 ? fill(t.picker.addNamed, { query: q }) : t.picker.add}
                variant={results.length > 0 ? 'soft' : 'primary'}
                fullWidth
                onPress={addNew}
              />
              <Text variant="caption" tone="muted" align="center">
                {t.picker.addHint}
              </Text>
              <Button testID="use-name" label={fill(t.picker.withoutValues, { query: q })} variant="ghost" fullWidth onPress={useName} />
              <Text variant="caption" tone="muted" align="center">
                {t.picker.withoutValuesHint}
              </Text>
            </View>
          ) : null}
        </>
      )}
    </Sheet>
  );
}
