import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ChevronDown, ChevronUp, Pencil } from 'lucide-react-native';
import { api, errorMessage } from '@/api/client';
import type { SourceInfo, TargetInfo } from '@/api/types';
import { Badge, Button, Card, Icon, ListGroup, ListRow, LoadingState, Notice, SectionHeader, Text } from '@/components/kit';
import { StackScreen } from '@/components/layout/StackScreen';
import { HowWeCalculate } from '@/components/health/HowWeCalculate';
import { SourceLink } from '@/components/health/SourceLink';
import { useAsync } from '@/hooks/useAsync';
import { useToday } from '@/hooks/useToday';
import { fill } from '@/i18n/fill';
import { strings } from '@/i18n/strings';
import { useHealth } from '@/state/HealthContext';
import { useMeta } from '@/state/MetaContext';
import { space } from '@/theme';
import { fmtNum } from '@/utils/nutrition';

const t = strings.health.targets;
const GROUPS: { title: string; keys: string[] }[] = [
  { title: t.groups.macros, keys: ['protein', 'carbs', 'fat', 'fiber'] },
  { title: t.groups.limits, keys: ['sodium', 'saturatedFat', 'addedSugar'] },
  {
    title: t.groups.minerals,
    keys: [
      'potassium',
      'calcium',
      'iron',
      'magnesium',
      'zinc',
      'vitaminA',
      'vitaminC',
      'vitaminD',
      'vitaminE',
      'vitaminK',
      'vitaminB12',
      'folate',
    ],
  },
];

const originLabel = (o: TargetInfo['origin']) =>
  o === 'custom' ? t.custom : o === 'care_team' ? t.careTeam : t.recommended;

/** A typed target keeps the recommended one in view, with a warning when it is away from the usual values (plan 6.4). */
function CustomNote({ target }: { target: TargetInfo }) {
  if (target.origin !== 'custom') return null;
  return (
    <>
      {target.recommended !== undefined ? (
        <Text variant="caption" tone="muted">
          {fill(t.recommendedValue, { value: fmtNum(target.recommended, target.unit) })}
        </Text>
      ) : null}
      {target.warning ? (
        <Text variant="small" tone="warning" testID={`target-warning-${target.nutrient}`}>
          {target.warning}
        </Text>
      ) : null}
    </>
  );
}

const customLabel = (target: TargetInfo) =>
  target.origin !== 'custom'
    ? ''
    : `${target.recommended !== undefined ? ` ${fill(t.recommendedValue, { value: fmtNum(target.recommended, target.unit) })}.` : ''}${target.warning ? ` ${target.warning}` : ''}`;

