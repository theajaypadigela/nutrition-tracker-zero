import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import type { NutrientInfo, RangeReport } from '@/api/types';
import { Button, Card, Divider, Icon, Notice, Segmented, Text } from '@/components/kit';
import { fill } from '@/i18n/fill';
import { strings } from '@/i18n/strings';
import { space } from '@/theme';
import { fmtNum, nutrientInfo } from '@/utils/report';
import { rangeLabel } from '@/utils/reportRange';

const t = strings.report.periods;
const missingNote = (count: number) => (count === 1 ? t.missingOne : fill(t.missing, { n: count }));

/**
 * The nutrients of a span, as a total or a daily average (the report's Nutrient intake card). Each row opens the foods that add up to its
 * total, for the same days (`onOpenNutrient`).
 */
export function RangeIntakeCard({
  report,
  nutrients,
  onOpenNutrient,
}: {
  report: RangeReport;
  nutrients: NutrientInfo[];
  onOpenNutrient?: (key: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [metric, setMetric] = useState<'total' | 'average'>('total');
  if (report.display.numbersHidden) return null;
  const rows = expanded ? report.nutrients : report.nutrients.slice(0, 4);
  return (
    <Card padding="xl" testID="range-intake-card">
      <View style={{ gap: space.md }}>
        <Text variant="title3">{t.title}</Text>
        <Text variant="small" tone="secondary">
          {rangeLabel(report.range.from, report.range.to)}
        </Text>
        {report.range.to > report.range.through ? (
          <Text variant="caption" tone="muted">
            {fill(t.through, {
              date: rangeLabel(report.range.through, report.range.through),
            })}
          </Text>
        ) : null}
        <Text variant="small" tone="secondary">
          {fill(t.basis, {
            logged: report.coverage.loggedDays,
            days: report.coverage.calendarDays,
          })}
        </Text>
        {report.coverage.skippedDays > 0 ? (
          <Text variant="caption" tone="muted">
            {report.coverage.skippedDays === 1 ? t.skippedOne : fill(t.skipped, { n: report.coverage.skippedDays })}
          </Text>
        ) : null}
        {report.coverage.pendingItems > 0 ? (
          <Notice tone="info">
            {report.coverage.pendingItems === 1 ? t.pendingOne : fill(t.pending, { n: report.coverage.pendingItems })}
          </Notice>
        ) : null}
        {report.coverage.itemCount === 0 ? (
          <Text variant="body" tone="secondary">
            {t.empty}
          </Text>
        ) : (
          <>
            <Segmented
              options={[
                {
                  value: 'total',
                  label: t.total,
                  testID: 'report-metric-total',
                },
                {
                  value: 'average',
                  label: t.average,
                  testID: 'report-metric-average',
                },
              ]}
              value={metric}
              onChange={setMetric}
            />
            {rows.map((n, i) => {
              const info = nutrientInfo(nutrients, n.nutrient);
              const value = metric === 'total' ? n.total : n.meanPerLoggedDay;
              const amount = value === null ? t.unknown : fmtNum(value, info.unit);
              const figure = n.isLowerBound && value !== null ? fill(t.atLeast, { value: amount }) : amount;
              return (
                <React.Fragment key={n.nutrient}>
                  {i > 0 ? <Divider /> : null}
                  <Pressable
                    testID={`range-nutrient-${n.nutrient}`}
                    accessible
                    disabled={!onOpenNutrient}
                    onPress={() => onOpenNutrient?.(n.nutrient)}
                    accessibilityRole={onOpenNutrient ? 'button' : undefined}
                    accessibilityLabel={`${info.label}, ${figure}${n.missingItems ? `, ${missingNote(n.missingItems)}` : ''}${onOpenNutrient ? `. ${strings.breakdown.openHint}` : ''}`}
                    style={{ gap: space.xs }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: space.md,
                      }}
                    >
                      <Text variant="body" style={{ flex: 1 }}>
                        {info.label}
                      </Text>
                      <Text variant="bodyStrong" tabular style={{ flex: 1, textAlign: 'right' }}>
                        {figure}
                      </Text>
                      {onOpenNutrient ? <Icon as={ChevronRight} size="sm" tone="faint" /> : null}
                    </View>
                    {n.missingItems > 0 ? (
                      <Text variant="caption" tone="muted">
                        {missingNote(n.missingItems)}
                      </Text>
                    ) : null}
                  </Pressable>
                </React.Fragment>
              );
            })}
            {report.nutrients.length > 4 ? (
              <Button variant="ghost" label={expanded ? t.less : t.more} testID="report-view-more" onPress={() => setExpanded(v => !v)} />
            ) : null}
            <Text variant="caption" tone="muted">
              {t.note}
            </Text>
          </>
        )}
      </View>
    </Card>
  );
}
