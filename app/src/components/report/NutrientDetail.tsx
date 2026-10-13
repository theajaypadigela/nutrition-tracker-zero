import React from 'react';
import { View } from 'react-native';
import { Plus } from 'lucide-react-native';
import type { HistoryWeek, Mode, NutrientReport } from '@/api/types';
import { Button, Card, Notice, Text, type NoticeTone } from '@/components/kit';
import { StackScreen } from '@/components/layout/StackScreen';
import { fill } from '@/i18n/fill';
import { strings } from '@/i18n/strings';
import { createStyles, space } from '@/theme';
import { assessmentBarTone, fmtNum, kindHint, nutrientSentence, weekDayLabels } from '@/utils/report';
import { DayChart } from './DayChart';
import { Sparkline, sparklineSummary } from './Sparkline';
import { TopSources } from './TopSources';

const t = strings.report.detail;

const noticeToneOf = (a: NutrientReport['assessment']): NoticeTone => {
  switch (a) {
    case 'meets':
    case 'in_range':
      return 'success';
    case 'below':
    case 'over':
    case 'well_over':
      return 'warning';
    default:
      return 'info';
  }
};

const useStyles = createStyles(() => ({
  hero: { gap: space.xs },
  value: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  stat: { flexBasis: '47%', flexGrow: 1, gap: 2 },
}));

/**
 * One nutrient for its window (plan 5.2): the average per logged day, one sentence in neutral words, the days, and where it
 * came from. Every number is traceable: the target says how it was worked out and which kind of source it rests on, and the
 * data line says how much of what was logged had a value.
 */
