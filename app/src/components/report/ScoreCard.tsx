import React from 'react';
import { View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import type { ScoreReport, WeeklyReport } from '@/api/types';
import { Card, Icon, Text } from '@/components/kit';
import { fill } from '@/i18n/fill';
import { strings } from '@/i18n/strings';
import { space } from '@/theme';
import { Sparkline, sparklineSummary } from './Sparkline';

const t = strings.report.score;

/** "about 85" or "at least 80": the card's figure, as the plan words it (5.5). */
export const scoreFigure = (s: ScoreReport): string | null =>
  s.shown === null ? null : fill(s.isMinimum ? t.atLeast : t.about, { n: s.shown });

/**
 * The Nutrient mix: a figure only when the data supports it, always with its parts one tap away, never a grade (plan 5.5).
 * When it is withheld the card says why in a sentence. It never appears for a person with no personal targets, or with
 * numbers hidden: there it is not an incomplete score, it is not a thing.
 */
export function ScoreCard({ report, onOpen }: { report: WeeklyReport; onOpen: () => void }) {
  const s = report.score;
  // Switched off by the deployment: not a withheld score, no score at all.
  if (s.withheld === 'off') return null;
  const figure = scoreFigure(s);
  const scores = report.history.map(h => h.score);
  const hasHistory = scores.some(v => v !== null);
  const trend = report.scoreTrend
    ? { higher: t.higher, lower: t.lower, about_the_same: t.same }[report.scoreTrend]
    : null;
  const summary = [t.title, figure ?? t.withheld[s.withheld ?? 'few_days']].join(', ');

  return (
    <Card padding="xl" onPress={onOpen} accessibilityLabel={summary} testID="score-card">
      <View style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="small" tone="muted">
              {t.title}
            </Text>
            {figure ? (
              <Text variant="title1" tabular testID="score-figure">
                {figure}
              </Text>
            ) : (
              <Text variant="body" tone="secondary" testID="score-withheld">
                {t.withheld[s.withheld ?? 'few_days']}
              </Text>
            )}
          </View>
          <Icon as={ChevronRight} size="sm" tone="faint" />
        </View>
        {hasHistory ? <Sparkline values={scores} accessibilityLabel={sparklineSummary(t.history, scores)} /> : null}
        <Text variant="caption" tone="muted">
          {[figure ? fill(t.basedOn, { n: report.coverage.assessedDays }) : null, trend].filter(Boolean).join(' · ') ||
            t.explain}
        </Text>
        <Text variant="caption" tone="muted" testID="score-disclaimer">
          {t.disclaimer}
        </Text>
      </View>
    </Card>
  );
}
