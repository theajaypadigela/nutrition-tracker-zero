import React from 'react';
import { View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { radius, useTheme } from '@/theme';
import { Icon } from './Icon';
import { Text, type TextTone } from './Text';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger';

/** A small status label: a soft tint behind coloured text. Sentence case, never shouting. */
export function Badge({ label, tone = 'neutral', icon }: { label: string; tone?: BadgeTone; icon?: LucideIcon }) {
  const { colors } = useTheme();
  const scheme: Record<BadgeTone, { bg: string; text: TextTone }> = {
    neutral: { bg: colors.surfaceMuted, text: 'secondary' },
    success: { bg: colors.primarySoft, text: 'primary' },
    warning: { bg: colors.warningSoft, text: 'warning' },
    danger: { bg: colors.dangerSoft, text: 'danger' },
  };
  const s = scheme[tone];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 4,
        height: 22,
        paddingHorizontal: 8,
        borderRadius: radius.pill,
        backgroundColor: s.bg,
      }}
    >
      {icon ? <Icon as={icon} size={12} tone={s.text} strokeWidth={2} /> : null}
      <Text variant="caption" tone={s.text}>
        {label}
      </Text>
    </View>
  );
}
