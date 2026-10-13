import React from 'react';
import { Linking, Pressable } from 'react-native';
import { ExternalLink } from 'lucide-react-native';
import { Icon, Text } from '@/components/kit';
import { space } from '@/theme';
import type { SourceInfo } from '@/api/types';

/** A source: its title and publisher, opening the link that was checked when the plan was written. */
export function SourceLink({ source }: { source: SourceInfo }) {
  const press = source.url ? () => Linking.openURL(source.url).catch(() => {}) : undefined;
  const label = `${source.title} (${source.publisher}${source.year ? `, ${source.year}` : ''})`;
  return (
    <Pressable
      onPress={press}
      disabled={!press}
      accessibilityRole={press ? 'link' : 'text'}
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space.sm,
        paddingVertical: space.xs,
      }}
    >
      <Text variant="caption" tone={press ? 'primary' : 'muted'} style={{ flex: 1 }}>
        {label}
      </Text>
      {press ? <Icon as={ExternalLink} size={14} tone="primary" /> : null}
    </Pressable>
  );
}
