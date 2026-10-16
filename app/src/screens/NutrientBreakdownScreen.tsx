import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { ListChecks } from 'lucide-react-native';
import { api, errorMessage } from '@/api/client';
import type { BreakdownItem, Item } from '@/api/types';
import { Card, Divider, EmptyState, LoadingState, Notice, Segmented, Text } from '@/components/kit';
import { StackScreen } from '@/components/layout/StackScreen';
import { EditItemSheet } from '@/components/today/EditItemSheet';
import { useNutrientBreakdown } from '@/hooks/useNutrientBreakdown';
import { useToday } from '@/hooks/useToday';
import { fill } from '@/i18n/fill';
import { strings } from '@/i18n/strings';
import type { RootStackParamList } from '@/navigation/types';
import { useHealth } from '@/state/HealthContext';
import { useMeta } from '@/state/MetaContext';
import { createStyles, space, useTheme } from '@/theme';
import {
  dailyAverage,
  dashboardTotal,
  dayTitle,
  exactAmount,
  exactTotal,
  groupByDay,
  groupByFood,
  groupByMeal,
  quantityText,
  type BreakdownGroup,
  type BreakdownOrigin,
} from '@/utils/breakdown';
import { dayHeading } from '@/utils/dates';
import { capitalize, formatQuantity } from '@/utils/format';
import { nutrientInfo } from '@/utils/report';
import { rangeLabel } from '@/utils/reportRange';

const t = strings.breakdown;

const useStyles = createStyles(() => ({
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md + 2 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  rowBody: { flex: 1, minWidth: 0, gap: 3 },
  amount: { flexShrink: 0, alignItems: 'flex-end' },
  footRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.md },
}));

/** An item as the edit sheet wants it: the day's own item when we have it, else what the list knows (enough to edit and delete). */
function asItem(row: BreakdownItem, own?: Item): Item {
  if (own) return own;
  return {
    id: row.id,
    localDate: row.date,
    meal: row.meal,
    rawName: row.rawName,
    normalizedName: row.rawName.trim().toLowerCase(),
    quantity: row.quantity,
    unit: row.unit,
    foodId: row.foodId,
    foodName: row.foodName,
    baseUnit: null,
    status: row.status,
    source: 'manual',
    callId: null,
    createdAt: '',
    nutrients: {},
    weight: null,
    amountCheck: null,
  };
}

/**
 * The logged items that add up to one nutrient's total, for the day or span it was opened from: each item with its quantity and what it
 * contributed, and the total pinned at the bottom, written the way the dashboard writes it. The list and the total come from the same
 * function the dashboards use, so they always agree; an item with no value adds nothing and says so; an edited, deleted or new entry
 * shows here as soon as it is saved.
 */
