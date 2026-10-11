/**
 * Small status pieces in the old app's styles, collected so screens stop restyling them:
 * the ManualFoodLog success/error banners, the report's loading state and the weekly
 * summary's dashed empty card, plus the dashboard's dotted section label.
 */
import React from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View, type StatusBarStyle } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { AlertCircle, CheckCircle } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { HStack } from '@/components/ui/hstack';
import { tokens } from '@/theme/tokens';

type NoticeTone = 'error' | 'success' | 'warn' | 'info';

const NOTICE: Record<NoticeTone, { box: string; text: string }> = {
  error: { box: 'bg-red-50 border-red-200', text: 'text-red-600' },
  success: { box: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700 font-semibold' },
  warn: { box: 'bg-amber-50 border-amber-200', text: 'text-amber-800' },
  info: { box: 'bg-blue-50 border-blue-100', text: 'text-blue-600' },
};

export function Notice({ tone, children, action }: { tone: NoticeTone; children: React.ReactNode; action?: React.ReactNode }) {
  const s = NOTICE[tone];
  return (
    <View className={`border rounded-2xl p-4 ${s.box}`}>
      <HStack className="items-center gap-2">
        {tone === 'success' ? <CheckCircle size={18} stroke={tokens.icon.greenBright} /> : null}
        {tone === 'error' ? <AlertCircle size={18} stroke={tokens.icon.red} /> : null}
        <Text className={`text-sm flex-1 ${s.text}`}>{children}</Text>
      </HStack>
      {action ? <View className="mt-3 flex-row">{action}</View> : null}
    </View>
  );
}

export function LoadingState({ label, color = tokens.report.spinner }: { label?: string; color?: string }) {
  return (
    <View className="items-center justify-center py-16">
      <ActivityIndicator size="large" color={color} />
      {label ? <Text className="mt-4 text-gray-600">{label}</Text> : null}
    </View>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptySub}>{body}</Text> : null}
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

/** "● LOGGED"-style label from the dashboard cards. */
export function SectionLabel({ children, dot = 'bg-emerald-600', right }: { children: React.ReactNode; dot?: string; right?: React.ReactNode }) {
  return (
    <HStack className="items-center justify-between">
      <HStack className="items-center gap-1.5">
        <View className={`w-[5px] h-[5px] rounded-full ${dot}`} />
        <Text className="text-[10px] font-medium text-gray-400 uppercase tracking-widest">{children}</Text>
      </HStack>
      {right}
    </HStack>
  );
}

/**
 * Light status-bar icons over the gradient and call screens. Mounted only while the screen
 * is focused, so React Native's StatusBar stack falls back to App's dark style on blur
 * (resetting in a blur callback lost the race with the next screen's focus).
 */
export function FocusAwareStatusBar({ barStyle }: { barStyle: StatusBarStyle }) {
  const isFocused = useIsFocused();
  return isFocused ? <StatusBar barStyle={barStyle} /> : null;
}

const styles = StyleSheet.create({
  empty: {
    paddingVertical: 40,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: tokens.report.line,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: tokens.report.surface,
  },
  emptyTitle: {
    color: tokens.report.ink,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySub: {
    color: tokens.report.inkMuted,
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
    textAlign: 'center',
  },
  emptyAction: {
    marginTop: 14,
  },
});
