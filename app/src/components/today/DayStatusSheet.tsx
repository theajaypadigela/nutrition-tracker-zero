import React from 'react';
import { View } from 'react-native';
import { Check } from 'lucide-react-native';
import type { DayMark } from '@/api/types';
import { Button, Icon, ListGroup, ListRow, Sheet, Text } from '@/components/kit';
import { strings } from '@/i18n/strings';
import { space } from '@/theme';

const t = strings.day.sheet;

const OPTIONS: { value: DayMark; title: string; hint: string }[] = [
  { value: 'complete', title: t.complete, hint: t.completeHint },
  { value: 'partial', title: t.partial, hint: t.partialHint },
  { value: 'skip', title: t.skip, hint: t.skipHint },
];

/**
 * Say what a day is (plan 7.2): complete (it counts, even with little or nothing logged: a fast), incomplete (it does not count
 * until the missing food is added), or left out (illness, travel, a festival). A mark only changes how the day counts in the
 * weekly figures; it deletes nothing, and it says nothing about why.
 */
export function DayStatusSheet({
  visible,
  onClose,
  current,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  current: DayMark | null;
  /** `null` clears the mark. */
  onChange: (status: DayMark | null) => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={t.title} testID="day-status-sheet">
      <View style={{ gap: space.lg, paddingBottom: space.xl }}>
        <Text variant="small" tone="secondary">
          {t.lead}
        </Text>
        <ListGroup>
          {OPTIONS.map(o => (
            <ListRow
              key={o.value}
              testID={`day-mark-${o.value}`}
              title={o.title}
              subtitle={o.hint}
              accessibilityLabel={`${o.title}. ${o.hint}${current === o.value ? `. ${t.current}` : ''}`}
              right={current === o.value ? <Icon as={Check} size="md" tone="primary" /> : undefined}
              chevron={false}
              onPress={() => onChange(o.value)}
            />
          ))}
        </ListGroup>
        {current ? <Button testID="day-mark-clear" label={t.clear} variant="ghost" onPress={() => onChange(null)} /> : null}
      </View>
    </Sheet>
  );
}