export default function NutrientBreakdownScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<RootStackParamList, 'NutrientBreakdown'>>();
  const { nutrient, from, to } = params;
  const origin: BreakdownOrigin = params.origin ?? 'today';
  const meta = useMeta();
  const health = useHealth();
  const today = useToday();
  const styles = useStyles();
  const { colors } = useTheme();
  const info = nutrientInfo(meta.nutrients, nutrient);
  const state = useNutrientBreakdown(nutrient, from, to);
  const [grouping, setGrouping] = useState<'day' | 'food'>('day');
  const [editing, setEditing] = useState<Item | null>(null);
  const oneDay = from === to;
  const breakdown = state.breakdown;
  const hidden = health.numbersHidden || breakdown?.display?.numbersHidden === true;

  useFocusEffect(
    useCallback(() => {
      state.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nutrient, from, to]),
  );

  const groups: BreakdownGroup[] = useMemo(() => {
    if (!breakdown) return [];
    if (oneDay) return groupByMeal(breakdown.items);
    return grouping === 'food' ? groupByFood(breakdown.items) : groupByDay(breakdown.items, d => dayTitle(d, today));
  }, [breakdown, oneDay, grouping, today]);

  const heading = oneDay ? dayHeading(from, today) : null;
  const subtitle = heading ? `${heading.title} · ${heading.subtitle}` : rangeLabel(from, to);
  const unit = info.unit;
  // "No protein value", "No vitamin A value": only the first letter drops, so a letter that is part of the name stays a capital.
  const lower = info.label.charAt(0).toLowerCase() + info.label.slice(1);

  const totalText = breakdown && breakdown.total !== null ? dashboardTotal(origin, nutrient, unit, breakdown.total, breakdown.isLowerBound) : '—';
  const exactText = breakdown && breakdown.total !== null ? exactTotal(origin, unit, breakdown.total, breakdown.isLowerBound) : null;
  // The dashboard rounds ("56.8 g" for 56.83): say what the amounts above really add up to when the two read differently.
  const showExact = !!exactText && exactText !== totalText;
  const average = breakdown && !oneDay ? dailyAverage(breakdown) : null;

  const confirmDelete = (item: Item) =>
    Alert.alert(t.deleteTitle, item.rawName, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteItem(item.id);
            state.reload();
          } catch (e) {
            Alert.alert('Could not delete', errorMessage(e));
          }
        },
      },
    ]);

  const amountText = (amount: number | null) => (amount === null ? '—' : `${exactAmount(amount)} ${unit}`);

  const rowSubtitle = (row: BreakdownItem): string => {
    const parts = [formatQuantity(row.quantity, row.unit)];
    if (row.foodName && row.foodName.toLowerCase() !== row.rawName.toLowerCase()) parts.push(row.foodName);
    // Inside a day the meal is the group; across days the group is the day, so the meal is said on the row.
    if (!oneDay && row.meal) parts.push(capitalize(row.meal));
    return parts.join(' · ');
  };

  const renderRow = (row: BreakdownItem) => {
    const pending = row.status !== 'resolved';
    const note =
      row.status === 'pending_food' ? t.waitingFood : row.status === 'pending_unit' ? t.waitingUnit : row.amount === null ? fill(t.noValue, { nutrient: lower }) : null;
    const body = (
      <>
        <View style={styles.rowBody}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {row.rawName}
          </Text>
          <Text variant="small" tone="secondary" numberOfLines={2}>
            {rowSubtitle(row)}
          </Text>
          {note ? (
            <Text variant="caption" tone="warning">
              {note}
            </Text>
          ) : null}
        </View>
        <View style={styles.amount}>
          <Text variant="bodyStrong" tabular tone={row.amount === null ? 'faint' : 'text'}>
            {amountText(row.amount)}
          </Text>
        </View>
      </>
    );
    const label = `${row.rawName}, ${formatQuantity(row.quantity, row.unit)}, ${row.amount === null ? (pending ? 'not counted' : 'no value') : `${exactAmount(row.amount)} ${unit} of ${info.label}`}`;
    return (
      <Pressable
        key={row.id}
        testID={`breakdown-item-${row.id}`}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t.tapHint}
        android_ripple={{ color: colors.ripple }}
        onPress={() => setEditing(asItem(row, state.day?.items.find(i => i.id === row.id)))}
        style={styles.row}
      >
        {body}
      </Pressable>
    );
  };

  /** Why a food in the "by food" list adds nothing: still waiting for its values or its unit, or the food has no value for this nutrient. */
  const foodNote = (g: BreakdownGroup): string => {
    const unknown = g.items.filter(i => i.amount === null);
    if (unknown.every(i => i.status === 'pending_food')) return t.waitingFood;
    if (unknown.every(i => i.status === 'pending_unit')) return t.waitingUnit;
    if (g.missing === g.items.length) return fill(t.noValue, { nutrient: lower });
    return fill(g.missing === 1 ? t.missingTitleOne : t.missingTitle, { n: g.missing, nutrient: lower });
  };

  const renderFoodRow = (g: BreakdownGroup) => (
    <View key={g.key} testID={`breakdown-food-${g.key}`} style={styles.row} accessible accessibilityLabel={`${g.title}, ${quantityText(g.items)}, ${amountText(g.subtotal)}`}>
      <View style={styles.rowBody}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {g.title}
        </Text>
        <Text variant="small" tone="secondary" numberOfLines={2}>
          {`${quantityText(g.items)} · ${g.items.length === 1 ? t.entryOne : fill(t.entries, { n: g.items.length })}`}
        </Text>
        {g.missing > 0 ? (
          <Text variant="caption" tone="warning">
            {foodNote(g)}
          </Text>
        ) : null}
      </View>
      <View style={styles.amount}>
        <Text variant="bodyStrong" tabular tone={g.subtotal === null ? 'faint' : 'text'}>
          {g.missing > 0 && g.subtotal !== null ? '≥ ' : ''}
          {amountText(g.subtotal)}
        </Text>
      </View>
    </View>
  );

  const showSubtotal = !(oneDay === false && grouping === 'food');

  return (
    <StackScreen
      title={info.label}
      subtitle={subtitle}
      refreshing={state.refreshing}
      onRefresh={state.reload}
      gap={space.lg}
      footer={
        breakdown && !hidden ? (
          <View testID="breakdown-footer" style={{ gap: 2 }}>
            <View style={styles.footRow}>
              <Text variant="bodyStrong">{t.total}</Text>
              <Text variant="title2" tabular testID="breakdown-total" accessibilityLabel={`Total ${info.label}, ${totalText}`}>
                {totalText}
              </Text>
            </View>
            {showExact ? (
              <Text variant="caption" tone="muted" testID="breakdown-exact" style={{ textAlign: 'right' }}>
                {fill(t.exact, { value: exactText })}
              </Text>
            ) : null}
            {average ? (
              <Text variant="caption" tone="muted" testID="breakdown-average" style={{ textAlign: 'right' }}>
                {fill(average.days === 1 ? t.averageOne : t.average, { value: `${exactAmount(average.average)} ${unit}`, n: average.days })}
              </Text>
            ) : null}
          </View>
        ) : undefined
      }
    >
      {state.error ? (
        <Notice tone="danger" action={{ label: t.retry, onPress: state.reload }}>
          {state.error}
        </Notice>
      ) : null}
      {state.locked ? (
        <Notice tone="info" action={{ label: strings.report.unlock, onPress: () => navigation.navigate('Reauthenticate') }}>
          {t.locked}
        </Notice>
      ) : null}
      {hidden ? <Notice tone="info">{t.hidden}</Notice> : null}
      {state.loading ? <LoadingState /> : null}

      {breakdown && !hidden ? (
        <>
          {breakdown.missingItems > 0 ? (
            <Notice
              tone="warning"
              testID="breakdown-missing"
              title={fill(breakdown.missingItems === 1 ? t.missingTitleOne : t.missingTitle, { n: breakdown.missingItems, nutrient: lower })}
              action={{ label: t.openPending, onPress: () => navigation.navigate('Main', { screen: 'Uncached' }) }}
            >
              {t.missingBody}
            </Notice>
          ) : null}

          {!oneDay && breakdown.items.length > 0 ? (
            <Segmented
              options={[
                { value: 'day', label: t.byDay, testID: 'breakdown-by-day' },
                { value: 'food', label: t.byFood, testID: 'breakdown-by-food' },
              ]}
              value={grouping}
              onChange={setGrouping}
            />
          ) : null}

          {breakdown.items.length === 0 ? (
            <EmptyState icon={ListChecks} title={oneDay ? t.emptyDay : t.empty} />
          ) : !oneDay && grouping === 'food' ? (
            <Card padding="none" testID="breakdown-by-food-list">
              {groups.map((g, i) => (
                <React.Fragment key={g.key}>
                  {i > 0 ? <Divider /> : null}
                  {renderFoodRow(g)}
                </React.Fragment>
              ))}
            </Card>
          ) : (
            groups.map(g => (
              <Card key={g.key} padding="none" testID={`breakdown-group-${g.key}`}>
                <View style={styles.groupHead}>
                  <Text variant="bodyStrong" style={{ flex: 1 }}>
                    {g.title}
                  </Text>
                  {showSubtotal ? (
                    <Text variant="bodyStrong" tabular tone={g.subtotal === null ? 'faint' : 'text'}>
                      {g.missing > 0 && g.subtotal !== null ? '≥ ' : ''}
                      {amountText(g.subtotal)}
                    </Text>
                  ) : null}
                </View>
                {g.items.map(row => (
                  <React.Fragment key={row.id}>
                    <Divider />
                    {renderRow(row)}
                  </React.Fragment>
                ))}
              </Card>
            ))
          )}
          {breakdown.items.length > 0 && !(!oneDay && grouping === 'food') ? (
            <Text variant="caption" tone="muted">
              {t.tapHint}
            </Text>
          ) : null}
        </>
      ) : null}

      <EditItemSheet
        item={editing}
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        onSaved={state.reload}
        onDelete={confirmDelete}
        numbersHidden={hidden}
      />
    </StackScreen>
  );
}