export function NutrientDetail({
  report,
  name,
  unit,
  mode,
  window,
  history,
  onBack,
  onSetGoal,
  onHowWeCalculate,
}: {
  report: NutrientReport;
  name: string;
  unit: string;
  mode: Mode;
  window: 'week' | 'four_weeks';
  /** Eight weeks of history: energy and protein carry a share of the target. */
  history?: HistoryWeek[];
  onBack: () => void;
  onSetGoal: () => void;
  onHowWeCalculate: () => void;
}) {
  const styles = useStyles();
  const labels = weekDayLabels();
  const target = report.target;
  const mean = report.meanPerAssessedDay;
  const known = report.dayValues.flatMap((v, i) => (v === null ? [] : [{ v, i }]));
  const high = known.reduce<{ v: number; i: number } | null>(
    (best, k) => (best === null || k.v > best.v ? k : best),
    null,
  );
  const low = known.reduce<{ v: number; i: number } | null>(
    (best, k) => (best === null || k.v < best.v ? k : best),
    null,
  );
  const targetTitle = !target
    ? t.reference
    : target.origin === 'care_team'
      ? t.careTeam
      : target.origin === 'custom'
        ? t.yourTarget
        : mode === 'personalised'
          ? t.recommended
          : t.reference;
  const share =
    report.nutrient === 'calories'
      ? history?.map(h => h.energyPct)
      : report.nutrient === 'protein'
        ? history?.map(h => h.proteinPct)
        : undefined;
  const dayCount = report.assessedDays;

  const stats: { label: string; value: string; sub?: string }[] = [
    {
      label: t.average,
      value: mean === null ? '—' : fmtNum(mean, unit),
      sub: `${report.isLowerBound && mean !== null ? 'at least, ' : ''}${dayCount === 1 ? t.basedOnOne : fill(t.basedOn, { n: dayCount })}`,
    },
    {
      label: targetTitle,
      value: target ? fmtNum(target.value, target.unit) : '—',
      sub: kindHint(target?.kind ?? 'amount'),
    },
    { label: t.highest, value: high ? fmtNum(high.v, unit) : '—', sub: high ? labels[high.i] : undefined },
    { label: t.lowest, value: low ? fmtNum(low.v, unit) : '—', sub: low ? labels[low.i] : undefined },
  ];
  const coveragePct = Math.round(report.dataCoverage * 100);

  return (
    <StackScreen
      title={name}
      subtitle={window === 'four_weeks' ? t.subtitleFour : t.subtitleWeek}
      onBack={onBack}
      right={
        <Button
          label={target ? t.setTarget : t.setReference}
          icon={Plus}
          variant="soft"
          size="sm"
          onPress={onSetGoal}
        />
      }
    >
      <View style={styles.hero}>
        <Text variant="small" tone="muted">
          {report.isLowerBound && mean !== null ? t.averageLeast : t.average}
        </Text>
        <View style={styles.value}>
          <Text variant="display" tabular>
            {mean === null ? '—' : fmtNum(mean)}
          </Text>
          <Text variant="title3" tone="muted">
            {unit}
          </Text>
        </View>
      </View>

      <Notice tone={noticeToneOf(report.assessment)} testID="detail-sentence">
        {nutrientSentence({ name, report, mode, window })}
      </Notice>

      <View style={{ gap: space.xs }}>
        <Text variant="smallStrong" tone="muted">
          {t.daily}
        </Text>
        <DayChart
          values={report.dayValues}
          dailyGoal={target?.value ?? 0}
          unit={unit}
          tone={assessmentBarTone(report.assessment)}
          referenceLabel={target && mode === 'personalised' ? 'Target' : 'Reference'}
        />
      </View>

      <View style={styles.grid}>
        {stats.map(s => (
          <Card key={s.label} style={styles.stat}>
            <Text variant="caption" tone="muted">
              {s.label}
            </Text>
            <Text variant="title3" tabular style={{ marginTop: space.xs }}>
              {s.value}
            </Text>
            {s.sub ? (
              <Text variant="caption" tone="muted">
                {s.sub}
              </Text>
            ) : null}
          </Card>
        ))}
      </View>

      {target &&
      (target.kind === 'minimum' || target.kind === 'limit') &&
      report.assessedDays > 0 &&
      window === 'week' ? (
        <Text variant="body" tabular>
          {fill(target.kind === 'limit' ? t.daysWithin : t.daysMet, { k: report.daysMeeting, n: report.assessedDays })}
        </Text>
      ) : null}

      {window === 'week' ? <TopSources sources={report.topSources} /> : null}

      {target ? (
        <Card>
          <Text variant="smallStrong" tone="muted">
            {t.how}
          </Text>
          <Text variant="body" style={{ marginTop: space.xs }}>
            {target.how}
          </Text>
          <Text variant="caption" tone="muted" style={{ marginTop: space.sm }}>
            {`${target.evidence}: ${strings.health.targets.evidence[target.evidence]}`}
          </Text>
          <View style={{ marginTop: space.md, alignSelf: 'flex-start' }}>
            <Button label={strings.disclaimer.howWeCalculate} variant="soft" size="sm" onPress={onHowWeCalculate} />
          </View>
        </Card>
      ) : null}

      <View style={{ gap: space.xs }}>
        <Text variant="smallStrong" tone="muted">
          {t.data}
        </Text>
        <Text variant="body" testID="detail-data">
          {coveragePct >= 100 && !report.isLowerBound ? t.dataAll : fill(t.dataSome, { pct: coveragePct })}
        </Text>
      </View>

      {report.trend ? (
        <View style={{ gap: space.xs }} testID="detail-trend">
          <Text variant="smallStrong" tone="muted">
            {t.compared}
          </Text>
          <Text variant="body" tabular>
            {fill({ higher: t.trendHigher, lower: t.trendLower, about_the_same: t.trendSame }[report.trend.direction], {
              weeks: report.trend.weeks,
              previous: fmtNum(report.trend.previousMean, unit),
            })}
          </Text>
        </View>
      ) : null}

      {share && share.some(v => v !== null) ? (
        <View style={{ gap: space.xs }}>
          <Text variant="smallStrong" tone="muted">
            {t.history}
          </Text>
          <Sparkline values={share} reference={100} accessibilityLabel={sparklineSummary(t.history, share, '%')} />
        </View>
      ) : null}

      <Text variant="caption" tone="muted">
        {strings.disclaimer.footer}
      </Text>
    </StackScreen>
  );
}
