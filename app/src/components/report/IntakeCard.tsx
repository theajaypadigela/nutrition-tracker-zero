import React from 'react';
import { View } from 'react-native';
import type { NutrientInfo, NutrientReport, WeeklyReport } from '@/api/types';
import { Card, Divider, Text } from '@/components/kit';
import { fill } from '@/i18n/fill';
import { strings } from '@/i18n/strings';
import { createStyles, space } from '@/theme';
import { isJudged, nutrientInfo } from '@/utils/report';

const t = strings.report.intake;

/** The rows, in order: energy, then the three macronutrients. */
export const INTAKE_KEYS = ['calories', 'protein', 'carbs', 'fat'] as const;

const useStyles = createStyles(() => ({
  head: { gap: 2 },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.md },
  value: { alignItems: 'flex-end', flexShrink: 0, gap: 2 },
  rows: { gap: space.md },
}));

/**
 * A figure no more precise than a log can be (plan 7.6): energy to the nearest 10 kcal, grams to the nearest whole gram from 10 g,
 * one decimal below that.
 */
export function intakeFigure(value: number, unit: string): string {
  const n = unit === 'kcal' ? Math.round(value / 10) * 10 : value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${n.toLocaleString('en-US')} ${unit}`;
}

/** "calories about the same, protein higher": each row that has a trend, in the card's order. */
export function trendSentence(rows: NutrientReport[], nutrients: NutrientInfo[]): string | null {
  const withTrend = rows.filter(r => r.trend);
  if (withTrend.length === 0) return null;
  const list = withTrend
    .map(r => {
      const name = nutrientInfo(nutrients, r.nutrient).label.toLowerCase();
      return fill({ higher: t.higher, lower: t.lower, about_the_same: t.same }[r.trend!.direction], { name });
    })
    .join(', ');
  const weeks = new Set(withTrend.map(r => r.trend!.weeks));
  return weeks.size === 1 ? fill(t.trend, { weeks: [...weeks][0]!, list }) : fill(t.trendMixed, { list });
}

/**
 * What was logged, per day that counts, before any judgement (plan 5.2, 7.6): energy and the three macronutrients, with the share
 * of energy carbohydrate and fat supplied, and how the week compares with earlier ones once there are three of them. A partial
 * total reads "at least"; too little data says so. In a week with fewer than three counted days the figures are "logged so far".
 * Never shown with numbers hidden: the Worker sends no amounts then.
 */
export function IntakeCard({ report, nutrients }: { report: WeeklyReport; nutrients: NutrientInfo[] }) {
  const styles = useStyles();
  const days = report.coverage.assessedDays;
  const rows = INTAKE_KEYS.flatMap(k => report.nutrients.filter(n => n.nutrient === k));
  if (rows.length === 0) return null;
  const judged = isJudged(report.coverage.confidence);
  const calories = rows.find(r => r.nutrient === 'calories');
  const trend = trendSentence(rows, nutrients);

  return (
    <Card padding="xl" testID="intake-card">
      <View style={{ gap: space.lg }}>
        <View style={styles.head}>
          <Text variant="title3">{t.title}</Text>
          <Text variant="small" tone="muted" testID="intake-basis">
            {days === 0 ? t.none : !judged ? t.soFar : days === 1 ? t.basisOne : fill(t.basis, { n: days })}
          </Text>
        </View>
        {days > 0 ? (
          <View style={styles.rows}>
            {rows.map((r, i) => {
              const info = nutrientInfo(nutrients, r.nutrient);
              const figure =
                r.meanPerAssessedDay === null
                  ? t.notEnough
                  : r.isLowerBound
                    ? fill(t.atLeast, { value: intakeFigure(r.meanPerAssessedDay, info.unit) })
                    : intakeFigure(r.meanPerAssessedDay, info.unit);
              const share =
                r.shareOfEnergy !== undefined && r.meanPerAssessedDay !== null
                  ? fill(t.share, { pct: Math.round(r.shareOfEnergy * 100) })
                  : null;
              return (
                <React.Fragment key={r.nutrient}>
                  {i > 0 ? <Divider /> : null}
                  <View
                    style={styles.row}
                    accessible
                    accessibilityLabel={[info.label, figure, share].filter(Boolean).join(', ')}
                    testID={`intake-${r.nutrient}`}
                  >
                    <Text variant="body" style={{ flex: 1 }}>
                      {info.label}
                    </Text>
                    <View style={styles.value}>
                      <Text variant="bodyStrong" tabular tone={r.meanPerAssessedDay === null ? 'muted' : 'text'}>
                        {figure}
                      </Text>
                      {share ? (
                        <Text variant="caption" tone="muted" tabular>
                          {share}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </React.Fragment>
              );
            })}
          </View>
        ) : null}
        {judged && days > 0 ? (
          <Text variant="small" tone="secondary" testID="intake-trend">
            {calories?.trend ? trend : t.trendSoon}
          </Text>
        ) : null}
        {days > 0 ? (
          <Text variant="caption" tone="muted">
            {t.note}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}
