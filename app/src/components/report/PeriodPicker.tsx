import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Button, Card, Chip, IconButton, Notice, Text } from '@/components/kit';
import { strings } from '@/i18n/strings';
import { space, useTheme } from '@/theme';
import { rangeLabel, reportBounds, shiftReport, type ReportPeriod } from '@/utils/reportRange';

const t = strings.report.periods;
const periods: ReportPeriod[] = ['day', 'week', 'month', 'year', 'custom'];
const localDate = (iso: string) => new Date(`${iso}T12:00:00`);
const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function PeriodPicker({ period, onPeriod, anchor, onAnchor, custom, onCustom, today }: {
  period: ReportPeriod; onPeriod: (period: ReportPeriod) => void;
  anchor: string; onAnchor: (date: string) => void;
  custom: { from: string; to: string }; onCustom: (range: { from: string; to: string }) => void;
  today: string;
}) {
  const { isDark, colors } = useTheme();
  const [draft, setDraft] = useState(custom);
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);
  const [invalid, setInvalid] = useState(false);
  const bounds = reportBounds(period, anchor, custom);
  const next = shiftReport(period, anchor, 1);
  return (
    <Card padding="xl">
      <View style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {periods.map(p => <Chip key={p} label={t[p]} selected={period === p} testID={`report-period-${p}`} onPress={() => {
            setPicker(null);
            setInvalid(false);
            if (p === 'custom') setDraft(custom);
            onPeriod(p);
          }} />)}
        </View>
        {period !== 'custom' && period !== 'week' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <IconButton icon={ChevronLeft} accessibilityLabel={t.previous} variant="outline" onPress={() => onAnchor(shiftReport(period, anchor, -1))} />
            <Text variant="bodyStrong" style={{ flex: 1, textAlign: 'center' }}>{rangeLabel(bounds.from, bounds.to)}</Text>
            <IconButton icon={ChevronRight} accessibilityLabel={t.next} variant="outline" disabled={next > today} onPress={() => onAnchor(next)} />
          </View>
        ) : null}
        {period === 'custom' ? (
          <>
            <Button variant="secondary" label={`${t.from}: ${rangeLabel(draft.from, draft.from)}`} testID="report-custom-from" onPress={() => setPicker('from')} />
            <Button variant="secondary" label={`${t.to}: ${rangeLabel(draft.to, draft.to)}`} testID="report-custom-to" onPress={() => setPicker('to')} />
            {picker ? (
              <>
                <DateTimePicker value={localDate(draft[picker])} maximumDate={localDate(today)} mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  themeVariant={isDark ? 'dark' : 'light'} textColor={colors.text}
                  onChange={(event, picked) => {
                    if (Platform.OS !== 'ios') setPicker(null);
                    if (event.type === 'set' && picked) { setDraft(d => ({ ...d, [picker]: isoDate(picked) })); setInvalid(false); }
                  }} />
                {Platform.OS === 'ios' ? <Button variant="ghost" label={t.done} onPress={() => setPicker(null)} /> : null}
              </>
            ) : null}
            {invalid ? <Notice tone="danger">{t.invalid}</Notice> : null}
            <Button label={t.apply} testID="report-custom-apply" onPress={() => {
              if (draft.from > draft.to || draft.from > today || draft.to > today) { setInvalid(true); return; }
              setPicker(null);
              setInvalid(false);
              onCustom(draft);
            }} />
          </>
        ) : null}
      </View>
    </Card>
  );
}
