import React from 'react';
import { Pressable, View } from 'react-native';
import type { Mode, NutrientReport } from '@/api/types';
import { Badge, ProgressBar, Text } from '@/components/kit';
import { fill } from '@/i18n/fill';
import { strings } from '@/i18n/strings';
import { createStyles, space, useTheme } from '@/theme';
import { assessmentBarTone, assessmentLabel, assessmentTone, fmtNum, targetPhrase } from '@/utils/report';

const t = strings.report;

/** The bar's full width is 130% of the target, so the target tick sits at 100/130. */
const TICK = 100 / 130;

const useStyles = createStyles(() => ({
  row: { gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.lg },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.md },
  left: { flex: 1, minWidth: 0, gap: space.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  right: { alignItems: 'flex-end', gap: 2, flexShrink: 0, maxWidth: '55%' },
}));

/** What the row says about one nutrient, as plain strings: the same words drive the row and its screen-reader label. */
export function lineView(args: {
  report: NutrientReport;
  unit: string;
  mode: Mode;
  judged: boolean;
  valueMode?: 'absolute' | 'percent';
}) {
  const { report: n, unit, mode, judged, valueMode = 'absolute' } = args;
  const target = n.target;
  const mean = n.meanPerAssessedDay;
  const ratio = target && target.value > 0 && mean !== null ? mean / target.value : null;
  const showVerdict = judged && n.assessment !== 'amount_only';
  const least = n.isLowerBound && mean !== null;
  const value =
    mean === null
      ? t.line.noFigure
      : valueMode === 'percent' && ratio !== null
        ? `${least ? 'at least ' : ''}${fill(t.line.percent, { pct: Math.round(ratio * 100) })}`
        : least
          ? fill(t.line.atLeast, { value: fmtNum(mean, unit) })
          : fmtNum(mean, unit);
  const targetText = target ? targetPhrase(target, mode) : null;
  const unitNote =
    mean === null
      ? ''
      : valueMode === 'percent'
        ? targetText
          ? `of ${targetText}`
          : ''
        : `${t.line.perDay}${targetText ? ` · ${targetText}` : ` · ${t.line.noReference}`}`;
  const label = showVerdict
    ? assessmentLabel({ assessment: n.assessment, target, dataCoverage: n.dataCoverage, mean })
    : null;

  // The line under the bar: the share, how many days, and why a figure is soft.
  const bits: string[] = [];
  if (showVerdict && n.assessment === 'unknown' && n.assessedDays > 0) {
    bits.push(
      n.dataCoverage < 0.5 ? fill(t.line.notEnough, { pct: Math.round(n.dataCoverage * 100) }) : t.line.partial,
    );
  } else {
    if (valueMode === 'absolute' && ratio !== null && target?.kind !== 'energy')
      bits.push(`${least ? 'at least ' : ''}${fill(t.line.percent, { pct: Math.round(ratio * 100) })}`);
    if (
      judged &&
      target &&
      (target.kind === 'minimum' || target.kind === 'limit') &&
      n.assessedDays > 0 &&
      n.assessment !== 'unknown'
    ) {
      bits.push(
        fill(target.kind === 'limit' ? t.line.daysWithin : t.line.daysMet, { k: n.daysMeeting, n: n.assessedDays }),
      );
    }
    if (n.isLowerBound && mean !== null && n.assessment !== 'unknown') bits.push(t.line.partial);
  }
  return { value, unitNote, label, showVerdict, ratio, detail: bits.join(' · '), target };
}

/**
 * "target 2,600 mg" kept on one line: a narrow screen or a large font breaks the line before it, never between a number and its
 * unit. Only a phrase that ends in a number and a unit is touched.
 */
export const keepTargetTogether = (s: string): string => s.replace(/ (\S+) (\d[\d.,]*) (\S+)$/, ' $1\u00A0$2\u00A0$3');

/**
 * One nutrient in a list: the average per logged day against its target, how that reads in neutral words, the days it was met,
 * and a bar with a tick at the target. A figure some foods have no value for reads "at least", because it can only be higher
 * (plan 7.1). With too few days no verdict is drawn at all ("Logged so far").
 */
export function NutrientLine({
  report,
  name,
  unit,
  mode,
  judged,
  valueMode = 'absolute',
  note,
  onPress,
}: {
  report: NutrientReport;
  name: string;
  unit: string;
  mode: Mode;
  /** False when the window has too few days for any verdict. */
  judged: boolean;
  valueMode?: 'absolute' | 'percent';
  /** A line of context under the row, such as what total sugars include. */
  note?: string;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const v = lineView({ report, unit, mode, judged, valueMode });
  const label = `${fill(t.line.a11y, { name, value: v.value })}${v.label ? `, ${v.label}` : ''}`;
  const body = (
    <>
      <View style={styles.top}>
        <View style={styles.left}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {name}
          </Text>
          <View style={styles.meta}>
            {v.label ? <Badge label={v.label} tone={assessmentTone[report.assessment]} /> : null}
            {!judged && report.meanPerAssessedDay !== null && report.assessment !== 'amount_only' ? (
              <Text variant="caption" tone="muted">
                {t.line.loggedSoFar}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.right}>
          <Text variant="bodyStrong" tabular>
            {v.value}
          </Text>
          {v.unitNote ? (
            <Text variant="caption" tone="muted" tabular align="right">
              {keepTargetTogether(v.unitNote)}
            </Text>
          ) : null}
        </View>
      </View>
      {v.ratio !== null ? (
        <ProgressBar
          value={Math.min(v.ratio, 1.3) / 1.3}
          tone={v.showVerdict ? assessmentBarTone(report.assessment) : 'muted'}
          marker={report.target?.kind === 'range' ? undefined : TICK}
        />
      ) : null}
      {v.detail ? (
        <Text variant="caption" tone="muted" tabular>
          {v.detail}
        </Text>
      ) : null}
      {note ? (
        <Text variant="caption" tone="muted">
          {note}
        </Text>
      ) : null}
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.row} accessible accessibilityLabel={label}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: colors.ripple }}
      style={styles.row}
    >
      {body}
    </Pressable>
  );
}
