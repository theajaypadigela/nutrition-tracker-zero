import React from 'react';
import { View } from 'react-native';
import type { DayReport, WeeklyReport } from '@/api/types';
import { Card, Text } from '@/components/kit';
import { fill } from '@/i18n/fill';
import { strings } from '@/i18n/strings';
import { space } from '@/theme';
import { fullDayLabel } from '@/utils/dates';
import { DayChart } from './DayChart';

const t = strings.report.energy;

/** The days a bar is drawn for: those with something counted, not the one still in progress. */
const SHOWN: DayReport['state'][] = ['valid', 'confirmed', 'partial'];

/**
 * Energy for the week (plan 5.2): what was logged against the person's target, as a range, with each day's bar. Energy
 * has no verdict colour: below or above a target is described in neutral words, and "logs usually run low" says why.
 * It is not shown in low-pressure mode, and only against a target the person owns.
 */
export function EnergyCard({
  energy,
  days,
  careTeam,
}: {
  energy: NonNullable<WeeklyReport['energy']>;
  days: DayReport[];
  /** The target is the number a care team gave: no range, and no "logs usually run low". */
  careTeam: boolean;
}) {
  const range = !careTeam && energy.low !== energy.high;
  const heading = range
    ? fill(t.aboutRange, { target: energy.target, low: energy.low, high: energy.high })
    : fill(t.exact, { target: energy.target });
  const values = days.map(d => (SHOWN.includes(d.state) ? d.kcal : null));
  const summary = `${t.title}: ${days
    .map(
      d =>
        `${fullDayLabel(d.date).split(',')[0]} ${d.kcal !== null && SHOWN.includes(d.state) ? `${d.kcal} kcal` : 'no figure'}`,
    )
    .join(', ')}. ${fill(t.chart, { target: energy.target })}`;

  return (
    <Card padding="xl" testID="energy-card">
      <View style={{ gap: space.md }}>
        <View style={{ gap: space.xs }}>
          <Text variant="small" tone="muted">
            {t.title}
          </Text>
          <Text variant="title3" tabular>
            {heading}
          </Text>
        </View>
        <Text variant="body" tabular>
          {energy.meanKcal === null ? t.none : fill(t.logged, { mean: Math.round(energy.meanKcal / 10) * 10 })}
        </Text>
        <DayChart
          bare
          values={values}
          dailyGoal={energy.target}
          unit="kcal"
          tone="muted"
          referenceLabel={t.target}
          summary={summary}
        />
        {energy.assessedDays > 0 ? (
          <Text variant="small" tone="secondary" tabular>
            {fill(t.band, { target: energy.target, k: energy.daysInBand, n: energy.assessedDays })}
          </Text>
        ) : null}
        <Text variant="caption" tone="muted">
          {careTeam ? t.careTeam : t.logsLow}
        </Text>
      </View>
    </Card>
  );
}
