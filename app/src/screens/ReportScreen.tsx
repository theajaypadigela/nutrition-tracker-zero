import React, { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { BarChart3, Target } from 'lucide-react-native';
import type { NutrientReport } from '@/api/types';
import { Button, Card, FormGroup, ListGroup, ListRow, LoadingState, Notice, SectionHeader, Text } from '@/components/kit';
import { HealthCard } from '@/components/health/HealthCard';
import { TabScreen } from '@/components/layout/TabScreen';
import { CoverageCard } from '@/components/report/CoverageCard';
import { EnergyCard } from '@/components/report/EnergyCard';
import { FourWeekCard } from '@/components/report/FourWeekCard';
import { InsightCard } from '@/components/report/InsightCard';
import { PeriodPicker } from '@/components/report/PeriodPicker';
import { RangeIntakeCard } from '@/components/report/RangeIntakeCard';
import { IntakeCard } from '@/components/report/IntakeCard';
import { NutrientLine } from '@/components/report/NutrientLine';
import { QualityCard } from '@/components/report/QualityCard';
import { ScoreBreakdown } from '@/components/report/ScoreBreakdown';
import { ScoreCard } from '@/components/report/ScoreCard';
import { CalibrationCard } from '@/components/weight/CalibrationCard';
import { WeighInSheet, targetChangeLines, type WeighInResult } from '@/components/weight/WeighInSheet';
import { WeightCard } from '@/components/weight/WeightCard';
import { useHealthCard } from '@/hooks/useHealthCard';
import { useToday } from '@/hooks/useToday';
import { useRangeReport } from '@/hooks/useRangeReport';
import { useWeeklyReport } from '@/hooks/useWeeklyReport';
import { useWeightPrompt } from '@/hooks/useWeightPrompt';
import { strings } from '@/i18n/strings';
import { useHealth } from '@/state/HealthContext';
import { useMeta } from '@/state/MetaContext';
import { space } from '@/theme';
import { addDays, weekStart } from '@/utils/dates';
import { insightAction, insightText, visibleInsights } from '@/utils/insights';
import { rangeLabel, reportBounds, type ReportPeriod } from '@/utils/reportRange';
import { isJudged, nutrientInfo, weekEyebrow, weekRangeLabel } from '@/utils/report';

const t = strings.report;

/**
 * This week from the Worker (plan 5.2), useful things first: how many days count and how sure the figures are, what was logged
 * per day with earlier weeks alongside, up to three things that stood out, energy against the person's own target, the rows
 * that matter for their goal, the vitamins over four weeks, and what is missing or uncertain. The Nutrient mix comes last, and
 * only where the deployment shows one (`NUTRIENT_SCORE`) and the data supports it. Every verdict is decided by the Worker; this
 * screen only lays it out. Four states replace content and never decorate it: not enough data, general reference, no personal
 * targets, and numbers hidden.
 */
export default function ReportScreen() {
  const navigation = useNavigation();
  const meta = useMeta();
  const healthCard = useHealthCard();
  const health = useHealth();
  const weightPrompt = useWeightPrompt();
  const today = useToday();
  const [period, setPeriod] = useState<ReportPeriod>('week');
  const [selectedDate, setAnchor] = useState<string | null>(null);
  const anchor = selectedDate ?? today;
  const [custom, setCustom] = useState({ from: weekStart(today), to: today });
  const weekIdx = Math.round((Date.parse(`${weekStart(anchor)}T00:00:00Z`) - Date.parse(`${weekStart(today)}T00:00:00Z`)) / (7 * 86400000));
  const setWeekIdx = (update: (value: number) => number) => setAnchor(addDays(weekStart(today), update(weekIdx) * 7));
  const bounds = reportBounds(period, anchor, custom);
  const intakeRange = useRangeReport(bounds.from, bounds.to);
  const [weighIn, setWeighIn] = useState(false);
  const [weighNote, setWeighNote] = useState<string[] | null>(null);
  const start = addDays(weekStart(today), weekIdx * 7);
  const range = useWeeklyReport(start, period === 'week');
  const [scoreOpen, setScoreOpen] = useState(false);
  useFocusEffect(
    useCallback(() => {
      intakeRange.reload();
      if (period === 'week') range.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [start, period, bounds.from, bounds.to]),
  );

  const report = range.report;
  const hidden = health.numbersHidden || report?.display.numbersHidden === true;
  const byKey = useMemo(() => Object.fromEntries((report?.nutrients ?? []).map(n => [n.nutrient, n])), [report]);
  const judged = !!report && isJudged(report.coverage.confidence);

  const insights = useMemo(
    () =>
      visibleInsights(report?.insights ?? []).flatMap(i => {
        const text = insightText(i, {
          nutrients: meta.nutrients,
          numbersHidden: hidden,
        });
        return text ? [{ insight: i, text }] : [];
      }),
    [report, meta.nutrients, hidden],
  );

  const openNutrient = (key: string, window: 'week' | 'four_weeks' = 'week') => navigation.navigate('Nutrient', { key, start, window });
  const openPending = () => navigation.navigate('Main', { screen: 'Uncached' });
  const openDay = (date: string) => navigation.navigate('Main', { screen: 'Today', params: { date } });

  // The rows that lead: the goal's rows, then the minerals furthest below their reference. Energy has its own card.
  const lead = (report?.lead ?? []).filter(k => k !== 'calories').flatMap(k => (byKey[k] ? [byKey[k] as NutrientReport] : []));
  const minimums = lead.filter(n => n.target?.kind === 'minimum');
  const limits = lead.filter(n => n.target?.kind === 'limit');
  const amounts = [...lead.filter(n => !n.target || (n.target.kind !== 'minimum' && n.target.kind !== 'limit'))];
  const sugar = byKey.sugar as NutrientReport | undefined;
  if (sugar && !amounts.includes(sugar) && !sugar.target) amounts.push(sugar);

  const line = (n: NutrientReport, key = n.nutrient) => {
    const info = nutrientInfo(meta.nutrients, n.nutrient);
    return (
      <NutrientLine
        key={key}
        report={n}
        name={info.label}
        unit={info.unit}
        mode={report!.mode}
        judged={judged}
        note={n.nutrient === 'sugar' ? t.groups.sugarNote : undefined}
        onPress={() => openNutrient(n.nutrient)}
      />
    );
  };

  // A weigh-in is saved; if it moved the weight enough to make new targets, say what changed and why, never silently (plan 6.2).
  const weighedIn = async (r: WeighInResult) => {
    const before = health.targetSet;
    setWeighIn(false);
    setWeighNote(r.changed ? [strings.report.weighIn.changed, ...targetChangeLines(before, r.targetSet)] : [strings.report.weighIn.saved]);
    await health.refresh();
    range.reload();
  };

  const careTeamEnergy = !!report?.energy && byKey.calories?.target?.origin === 'care_team';
  // The score is the last thing on the page, and not there at all where the deployment leaves it out (NUTRIENT_SCORE).
  const showScore = !!report && report.mode === 'personalised' && !hidden && report.score.withheld !== 'off';
  const anyTarget = lead.some(n => n.target);
  const targetsRoute = report && !hidden && report.mode === 'personalised';

  return (
    <TabScreen
      title={t.title}
      subtitle={period === 'week' ? `${weekEyebrow(weekIdx)} · ${weekRangeLabel(start)}` : rangeLabel(bounds.from, bounds.to)}
      refreshing={intakeRange.loading || (period === 'week' && range.refreshing)}
      onRefresh={() => {
        intakeRange.reload();
        if (period === 'week') range.reload();
      }}
    >
      <PeriodPicker
        period={period}
        onPeriod={setPeriod}
        anchor={anchor}
        onAnchor={setAnchor}
        custom={custom}
        onCustom={setCustom}
        today={today}
      />
      {intakeRange.error ? (
        <Notice tone="danger" action={{ label: t.loadingRetry, onPress: intakeRange.reload }}>
          {intakeRange.error}
        </Notice>
      ) : null}
      {intakeRange.loading && !intakeRange.report ? <LoadingState label={t.periods.loading} /> : null}
      {intakeRange.locked ? (
        <Notice
          tone="info"
          action={{
            label: t.unlock,
            onPress: () => navigation.navigate('Reauthenticate'),
          }}
        >
          {t.locked}
        </Notice>
      ) : null}
      {period === 'week' ? (
        <CoverageCard
          weekIdx={weekIdx}
          start={start}
          onPrevWeek={() => setWeekIdx(w => w - 1)}
          onNextWeek={() => setWeekIdx(w => Math.min(0, w + 1))}
          report={report ?? undefined}
          onOpenPending={openPending}
        />
      ) : null}
      {intakeRange.report && !hidden && !intakeRange.hidden ? (
        <RangeIntakeCard
          key={`${bounds.from}-${bounds.to}`}
          report={intakeRange.report}
          nutrients={meta.nutrients}
          onOpenNutrient={key =>
            navigation.navigate('NutrientBreakdown', { nutrient: key, from: intakeRange.report!.range.from, to: intakeRange.report!.range.to, origin: 'report' })
          }
        />
      ) : null}
      {period !== 'week' && (hidden || intakeRange.hidden) ? <Notice tone="info">{strings.lowPressure.nothing}</Notice> : null}
      {period === 'week' ? (
        <>
          {range.error ? <Notice tone="danger">{range.error}</Notice> : null}

          {/* A locked report needs password login to restore access to saved personal targets. */}
          {healthCard.visible && !range.locked ? (
            <HealthCard onStart={() => navigation.navigate('HealthIntro')} onDismiss={healthCard.dismiss} />
          ) : null}

          {weightPrompt.visible ? (
            <Card padding="xl" testID="weight-prompt">
              <View style={{ gap: space.md }}>
                <Text variant="title3">{strings.report.weighPrompt.title}</Text>
                <Text variant="small" tone="secondary">
                  {strings.report.weighPrompt.body}
                </Text>
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <Button
                    testID="weight-prompt-update"
                    label={strings.report.weighPrompt.action}
                    variant="soft"
                    onPress={() => setWeighIn(true)}
                  />
                  <Button
                    testID="weight-prompt-dismiss"
                    label={strings.report.weighPrompt.dismiss}
                    variant="ghost"
                    onPress={weightPrompt.dismiss}
                  />
                </View>
              </View>
            </Card>
          ) : null}

          {weighNote ? (
            <Notice tone="success" onDismiss={() => setWeighNote(null)} testID="weigh-note">
              {weighNote.join(' ')}
            </Notice>
          ) : null}

          {range.locked ? (
            <Notice
              tone="info"
              action={{
                label: t.unlock,
                onPress: () => navigation.navigate('Reauthenticate'),
              }}
              testID="report-locked"
            >
              {t.locked}
            </Notice>
          ) : null}

          {range.loading ? <LoadingState label={t.loading} /> : null}

          {report ? (
            <>
              {!hidden ? <IntakeCard report={report} nutrients={meta.nutrients} /> : null}

              <View style={{ gap: space.md }}>
                <SectionHeader title={t.stoodOut} />
                {insights.length > 0 ? (
                  insights.map(({ insight, text }, i) => {
                    const action = insightAction(insight);
                    return (
                      <InsightCard
                        key={`${insight.id}-${insight.nutrient ?? i}`}
                        text={text}
                        priority={insight.priority}
                        testID={`insight-${insight.id}`}
                        action={
                          action
                            ? {
                                label: action.label,
                                onPress:
                                  action.target === 'pending'
                                    ? openPending
                                    : action.target === 'day'
                                      ? () => openDay(action.date)
                                      : () => openNutrient(action.key, action.window),
                              }
                            : null
                        }
                      />
                    );
                  })
                ) : (
                  <Text variant="body" tone="secondary" testID="nothing-stood-out">
                    {hidden ? strings.lowPressure.nothing : t.nothingStoodOut}
                  </Text>
                )}
              </View>

              {report.energy ? <EnergyCard energy={report.energy} days={report.coverage.days} careTeam={careTeamEnergy} /> : null}

              {!hidden && lead.length > 0 ? (
                <>
                  {report.mode === 'generic' ? (
                    <Text variant="caption" tone="muted" testID="reference-note">
                      {strings.disclaimer.referenceLong}
                    </Text>
                  ) : null}
                  {report.mode === 'reference_only' ? (
                    <Text variant="caption" tone="muted" testID="reference-only-note">
                      {t.referenceOnly} {anyTarget ? t.referenceOnlyCareTeam : ''}
                    </Text>
                  ) : null}

                  {minimums.length > 0 ? (
                    <View style={{ gap: space.md }}>
                      <SectionHeader
                        title={t.groups.getEnough}
                        right={
                          <Text variant="small" tone="muted">
                            {t.groups.getEnoughHint}
                          </Text>
                        }
                      />
                      <ListGroup>{minimums.map(n => line(n))}</ListGroup>
                    </View>
                  ) : null}
                  {limits.length > 0 ? (
                    <View style={{ gap: space.md }}>
                      <SectionHeader title={t.groups.keepInCheck} />
                      <ListGroup>{limits.map(n => line(n))}</ListGroup>
                    </View>
                  ) : null}
                  {amounts.length > 0 ? (
                    <View style={{ gap: space.md }}>
                      <SectionHeader title={t.groups.amountsOnly} />
                      <ListGroup>{amounts.map(n => line(n))}</ListGroup>
                    </View>
                  ) : null}
                </>
              ) : null}

              {!hidden && report.mode !== 'reference_only' && report.fourWeek.some(n => n.target) ? (
                <FourWeekCard
                  items={report.fourWeek}
                  nutrients={meta.nutrients}
                  mode={report.mode}
                  onOpen={key => openNutrient(key, 'four_weeks')}
                />
              ) : null}

              {report.quality && !hidden ? (
                <QualityCard
                  quality={report.quality}
                  assessedDays={report.coverage.assessedDays}
                  nutrients={meta.nutrients}
                  onOpenGaps={openPending}
                  onOpenDay={openDay}
                />
              ) : null}

              {report.mode === 'personalised' && !hidden ? (
                <WeightCard weight={report.weight} isCurrent={report.week.isCurrent} onAdd={() => setWeighIn(true)} />
              ) : null}
              {report.calibration && !hidden ? <CalibrationCard calibration={report.calibration} /> : null}

              {showScore ? <ScoreCard report={report} onOpen={() => setScoreOpen(true)} /> : null}
            </>
          ) : null}

          {report || range.locked ? (
            <FormGroup>
              <ListGroup>
                {report && !hidden ? (
                  <ListRow
                    icon={BarChart3}
                    title={t.all.link}
                    subtitle={t.all.linkHint}
                    onPress={() => navigation.navigate('WeeklySummary', { start })}
                  />
                ) : null}
                {targetsRoute || hidden ? (
                  <ListRow
                    icon={Target}
                    title={hidden ? strings.disclaimer.howWeCalculate : t.all.targetsLink}
                    subtitle={hidden ? undefined : t.all.targetsHint}
                    onPress={() => navigation.navigate('Targets')}
                  />
                ) : (
                  <ListRow icon={Target} title={t.all.goalsLink} subtitle={t.all.goalsHint} onPress={() => navigation.navigate('Goals')} />
                )}
              </ListGroup>
            </FormGroup>
          ) : null}
        </>
      ) : null}

      <Text variant="caption" tone="muted">
        {strings.disclaimer.footer} {t.all.note}
      </Text>

      {report && showScore ? <ScoreBreakdown report={report} visible={scoreOpen} onClose={() => setScoreOpen(false)} /> : null}
      {health.mode === 'personalised' && !health.numbersHidden ? (
        <WeighInSheet visible={weighIn} onClose={() => setWeighIn(false)} onSaved={weighedIn} />
      ) : null}
    </TabScreen>
  );
}
