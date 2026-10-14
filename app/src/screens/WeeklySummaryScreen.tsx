import React, { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { SearchX } from 'lucide-react-native';
import type { Assessment, NutrientInfo, NutrientReport } from '@/api/types';
import {
  Chip,
  EmptyState,
  ListGroup,
  LoadingState,
  Notice,
  SearchField,
  Segmented,
  SectionHeader,
  Text,
} from '@/components/kit';
import { StackScreen } from '@/components/layout/StackScreen';
import { CoverageCard } from '@/components/report/CoverageCard';
import { NutrientLine } from '@/components/report/NutrientLine';
import { useToday } from '@/hooks/useToday';
import { useWeeklyReport } from '@/hooks/useWeeklyReport';
import { fill } from '@/i18n/fill';
import { strings } from '@/i18n/strings';
import type { RootStackParamList } from '@/navigation/types';
import { useMeta } from '@/state/MetaContext';
import { space } from '@/theme';
import { addDays, weekStart } from '@/utils/dates';
import { isJudged, MIN_DAYS_FOR_SUMMARY, nutrientInfo } from '@/utils/report';

const t = strings.report.all;

type FilterValue = 'all' | 'on_target' | 'worth_a_look' | 'not_judged';
type Group = keyof typeof t.groups;

const FILTERS: { key: FilterValue; label: string }[] = [
  { key: 'all', label: t.filters.all },
  { key: 'on_target', label: t.filters.onTarget },
  { key: 'worth_a_look', label: t.filters.worthALook },
  { key: 'not_judged', label: t.filters.notJudged },
];

const FILTER_OF: Record<Assessment, FilterValue> = {
  meets: 'on_target',
  in_range: 'on_target',
  close: 'worth_a_look',
  below: 'worth_a_look',
  over: 'worth_a_look',
  well_over: 'worth_a_look',
  outside: 'worth_a_look',
  unknown: 'not_judged',
  amount_only: 'not_judged',
};

const GROUP_ORDER: Group[] = ['energy_and_macros', 'get_enough', 'keep_in_check', 'vitamins_and_minerals'];

/** The catalogue says where a nutrient sits; if it is silent (an offline fallback), the kind decides. */
function groupOf(info: NutrientInfo | undefined, report: NutrientReport): Group {
  if (info?.group) return info.group;
  const kind = info?.kind ?? report.target?.kind ?? 'amount';
  return kind === 'energy' || kind === 'range'
    ? 'energy_and_macros'
    : kind === 'limit' || kind === 'amount'
      ? 'keep_in_check'
      : 'get_enough';
}

/** Every nutrient for one Monday-first week: the days that count, search, filters. The detail of each opens on its own screen. */
export default function WeeklySummaryScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<RootStackParamList, 'WeeklySummary'>>();
  const meta = useMeta();
  const today = useToday();
  const thisWeek = weekStart(today);
  const [weekIdx, setWeekIdx] = useState(() =>
    params?.start ? Math.min(0, Math.round((Date.parse(params.start) - Date.parse(thisWeek)) / (7 * 86_400_000))) : 0,
  );
  const start = addDays(thisWeek, weekIdx * 7);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterValue>('all');
  const [valueMode, setValueMode] = useState<'absolute' | 'percent'>('absolute');
  const range = useWeeklyReport(start);
  useFocusEffect(
    useCallback(() => {
      range.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [start]),
  );

  const report = range.report;
  const judgedWeek = !!report && isJudged(report.coverage.confidence);

  // One row per nutrient: the four-week report stands in for a vitamin, because that is the window that judges it.
  const rows = useMemo(() => {
    if (!report) return [];
    const four = new Map(report.fourWeek.map(n => [n.nutrient, n]));
    return report.nutrients.map(n => {
      const f = four.get(n.nutrient);
      const row = f ?? n;
      const info = meta.nutrients.find(x => x.key === n.nutrient);
      const label = nutrientInfo(meta.nutrients, n.nutrient);
      return {
        key: n.nutrient,
        report: row,
        window: (f ? 'four_weeks' : 'week') as 'week' | 'four_weeks',
        name: label.label,
        unit: label.unit,
        group: groupOf(info, row),
        judged: f ? row.assessedDays >= MIN_DAYS_FOR_SUMMARY : judgedWeek,
      };
    });
  }, [report, meta.nutrients, judgedWeek]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(r => {
      const matchesQuery = q === '' || r.name.toLowerCase().includes(q);
      const matchesFilter =
        filter === 'all' || (r.judged ? FILTER_OF[r.report.assessment] === filter : filter === 'not_judged');
      return matchesQuery && matchesFilter;
    });
  }, [rows, query, filter]);

  const usesReference = report?.mode === 'generic' && rows.some(r => r.report.target);
  const hidden = report?.display.numbersHidden === true;

  return (
    <StackScreen
      title={t.title}
      subtitle={t.subtitle}
      refreshing={range.refreshing}
      onRefresh={range.reload}
      gap={space.lg}
    >
      {range.error ? <Notice tone="danger">{range.error}</Notice> : null}

      <CoverageCard
        weekIdx={weekIdx}
        start={start}
        onPrevWeek={() => setWeekIdx(w => w - 1)}
        onNextWeek={() => setWeekIdx(w => Math.min(0, w + 1))}
        report={report ?? undefined}
        onOpenPending={() => navigation.navigate('Main', { screen: 'Uncached' })}
      />

      {range.locked ? (
        <Notice
          tone="info"
          action={{ label: strings.report.unlock, onPress: () => navigation.navigate('Reauthenticate') }}
        >
          {strings.report.locked}
        </Notice>
      ) : null}

      {hidden ? (
        <EmptyState title={strings.lowPressure.reportTitle} body={strings.lowPressure.reportBody} />
      ) : (
        <>
          <SearchField value={query} onChangeText={setQuery} placeholder={t.search} />

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {FILTERS.map(f => (
              <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
            ))}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="small" tone="muted">
              {filtered.length === 1 ? t.countOne : fill(t.count, { n: filtered.length })}
            </Text>
            <View style={{ width: 168 }}>
              <Segmented
                options={[
                  { value: 'absolute', label: t.amount },
                  { value: 'percent', label: t.percent },
                ]}
                value={valueMode}
                onChange={setValueMode}
              />
            </View>
          </View>

          {range.loading ? (
            <LoadingState label={t.loading} />
          ) : filtered.length === 0 && report ? (
            <EmptyState icon={SearchX} title={t.noMatches} body={query ? t.tryAnother : t.emptyGroup} />
          ) : (
            GROUP_ORDER.map(g => {
              const inGroup = filtered.filter(r => r.group === g);
              if (inGroup.length === 0) return null;
              return (
                <View key={g} style={{ gap: space.md }}>
                  <SectionHeader title={t.groups[g]} />
                  <ListGroup>
                    {inGroup.map(r => (
                      <NutrientLine
                        key={r.key}
                        report={r.report}
                        name={r.name}
                        unit={r.unit}
                        mode={report!.mode}
                        judged={r.judged}
                        valueMode={valueMode}
                        note={r.key === 'sugar' ? strings.report.groups.sugarNote : undefined}
                        onPress={() => navigation.navigate('Nutrient', { key: r.key, start, window: r.window })}
                      />
                    ))}
                  </ListGroup>
                </View>
              );
            })
          )}
        </>
      )}

      {usesReference ? (
        <Text variant="caption" tone="muted" testID="reference-note">
          {strings.disclaimer.referenceLong}
        </Text>
      ) : null}
      <Text variant="caption" tone="muted">
        {strings.disclaimer.footer} {t.note}
      </Text>
    </StackScreen>
  );
}