function TargetRow({
  target,
  label,
  sources,
  onReset,
  onChange,
}: {
  target: TargetInfo;
  label: string;
  sources: Record<string, SourceInfo>;
  onReset: () => void;
  /** Opens the screen where a target is typed; missing where the person cannot type one. */
  onChange?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const range =
    target.low !== undefined && target.high !== undefined && target.kind === 'range'
      ? ` (usual range ${fmtNum(target.low)} to ${fmtNum(target.high)} ${target.unit})`
      : '';
  const kind = target.kind === 'limit' ? 'limit' : target.kind === 'range' ? 'about' : target.refType === 'EAR' ? 'average requirement' : 'target';
  return (
    <View>
      <Pressable
        onPress={() => setOpen(o => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}, ${kind} ${fmtNum(target.value)} ${target.unit}${range}. ${originLabel(target.origin)}.${customLabel(target)} Tap for how it is calculated.`}
        style={{ padding: space.lg, gap: space.xs }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: space.md,
          }}
        >
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            {label}
          </Text>
          <Text variant="bodyStrong" tabular>
            {fmtNum(target.value)} {target.unit}
          </Text>
          <Icon as={open ? ChevronUp : ChevronDown} size="sm" tone="faint" />
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            flexWrap: 'wrap',
          }}
        >
          <Badge label={originLabel(target.origin)} tone={target.origin === 'recommended' ? 'neutral' : 'success'} />
          <Text variant="caption" tone="muted">
            {kind}
            {range}
          </Text>
        </View>
        <CustomNote target={target} />
      </Pressable>
      {open ? (
        <View
          style={{
            paddingHorizontal: space.lg,
            paddingBottom: space.lg,
            gap: space.sm,
          }}
        >
          <Text variant="small" tone="secondary">
            {target.how}
          </Text>
          <Text variant="caption" tone="muted">
            {target.evidence}: {t.evidence[target.evidence]}
          </Text>
          {target.upperLevel !== undefined ? (
            <Text variant="caption" tone="muted">
              Upper level {fmtNum(target.upperLevel)} {target.unit}, covering all sources including supplements.
            </Text>
          ) : null}
          {sources[target.basis] ? <SourceLink source={sources[target.basis]!} /> : null}
          {onChange || target.origin === 'custom' ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {onChange ? <Button label={t.change} icon={Pencil} variant="soft" size="sm" onPress={onChange} /> : null}
              {target.origin === 'custom' ? <Button label={t.reset} variant="soft" size="sm" onPress={onReset} /> : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Your targets and how each was calculated: the value, who set it, the reason, the evidence tag and the source (plan 6, 9.4). */
export default function TargetsScreen() {
  const navigation = useNavigation();
  const health = useHealth();
  const meta = useMeta();
  const [error, setError] = useState<string | null>(null);
  const res = useAsync(
    () => (health.status === 'ready' ? api.getTargets() : Promise.resolve(null)),
    [health.status, health.targetSet?.id],
  );
  useFocusEffect(
    useCallback(() => {
      health.refresh();
      res.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );
  const labels = useMemo(() => Object.fromEntries(meta.nutrients.map(n => [n.key, n.label])), [meta]);
  const data = res.data;
  const byNutrient = useMemo(() => Object.fromEntries((data?.targets ?? []).map(x => [x.nutrient, x])), [data]);

  const reset = async (key: string) => {
    try {
      await api.updateGoals({ [key]: null });
      await res.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const energy = byNutrient.calories;
  // Anyone with targets can type their own; a profile without personal targets types its care team's numbers instead (plan 6.7).
  const canEdit = !!data && data.mode !== 'reference_only' && health.status === 'ready';
  const set = data?.targetSet;
  const referenceSet = set?.referenceSet ?? health.profile?.referenceSet ?? 'nasem';
  // A weight older than 90 days puts a quiet note on this screen; it never blocks anything (plan 7.7).
  const today = useToday();
  const weightDate = health.profile?.weightDate;
  const staleWeight =
    weightDate && Date.parse(today) - Date.parse(weightDate) > 90 * 86_400_000
      ? new Date(`${weightDate}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })
      : null;

  return (
    <StackScreen
      title={t.title}
      subtitle={t.subtitle}
      refreshing={res.loading && !!data}
      onRefresh={res.reload}
      gap={space.lg}
    >
      {error ? <Notice tone="danger">{error}</Notice> : null}

      {health.status === 'locked' || health.status === 'mismatch' ? (
        <>
          <Notice tone="info">{t.locked}</Notice>
          <Button label={strings.health.settings.unlock} onPress={() => navigation.navigate('RecoveryEntry')} />
        </>
      ) : null}

      {health.numbersHidden ? (
        <HowWeCalculate referenceSet={referenceSet} />
      ) : res.loading && !data && health.status === 'ready' ? (
        <LoadingState />
      ) : data ? (
        <>
          {health.checkIn?.due ? (
            <Notice
              tone="info"
              action={{
                label: t.checkInAction,
                onPress: () => navigation.navigate('HealthIntro'),
              }}
            >
              {t.checkIn}
            </Notice>
          ) : null}

          {data.mode === 'generic' ? (
            <Card>
              <Text variant="bodyStrong">{t.empty}</Text>
              <Text variant="small" tone="secondary" style={{ marginTop: space.xs }}>
                {strings.disclaimer.referenceLong}
              </Text>
              <View style={{ marginTop: space.md }}>
                <Button label={t.setUp} onPress={() => navigation.navigate('HealthIntro')} />
              </View>
            </Card>
          ) : null}

          {energy && data.mode === 'personalised' && set?.energy ? (
            <Card padding="xl" testID="targets-energy">
              <Text variant="small" tone="muted">
                {t.groups.energy}
              </Text>
              <Text variant="display" tabular>
                {fmtNum(energy.value)}
                <Text variant="body" tone="muted">
                  {' '}
                  kcal a day
                </Text>
              </Text>
              {energy.origin === 'custom' ? (
                <View style={{ flexDirection: 'row', marginTop: space.xs }}>
                  <Badge label={t.custom} tone="success" />
                </View>
              ) : null}
              <Text variant="small" tone="secondary" style={{ marginTop: space.xs }}>
                {energy.how}
              </Text>
              <View style={{ marginTop: space.xs, gap: space.xs }}>
                <CustomNote target={energy} />
              </View>
              <Text variant="caption" tone="muted" style={{ marginTop: space.sm }}>
                {t.weightTrend}
              </Text>
              {staleWeight ? (
                <Text variant="caption" tone="muted" style={{ marginTop: space.xs }} testID="stale-weight">
                  {fill(t.staleWeight, { month: staleWeight })}
                </Text>
              ) : null}
            </Card>
          ) : null}

          {canEdit ? (
            <ListGroup>
              <ListRow
                testID="targets-edit"
                icon={Pencil}
                title={t.edit}
                subtitle={t.editHint}
                onPress={() => navigation.navigate('Goals')}
              />
            </ListGroup>
          ) : null}

          {GROUPS.map(g => {
            const rows = g.keys.map(k => byNutrient[k]).filter((x): x is TargetInfo => !!x);
            if (rows.length === 0) return null;
            return (
              <View key={g.title} style={{ gap: space.md }}>
                <SectionHeader title={g.title} />
                <ListGroup>
                  {rows.map(row => (
                    <TargetRow
                      key={row.nutrient}
                      target={row}
                      label={labels[row.nutrient] ?? row.nutrient}
                      sources={data.sources}
                      onReset={() => reset(row.nutrient)}
                      onChange={canEdit ? () => navigation.navigate('Goals') : undefined}
                    />
                  ))}
                </ListGroup>
              </View>
            );
          })}

          {data.mode === 'reference_only' && data.targets.length === 0 ? (
            <Card>
              <Text variant="bodyStrong">{strings.health.referenceOnly.title}</Text>
              <Text variant="small" tone="secondary" style={{ marginTop: space.xs }}>
                {strings.health.referenceOnly.careTeam}
              </Text>
              <View style={{ marginTop: space.md }}>
                <Button
                  label={strings.health.referenceOnly.careTeamAction}
                  onPress={() => navigation.navigate('Goals', { careTeam: true })}
                />
              </View>
            </Card>
          ) : null}

          <HowWeCalculate referenceSet={referenceSet} />
        </>
      ) : null}

      <Text variant="caption" tone="muted">
        {strings.disclaimer.footer}
      </Text>
    </StackScreen>
  );
}
