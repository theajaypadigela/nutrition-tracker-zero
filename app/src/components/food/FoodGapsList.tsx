import React from 'react';
import { View } from 'react-native';
import type { FoodGaps, NutrientInfo } from '@/api/types';
import { Badge, Button, Card, SectionHeader, Text } from '@/components/kit';
import { fill } from '@/i18n/fill';
import { strings } from '@/i18n/strings';
import { space } from '@/theme';
import { nutrientInfo } from '@/utils/report';

const t = strings.food.gaps;

/**
 * "Foods with gaps" (plan 7.4, Phase 4): the foods eaten in the last four weeks that lack values the weekly view needs, most energy
 * first, so the data gets filled in where it matters. With numbers hidden it shows no percentage: the order says what matters.
 */
export function FoodGapsList({
  gaps,
  nutrients,
  numbersHidden,
  onOpen,
}: {
  gaps: FoodGaps;
  nutrients: NutrientInfo[];
  numbersHidden: boolean;
  onOpen: (foodId: string) => void;
}) {
  if (gaps.loggedFoods === 0) return null;
  return (
    <View style={{ gap: space.md }} testID="food-gaps">
      <SectionHeader title={t.title} />
      <Text variant="small" tone="muted">
        {t.intro}
      </Text>
      {!numbersHidden && gaps.foods.length > 0 ? (
        <Text variant="small" tone="secondary" tabular testID="gaps-complete">
          {fill(t.complete, { pct: Math.round(gaps.completeShare * 100) })}
        </Text>
      ) : null}
      {gaps.foods.length === 0 ? (
        <Text variant="body" tone="secondary" testID="gaps-empty">
          {t.empty}
        </Text>
      ) : (
        gaps.foods.map(f => (
          <Card key={f.foodId} testID={`gap-${f.foodId}`}>
            <View style={{ gap: space.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
                <Text variant="title3" numberOfLines={2} style={{ flex: 1 }}>
                  {f.name}
                </Text>
                {f.source ? <Badge label={strings.food.source[f.source]} tone="neutral" /> : null}
              </View>
              <Text variant="small" tone="muted" tabular>
                {[numbersHidden ? null : fill(t.share, { pct: Math.round(f.share * 100) }), f.items === 1 ? t.eatenOne : fill(t.eaten, { n: f.items })]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              <Text variant="small" tone="secondary">
                {fill(t.missing, { list: f.missing.map(k => nutrientInfo(nutrients, k).label).join(', ') })}
              </Text>
            </View>
            <View style={{ marginTop: space.lg }}>
              <Button testID={`gap-fill-${f.foodId}`} label={t.action} variant="secondary" fullWidth onPress={() => onOpen(f.foodId)} />
            </View>
          </Card>
        ))
      )}
    </View>
  );
}
