import React, { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { CheckCircle2 } from 'lucide-react-native';
import { api, errorMessage } from '@/api/client';
import type { MissingUnit, UnknownFood } from '@/api/types';
import { Badge, Button, Card, Chip, Divider, EmptyState, LoadingState, Notice, SectionHeader, Text } from '@/components/kit';
import { FoodGapsList } from '@/components/food/FoodGapsList';
import { TabScreen } from '@/components/layout/TabScreen';
import { useAsync } from '@/hooks/useAsync';
import { useToday } from '@/hooks/useToday';
import { fill } from '@/i18n/fill';
import { strings, where } from '@/i18n/strings';
import { useHealth } from '@/state/HealthContext';
import { useMeta } from '@/state/MetaContext';
import { setPendingTotal } from '@/state/pendingStore';
import { space } from '@/theme';
import { formatDay } from '@/utils/dates';

const t = strings.pending;

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/** Which list a card is in: the person's own items, or everyone's. */
type Scope = 'mine' | 'global';

/**
 * What cannot be counted yet, in two lists that are never mixed. "My pending items" are the foods and units this person logged
 * (newest first); "Global pending items" are everything anyone logged (most-logged first), with a mark on the ones this person also
 * logged. Fixing one fixes it for everyone, retroactively, whichever list it was opened from.
 */
export default function UncachedScreen() {
  const { data, error, loading, reload } = useAsync(() => api.uncached(), []);
  // After the two lists: the foods that have a value for energy but lack the ones the weekly view reads (plan 7.4), from this person's
  // own last four weeks. A different worklist from what is pending, so it keeps its own place at the end.
  const gaps = useAsync(() => api.getFoodGaps(), []);
  const navigation = useNavigation();
  const meta = useMeta();
  const health = useHealth();
  const today = useToday();
  const [notice, setNotice] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      reload();
      gaps.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reload]),
  );

  const mine = data?.mine;
  const globalTotal = (data?.totals.unknownFoods ?? 0) + (data?.totals.missingUnits ?? 0);
  const mineTotal = (mine?.totals.unknownFoods ?? 0) + (mine?.totals.missingUnits ?? 0);
  // The tab's badge counts what is waiting on this person; an older Worker has no "mine" and counts everything, as it always did.
  const badge = mine ? mineTotal : globalTotal;
  useEffect(() => {
    if (data) setPendingTotal(badge);
  }, [data, badge]);

  const onResolved = (msg: string) => {
    setNotice(msg);
    reload();
  };

  const subtitle = !data
    ? undefined
    : globalTotal === 0 && mineTotal === 0
      ? t.nothing
      : mine
        ? fill(t.subtitle, { mine: mineTotal, all: globalTotal })
        : fill(t.subtitleOnly, { n: globalTotal });

  return (
    <TabScreen
      title={t.title}
      subtitle={subtitle}
      refreshing={loading && !!data}
      onRefresh={() => {
        reload();
        gaps.reload();
      }}
    >
      {notice ? (
        <Notice tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Notice>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {!data && loading ? <LoadingState /> : null}

      {data && mine ? (
        <PendingSection testID="pending-mine" title={t.mine} count={mineTotal} lead={where.pendingMineLead}>
          {mineTotal === 0 ? (
            <Text variant="body" tone="secondary" testID="pending-mine-empty">
              {where.pendingMineEmpty}
            </Text>
          ) : null}
          <PendingGroups scope="mine" scopeData={mine} today={today} onResolved={onResolved} />
        </PendingSection>
      ) : null}

      {data && mine ? <Divider /> : null}

      {data ? (
        <PendingSection testID="pending-global" title={t.global} count={globalTotal} lead={mine ? where.pendingGlobalLead : where.uncachedLead}>
          {globalTotal === 0 ? <EmptyState icon={CheckCircle2} title="All caught up" body={mine ? where.pendingGlobalEmpty : where.uncachedEmpty} /> : null}
          <PendingGroups scope="global" scopeData={data} today={today} onResolved={onResolved} />
        </PendingSection>
      ) : null}

      {data && gaps.data ? (
        <FoodGapsList
          gaps={gaps.data}
          nutrients={meta.nutrients}
          numbersHidden={health.numbersHidden}
          onOpen={foodId => navigation.navigate('FoodEditor', { foodId })}
        />
      ) : null}
    </TabScreen>
  );
}

/** One of the two lists: its name and how many are waiting, one line on what it is, then its groups. */
function PendingSection({
  testID,
  title,
  count,
  lead,
  children,
}: {
  testID: string;
  title: string;
  count: number;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <View testID={testID} style={{ gap: space.lg }}>
      <View style={{ gap: space.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
          <Text variant="title2" accessibilityRole="header" style={{ flex: 1 }}>
            {title}
          </Text>
          <Badge label={fill(t.countLabel, { n: count })} tone={count > 0 ? 'warning' : 'success'} />
        </View>
        <Text variant="small" tone="muted">
          {lead}
        </Text>
      </View>
      {children}
    </View>
  );
}

/** Unknown foods, then missing unit conversions, of one scope. */
function PendingGroups({
  scope,
  scopeData,
  today,
  onResolved,
}: {
  scope: Scope;
  scopeData: { totals: { unknownFoods: number; missingUnits: number }; unknownFoods: UnknownFood[]; missingUnits: MissingUnit[] };
  today: string;
  onResolved: (message: string) => void;
}) {
  return (
    <>
      {scopeData.unknownFoods.length > 0 ? (
        <View style={{ gap: space.md }}>
          <SectionHeader
            title={t.unknownFoods}
            right={
              <Text variant="small" tone="muted" tabular>
                {scopeData.totals.unknownFoods}
              </Text>
            }
          />
          {scopeData.unknownFoods.map(f => (
            <UnknownFoodCard key={`${scope}:${f.normalizedName}`} scope={scope} food={f} today={today} onResolved={onResolved} />
          ))}
        </View>
      ) : null}

      {scopeData.missingUnits.length > 0 ? (
        <View style={{ gap: space.md }}>
          <SectionHeader
            title={t.missingUnits}
            right={
              <Text variant="small" tone="muted" tabular>
                {scopeData.totals.missingUnits}
              </Text>
            }
          />
          {scopeData.missingUnits.map(m => (
            <MissingUnitCard key={`${scope}:${m.foodId}:${m.unit}`} scope={scope} missing={m} today={today} />
          ))}
        </View>
      ) : null}
    </>
  );
}

const lastLogged = (date: string | undefined, today: string) => (date ? fill(t.lastLogged, { when: formatDay(date, today).toLowerCase() }) : null);

function UnknownFoodCard({
  scope,
  food,
  today,
  onResolved,
}: {
  scope: Scope;
  food: UnknownFood;
  today: string;
  onResolved: (message: string) => void;
}) {
  const navigation = useNavigation();
  const [busy, setBusy] = useState(false);

  const alias = (foodId: string, displayName: string) =>
    Alert.alert(`Count "${food.normalizedName}" as ${displayName}?`, "Everyone's items with this name will use its values.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Yes, same food',
        onPress: async () => {
          setBusy(true);
          try {
            const res = await api.addAlias(foodId, food.normalizedName);
            onResolved(`Linked to ${displayName}. ${plural(res.resolvedCount, 'item')} resolved.`);
          } catch (e) {
            Alert.alert('Could not link', errorMessage(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);

  const detail =
    scope === 'mine'
      ? [plural(food.itemCount, 'item'), food.units.join(', '), lastLogged(food.lastDate, today)].filter(Boolean).join(' · ')
      : `${plural(food.itemCount, 'item')} · ${where.whoLogged(food.userCount)}in ${food.units.join(', ')}`;

  return (
    <Card testID={`pending-food-${scope}-${food.normalizedName}`}>
      <View style={{ gap: space.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
          <Text variant="title3" style={{ flex: 1 }}>
            {food.examples[0] ?? food.normalizedName}
          </Text>
          {scope === 'global' && (food.myItemCount ?? 0) > 0 ? <Badge label={t.yours} tone="success" /> : null}
        </View>
        <Text variant="small" tone="muted">
          {detail}
        </Text>
        {food.examples.length > 1 ? (
          <Text variant="caption" tone="muted">
            Also said as: {food.examples.slice(1).join(', ')}
          </Text>
        ) : null}
      </View>

      {food.suggestions.length > 0 ? (
        <View style={{ gap: space.sm, marginTop: space.lg }}>
          <Text variant="smallStrong" tone="secondary">
            Did you mean
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {food.suggestions.map(s => (
              <Chip key={s.foodId} label={`${s.displayName}?`} onPress={() => !busy && alias(s.foodId, s.displayName)} />
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ gap: space.xs, marginTop: space.lg }}>
        <Button
          label="Enter values"
          fullWidth
          onPress={() =>
            navigation.navigate('FoodEditor', { name: food.examples[0] ?? food.normalizedName, unitHint: food.units[0] })
          }
        />
        <Button
          label="Same as an existing food…"
          variant="ghost"
          fullWidth
          onPress={() => navigation.navigate('FoodPicker', { aliasFor: food.normalizedName })}
        />
      </View>
    </Card>
  );
}

function MissingUnitCard({ scope, missing, today }: { scope: Scope; missing: MissingUnit; today: string }) {
  const navigation = useNavigation();
  const detail =
    scope === 'mine'
      ? [`Stored per ${missing.baseUnit}`, plural(missing.itemCount, 'item'), lastLogged(missing.lastDate, today)].filter(Boolean).join(' · ')
      : `Stored per ${missing.baseUnit} · ${plural(missing.itemCount, 'item')}${where.whoLogged(missing.userCount, true)}`;
  return (
    <Card testID={`pending-unit-${scope}-${missing.foodId}-${missing.unit}`}>
      <View style={{ gap: space.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
          <Text variant="title3" style={{ flex: 1 }}>{`${missing.foodName} in ${missing.unit}`}</Text>
          {scope === 'global' && (missing.myItemCount ?? 0) > 0 ? <Badge label={t.yours} tone="success" /> : null}
        </View>
        <Text variant="small" tone="muted">
          {detail}
        </Text>
      </View>
      <View style={{ marginTop: space.lg }}>
        <Button
          label={`How much is 1 ${missing.unit}?`}
          variant="secondary"
          fullWidth
          onPress={() =>
            navigation.navigate('UnitConversion', {
              foodId: missing.foodId,
              foodName: missing.foodName,
              baseUnit: missing.baseUnit,
              unit: missing.unit,
            })
          }
        />
      </View>
    </Card>
  );
}
