import React from 'react';
import { View } from 'react-native';
import type { WeeklyReport } from '@/api/types';
import { Divider, ProgressBar, Sheet, Text } from '@/components/kit';
import { fill, printNumber } from '@/i18n/fill';
import { strings } from '@/i18n/strings';
import { space } from '@/theme';
import { scoreFigure } from './ScoreCard';
import { Sparkline, sparklineSummary } from './Sparkline';

const t = strings.report.score;

/**
 * The parts of the Nutrient mix (plan 5.5): the exact value, the points each part earned, how much data stood behind each,
 * and which parts had too little to count (they earn nothing, so the figure is a minimum). With four or five logged days it
 * shows the range left by leaving out any one day, so a score that rests on a single day looks fragile. Nothing here claims
 * the figure says anything about health.
 */
export function ScoreBreakdown({
  report,
  visible,
  onClose,
}: {
  report: WeeklyReport;
  visible: boolean;
  onClose: () => void;
}) {
  const s = report.score;
  const figure = scoreFigure(s);
  const scores = report.history.map(h => h.score);
  const trend = report.scoreTrend
    ? { higher: t.higher, lower: t.lower, about_the_same: t.same }[report.scoreTrend]
    : null;
  return (
    <Sheet visible={visible} onClose={onClose} title={t.title} testID="score-breakdown">
      <View style={{ gap: space.lg, paddingBottom: space.xl }}>
        <Text variant="small" tone="secondary">
          {t.explain}
        </Text>

        {figure && s.value !== null ? (
          <View style={{ gap: space.xs }}>
            <Text variant="display" tabular>
              {figure}
            </Text>
            <Text variant="small" tone="muted" tabular>
              {fill(t.exact, {
                value: printNumber(Math.round(s.value * 10) / 10),
                points: printNumber(s.points),
                outOf: s.outOf,
              })}
            </Text>
            {s.range ? (
              <Text variant="small" tone="muted" tabular>
                {fill(t.range, { low: Math.round(s.range[0]), high: Math.round(s.range[1]) })}
              </Text>
            ) : null}
            {trend ? (
              <Text variant="small" tone="secondary">
                {trend}
              </Text>
            ) : null}
          </View>
        ) : (
          <Text variant="body" tone="secondary">
            {t.withheld[s.withheld ?? 'few_days']}
          </Text>
        )}

        {s.components.length > 0 ? (
          <View style={{ gap: space.md }}>
            <Text variant="smallStrong" tone="muted">
              {t.parts}
            </Text>
            {s.components.map((c, i) => (
              <View key={c.id} style={{ gap: space.xs }}>
                {i > 0 ? <Divider /> : null}
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    gap: space.md,
                    paddingTop: i > 0 ? space.sm : 0,
                  }}
                >
                  <Text variant="bodyStrong">{t.names[c.id] ?? c.id}</Text>
                  <Text variant="bodyStrong" tabular tone={c.scorable ? 'text' : 'muted'}>
                    {c.scorable
                      ? fill(t.part, { points: printNumber(Math.round(c.points * 10) / 10), outOf: c.outOf })
                      : t.unknownPart}
                  </Text>
                </View>
                <ProgressBar
                  value={c.scorable ? c.points / c.outOf : 0}
                  tone={c.scorable ? 'primary' : 'muted'}
                  height={4}
                />
                <Text variant="caption" tone="muted">
                  {c.standard}
                  {c.scorable ? '' : `. ${fill(t.partCoverage, { pct: Math.round(c.coverage * 100) })}`}
                </Text>
              </View>
            ))}
            {s.isMinimum ? (
              <Text variant="caption" tone="muted">
                {t.unknownNote}
              </Text>
            ) : null}
          </View>
        ) : null}

        {scores.some(v => v !== null) ? (
          <View style={{ gap: space.xs }}>
            <Text variant="smallStrong" tone="muted">
              {t.history}
            </Text>
            <Sparkline values={scores} accessibilityLabel={sparklineSummary(t.history, scores)} />
            <Text variant="caption" tone="muted">
              {t.historyGap}
            </Text>
          </View>
        ) : null}

        <Text variant="caption" tone="muted">
          {t.notMeasured}
        </Text>
        <Text variant="caption" tone="muted">
          {t.disclaimer}
        </Text>
        <Text variant="caption" tone="muted">
          {strings.disclaimer.footer}
        </Text>
      </View>
    </Sheet>
  );
}
