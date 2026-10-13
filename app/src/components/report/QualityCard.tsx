import React from 'react';
import { View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import type { AmountToCheck, NutrientInfo, WeekQuality } from '@/api/types';
import { Button, Card, Divider, Icon, ListGroup, ListRow, Text } from '@/components/kit';
import { fill } from '@/i18n/fill';
import { strings } from '@/i18n/strings';
import { space } from '@/theme';
import { weekdayName } from '@/utils/insights';
import { nutrientInfo } from '@/utils/report';

const t = strings.report.quality;
const SOURCE_ORDER = ['label', 'database', 'recipe', 'estimate', 'none'] as const;

/** "pack labels 60%, guesses 10%, not recorded 30%": the parts with any energy, largest share of the known sources first. */
export function sourcesSentence(sources: WeekQuality['valueSources']): string | null {
  const parts = SOURCE_ORDER.filter(k => sources[k] > 0).map(k => fill(t.source[k]!, { pct: Math.round(sources[k] * 100) }));
  return parts.length ? fill(t.sources, { list: parts.join(', ') }) : null;
}

/** Names in a list: commas, unless a name has a comma of its own ("Dal, rice and sabzi"), then semicolons. */
export const joinNames = (names: string[]): string => names.join(names.some(n => n.includes(',')) ? '; ' : ', ');

/** "20 katori of Rice, Tuesday" and why it is worth a look. */
export function amountLine(a: AmountToCheck): { title: string; why: string } {
  return {
    title: fill(t.amount, { quantity: a.quantity, unit: a.unit, name: a.name, day: weekdayName(a.date) }),
    why: fill(t.why[a.reason] ?? '', { kcal: a.kcal === null ? '' : Math.round(a.kcal / 10) * 10 }),
  };
}

/**
 * What is missing or uncertain in the week's figures (plan 7.4, 7.7, 7.8), each with the way to fix it: the foods behind the week
 * that lack values the report uses, amounts a call may have misheard, and where the numbers come from. It says what was not
 * counted and why, and changes nothing by itself.
 */
export function QualityCard({
  quality,
  assessedDays,
  nutrients,
  onOpenGaps,
  onOpenDay,
}: {
  quality: WeekQuality;
  assessedDays: number;
  /** The catalogue, for the names of the values that are missing. */
  nutrients: NutrientInfo[];
  onOpenGaps: () => void;
  onOpenDay: (date: string) => void;
}) {
  const gaps = quality.foodsWithGaps;
  const amounts = quality.amountsToCheck;
  const sources = sourcesSentence(quality.valueSources);
  if (assessedDays === 0 && amounts.length === 0) return null;

  return (
    <View style={{ gap: space.md }} testID="quality-card">
      <Text variant="title3">{t.title}</Text>
      {assessedDays > 0 ? (
        <Card padding="xl">
          <View style={{ gap: space.md }}>
            {gaps.count > 0 ? (
              <>
                <Text variant="body" testID="quality-gaps">
                  {fill(gaps.count === 1 ? t.gapsOne : t.gaps, { n: gaps.count, pct: Math.round(gaps.energyShare * 100) })}
                </Text>
                {gaps.names.length > 0 ? (
                  <Text variant="small" tone="secondary">
                    {fill(t.gapsNames, { names: joinNames(gaps.names) })}
                  </Text>
                ) : null}
                {gaps.missing && gaps.missing.length > 0 ? (
                  <Text variant="small" tone="secondary" testID="quality-missing">
                    {fill(t.gapsMissing, { list: gaps.missing.map(k => nutrientInfo(nutrients, k).label.toLowerCase()).join(', ') })}
                  </Text>
                ) : null}
                <Button testID="quality-fill" label={t.gapsAction} variant="secondary" size="sm" onPress={onOpenGaps} style={{ alignSelf: 'flex-start' }} />
              </>
            ) : (
              <Text variant="body" tone="secondary" testID="quality-gaps-none">
                {t.gapsNone}
              </Text>
            )}
            {sources ? (
              <>
                <Divider />
                <Text variant="small" tone="secondary" testID="quality-sources">
                  {sources}
                </Text>
                {quality.valueSources.estimate + quality.valueSources.none > 0 ? (
                  <Text variant="caption" tone="muted">
                    {t.sourcesHint}
                  </Text>
                ) : null}
              </>
            ) : null}
          </View>
        </Card>
      ) : null}
      {amounts.length > 0 ? (
        <View style={{ gap: space.sm }} testID="quality-amounts">
          <Text variant="smallStrong" tone="secondary">
            {t.amountsTitle}
          </Text>
          <ListGroup>
            {amounts.map(a => {
              const line = amountLine(a);
              return (
                <ListRow
                  key={`${a.date}-${a.name}-${a.quantity}-${a.unit}`}
                  testID={`quality-amount-${a.date}`}
                  title={line.title}
                  subtitle={line.why}
                  accessibilityLabel={`${line.title}. ${line.why}. ${t.amountAction}`}
                  right={<Icon as={ChevronRight} size="sm" tone="faint" />}
                  onPress={() => onOpenDay(a.date)}
                />
              );
            })}
          </ListGroup>
          <Text variant="caption" tone="muted">
            {t.amountsHint}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
