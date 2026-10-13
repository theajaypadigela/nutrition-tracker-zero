import React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X, type LucideIcon } from 'lucide-react-native';
import { radius, space, useTheme } from '@/theme';
import { Icon } from './Icon';
import { Text, type TextTone } from './Text';

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

const GLYPH: Record<NoticeTone, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
};

/**
 * An inline message: what happened, and optionally one thing to do about it. A soft tint, no
 * outline, so a stack of them stays quiet.
 */
export function Notice({
  tone = 'info',
  title,
  children,
  action,
  onDismiss,
  testID,
}: {
  tone?: NoticeTone;
  title?: string;
  children?: React.ReactNode;
  action?: { label: string; onPress: () => void };
  onDismiss?: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  const scheme: Record<NoticeTone, { bg: string; text: TextTone }> = {
    info: { bg: colors.surfaceMuted, text: 'secondary' },
    success: { bg: colors.primarySoft, text: 'primary' },
    warning: { bg: colors.warningSoft, text: 'warning' },
    danger: { bg: colors.dangerSoft, text: 'danger' },
  };
  const s = scheme[tone];
  return (
    <View
      testID={testID}
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space.md,
        padding: space.md + 2,
        borderRadius: radius.md,
        backgroundColor: s.bg,
      }}
    >
      <View style={{ paddingTop: 1 }}>
        <Icon as={GLYPH[tone]} size="md" tone={s.text} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        {title ? (
          <Text variant="smallStrong" tone={s.text}>
            {title}
          </Text>
        ) : null}
        {children ? (
          <Text variant="small" tone={s.text}>
            {children}
          </Text>
        ) : null}
        {action ? (
          <Pressable onPress={action.onPress} hitSlop={8} accessibilityRole="button" style={{ alignSelf: 'flex-start', marginTop: space.xs }}>
            <Text variant="smallStrong" tone={s.text} style={{ textDecorationLine: 'underline' }}>
              {action.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {onDismiss ? (
        <Pressable onPress={onDismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss">
          <Icon as={X} size="md" tone={s.text} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Nothing here yet: an icon, a line of what and why, and optionally the way forward. */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: space.xxxl + space.sm, paddingHorizontal: space.xl, gap: space.sm }}>
      {icon ? (
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: radius.pill,
            backgroundColor: colors.surfaceMuted,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: space.xs,
          }}
        >
          <Icon as={icon} size="lg" tone="muted" />
        </View>
      ) : null}
      <Text variant="bodyStrong" align="center">
        {title}
      </Text>
      {body ? (
        <Text variant="small" tone="muted" align="center">
          {body}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: space.md }}>{action}</View> : null}
    </View>
  );
}

export function LoadingState({ label }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: space.huge, gap: space.md }}>
      <ActivityIndicator size="small" color={colors.primary} />
      {label ? (
        <Text variant="small" tone="muted">
          {label}
        </Text>
      ) : null}
    </View>
  );
}
