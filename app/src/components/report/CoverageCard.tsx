import React from 'react';
import { View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import type { WeeklyReport } from '@/api/types';
import { Badge, Card, Divider, IconButton, Notice, Text } from '@/components/kit';
import { fill } from '@/i18n/fill';
import { strings } from '@/i18n/strings';
import { createStyles, space } from '@/theme';
import {
  confidenceLabel,
  dayCellState,
  dayDescription,
  weekDayLabels,
  weekEyebrow,
  weekRangeLabel,
} from '@/utils/report';
import { DayStrip, type DayCell } from './DayStrip';

const t = strings.report;

const useStyles = createStyles(() => ({
  switcher: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  switcherText: { flex: 1, alignItems: 'center', gap: 2 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  body: { gap: space.md },
}));

/**
 * One week at a glance: step between weeks, how many days count, how sure the week's figures are, and which days were
 * logged, looked incomplete, were left out or are still in progress (plan 5.2, 7.6). Every mark has its own shape as well as
 * its own colour. In low-pressure mode it says "the days you logged" and counts none.
 */
export function CoverageCard({
  weekIdx,
  start,
  onPrevWeek,
  onNextWeek,
  report,
  onOpenPending,
}: {
  /** 0 is this week, -1 last week. */
  weekIdx: number;
  start: string;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  /** Absent while the week is loading: the switcher still works. */
  report?: WeeklyReport;
  onOpenPending?: () => void;
}) {
  const styles = useStyles();
  const labels = weekDayLabels();
  const coverage = report?.coverage;
  const hidden = report?.display.numbersHidden === true;
  const cells: DayCell[] =
    coverage?.days.map((d, i) => ({
      label: labels[i]!,
      state: dayCellState(d.state),
      description: dayDescription(d.date, d.state),
    })) ?? [];
  const pending = coverage?.pendingItems ?? 0;

  return (
    <View style={{ gap: space.md }}>
      <Card padding="xl">
        <View style={styles.switcher}>
          <IconButton icon={ChevronLeft} accessibilityLabel={t.week.previous} variant="outline" onPress={onPrevWeek} />
          <View style={styles.switcherText}>
            <Text variant="caption" tone="muted">
              {weekEyebrow(weekIdx)}
            </Text>
            <Text variant="bodyStrong">{weekRangeLabel(start)}</Text>
          </View>
          <IconButton
            icon={ChevronRight}
            accessibilityLabel={t.week.next}
            variant="outline"
            disabled={weekIdx >= 0}
            onPress={onNextWeek}
          />
        </View>

        {coverage ? (
          <>
            <View style={{ marginVertical: space.xl }}>
              <Divider />
            </View>
            <View style={styles.body}>
              <View style={styles.head}>
                <Text variant="title3" testID="week-basis" style={{ flex: 1 }}>
                  {hidden ? strings.lowPressure.basedOn : fill(t.basedOn, { n: coverage.assessedDays })}
                </Text>
                <View
                  accessible
                  accessibilityLabel={fill(t.confidenceLabel, { level: confidenceLabel(coverage.confidence) })}
                >
                  <Badge label={confidenceLabel(coverage.confidence)} tone="neutral" />
                </View>
              </View>
              <DayStrip cells={cells} />
              {report.week.isCurrent ? (
                <Text variant="caption" tone="muted">
                  {t.todayNote}
                </Text>
              ) : null}
            </View>
          </>
        ) : null}
      </Card>

      {pending > 0 ? (
        <Notice
          tone="warning"
          action={onOpenPending ? { label: t.pending.action, onPress: onOpenPending } : undefined}
          testID="pending-notice"
        >
          {hidden
            ? strings.lowPressure.insights.pending_items
            : pending === 1
              ? t.pending.one
              : fill(t.pending.many, { n: pending })}
        </Notice>
      ) : null}
    </View>
  );
}
