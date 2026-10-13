import React from 'react';
import { View } from 'react-native';
import type { Mode, NutrientInfo, NutrientReport } from '@/api/types';
import { ListGroup, Text } from '@/components/kit';
import { strings } from '@/i18n/strings';
import { space } from '@/theme';
import { MIN_DAYS_FOR_SUMMARY, nutrientInfo } from '@/utils/report';
import { NutrientLine } from './NutrientLine';

const t = strings.report.fourWeek;

/**
 * The vitamins (A, C, D, E, K, B12 and folate) over the rolling four weeks (plan 4.6, 5.2). They vary too much from day to day to judge from
 * seven days, so the week's rows show amounts and this card carries the verdicts, from at least three logged days in the
 * window.
 */
export function FourWeekCard({
  items,
  nutrients,
  mode,
  onOpen,
}: {
  items: NutrientReport[];
  nutrients: NutrientInfo[];
  mode: Mode;
  onOpen?: (key: string) => void;
}) {
  if (items.length === 0) return null;
  const judged = items[0]!.assessedDays >= MIN_DAYS_FOR_SUMMARY;
  return (
    <View style={{ gap: space.md }} testID="four-week-card">
      <View style={{ gap: 2 }}>
        <Text variant="title3">{t.title}</Text>
        <Text variant="small" tone="muted">
          {t.window}
        </Text>
      </View>
      <ListGroup>
        {items.map(n => {
          const info = nutrientInfo(nutrients, n.nutrient);
          return (
            <NutrientLine
              key={n.nutrient}
              report={n}
              name={info.label}
              unit={info.unit}
              mode={mode}
              judged={judged}
              onPress={onOpen ? () => onOpen(n.nutrient) : undefined}
            />
          );
        })}
      </ListGroup>
      <Text variant="caption" tone="muted">
        {judged ? t.hint : `${t.notEnough} ${t.hint}`}
      </Text>
    </View>
  );
}
