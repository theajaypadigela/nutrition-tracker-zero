import React from 'react';
import { View } from 'react-native';
import type { WeightReport } from '@/api/types';
import { Button, Card, Text } from '@/components/kit';
import { Sparkline, sparklineSummary } from '@/components/report/Sparkline';
import { fill, printNumber, signedNumber } from '@/i18n/fill';
import { strings } from '@/i18n/strings';
import { space } from '@/theme';

const t = strings.report.weight;

/**
 * The weight line of the weekly view (plan 5.7): the latest weigh-in, the smoothed trend as a line, a rate only when there are three weeks
 * and six weigh-ins to say one, and, for a plan that asks for a change, what the trend did against what the plan expects, as information
 * with its range. The trend is the better guide, so it is the line: one day's water barely moves it. No verdict, no colour for up or down.
 */
export function WeightCard({
  weight,
  isCurrent,
  onAdd,
}: {
  weight: WeightReport | null;
  isCurrent: boolean;
  onAdd: () => void;
}) {
  // A past week with no weigh-in before it has nothing to say, and adding one now would not belong to it.
  if (!weight && !isCurrent) return null;
  if (!weight) {
    return (
      <Card padding="xl" testID="weight-card">
        <View style={{ gap: space.md }}>
          <Text variant="title3">{t.title}</Text>
          <Text variant="body" tone="secondary">
            {t.empty}
          </Text>
          <Button testID="weight-add" label={t.add} variant="soft" onPress={onAdd} />
        </View>
      </Card>
    );
  }

  const trend = weight.points.map(p => p.trendKg);
  const rate = weight.ratePerWeekKg;
  const rateText =
    rate === null
      ? t.rateSoon
      : rate === 0
        ? t.rateFlat
        : fill(rate < 0 ? t.rateDown : t.rateUp, { rate: printNumber(Math.abs(rate)) });
  const plan = weight.plan;
  const first = weight.points[0]!;

  return (
    <Card padding="xl" testID="weight-card">
      <View style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.md }}>
          <Text variant="title3">{t.title}</Text>
          <Text variant="small" tone="muted" tabular>
            {weight.weighIns === 1 ? t.weighInsOne : fill(t.weighIns, { n: weight.weighIns })}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.md }}>
          <Text variant="display" tabular testID="weight-latest">
            {fill(t.latest, { kg: weight.latest.weightKg })}
          </Text>
          <Text variant="body" tone="muted" tabular testID="weight-trend">
            {fill(t.trend, { kg: weight.trendKg })}
          </Text>
        </View>
        {trend.length > 1 ? (
          <Sparkline
            values={trend}
            accessibilityLabel={`${fill(t.chart, { from: first.date, to: weight.latest.date })}: ${sparklineSummary(t.history, trend, ' kg')}`}
          />
        ) : null}
        <Text variant="small" tone="secondary" testID="weight-rate">
          {rateText}
        </Text>
        {plan ? (
          <Text variant="small" tone="secondary" tabular testID="weight-plan">
            {fill(t.plan, {
              w: plan.weeks,
              d: signedNumber(plan.observedKg),
              low: signedNumber(plan.expectedKg.low),
              high: signedNumber(plan.expectedKg.high),
            })}{' '}
            {strings.disclaimer.projection}
          </Text>
        ) : null}
        <Text variant="caption" tone="muted" tabular>
          {fill(t.noise, { noise: weight.noiseBandKg })}
        </Text>
        {isCurrent ? <Button testID="weight-add" label={t.add} variant="soft" onPress={onAdd} /> : null}
      </View>
    </Card>
  );
}
