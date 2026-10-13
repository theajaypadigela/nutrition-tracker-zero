import React from 'react';
import { View } from 'react-native';
import { ProgressBar, Text } from '@/components/kit';
import { fill } from '@/i18n/fill';
import { strings } from '@/i18n/strings';
import { space } from '@/theme';

/** The foods that supplied most of a nutrient, from the person's own log (plan 5.2). Up to three. */
export function TopSources({
  sources,
  title = strings.report.detail.sources,
}: {
  sources: { name: string; share: number }[];
  title?: string;
}) {
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="smallStrong" tone="muted">
        {title}
      </Text>
      {sources.length === 0 ? (
        <Text variant="small" tone="muted">
          {strings.report.detail.sourcesNone}
        </Text>
      ) : (
        sources.map(s => (
          <View
            key={`${s.name}`}
            style={{ gap: space.xs }}
            accessible
            accessibilityLabel={`${s.name}, ${fill(strings.report.line.percent, { pct: Math.round(s.share * 100) })}`}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
              <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
                {s.name}
              </Text>
              <Text variant="body" tone="secondary" tabular>
                {fill(strings.report.line.percent, { pct: Math.round(s.share * 100) })}
              </Text>
            </View>
            <ProgressBar value={s.share} tone="muted" height={4} />
          </View>
        ))
      )}
    </View>
  );
}
