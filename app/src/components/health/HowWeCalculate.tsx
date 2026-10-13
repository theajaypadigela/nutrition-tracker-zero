import React from 'react';
import { View } from 'react-native';
import type { ReferenceSetId } from '@/api/types';
import { Card, Text } from '@/components/kit';
import { strings } from '@/i18n/strings';
import { space } from '@/theme';

const t = strings.health.how;

/** The plain-language explainer of every number: kept readable in low-pressure mode, where targets are not shown. It follows the reference set. */
export function HowWeCalculate({ referenceSet = 'nasem' }: { referenceSet?: ReferenceSetId }) {
  const indian = referenceSet === 'icmr_nin';
  const blocks = [t.energy, t.goal, indian ? t.india.macros : t.macros, indian ? t.india.minerals : t.minerals, t.limits];
  return (
    <View style={{ gap: space.md }}>
      <Text variant="title3">{t.title}</Text>
      <Text variant="body" tone="secondary">
        {t.intro}
      </Text>
      {blocks.map(b => (
        <Card key={b.title}>
          <Text variant="bodyStrong">{b.title}</Text>
          <Text variant="small" tone="secondary" style={{ marginTop: space.xs }}>
            {b.body}
          </Text>
        </Card>
      ))}
      <Text variant="caption" tone="muted">
        {t.tags}
      </Text>
      <Text variant="caption" tone="muted">
        {strings.disclaimer.full}
      </Text>
    </View>
  );
}
