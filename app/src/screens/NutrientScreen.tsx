import React, { useCallback } from 'react';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { EmptyState, LoadingState, Notice } from '@/components/kit';
import { StackScreen } from '@/components/layout/StackScreen';
import { NutrientDetail } from '@/components/report/NutrientDetail';
import { useWeeklyReport } from '@/hooks/useWeeklyReport';
import { strings } from '@/i18n/strings';
import { useMeta } from '@/state/MetaContext';
import type { RootStackParamList } from '@/navigation/types';
import { addDays } from '@/utils/dates';
import { nutrientInfo } from '@/utils/report';

/**
 * One nutrient for the week it was opened from: reloaded on focus, so a target typed on the Goals screen shows here on the way
 * back. The detail lives on its own screen so the Report tab and "All nutrients" both open it and both come back to where they were.
 */
export default function NutrientScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Nutrient'>>();
  const meta = useMeta();
  const range = useWeeklyReport(params.start);
  useFocusEffect(
    useCallback(() => {
      range.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params.start]),
  );

  const report = range.report;
  const window = params.window ?? 'week';
  const found = report
    ? (window === 'four_weeks' ? report.fourWeek : report.nutrients).find(n => n.nutrient === params.key)
    : undefined;
  const info = nutrientInfo(meta.nutrients, params.key);

  if (report && found) {
    return (
      <NutrientDetail
        report={found}
        name={info.label}
        unit={info.unit}
        mode={report.mode}
        window={window}
        history={report.history}
        onBack={() => navigation.goBack()}
        onSetGoal={() => navigation.navigate('Goals')}
        onHowWeCalculate={() => navigation.navigate('Targets')}
        // The week it was opened from, or for a vitamin the four weeks that end with it (the window that judges it).
        onOpenBreakdown={() =>
          navigation.navigate('NutrientBreakdown', {
            nutrient: params.key,
            from: window === 'four_weeks' ? addDays(params.start, 6 - 27) : params.start,
            to: addDays(params.start, 6),
            origin: 'report',
          })
        }
      />
    );
  }
  return (
    <StackScreen
      title={info.label}
      subtitle={window === 'four_weeks' ? strings.report.detail.subtitleFour : strings.report.detail.subtitleWeek}
    >
      {range.error ? <Notice tone="danger">{range.error}</Notice> : null}
      {range.locked ? <Notice tone="info">{strings.report.locked}</Notice> : null}
      {range.loading ? <LoadingState /> : null}
      {report && !found ? <EmptyState title={strings.report.all.noMatches} /> : null}
    </StackScreen>
  );
}
