import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type PressableProps,
  type ScrollViewProps,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/colors';

export function Screen({
  children,
  edges = ['top'],
  className,
}: {
  children: React.ReactNode;
  edges?: Edge[];
  className?: string;
}) {
  return (
    <SafeAreaView edges={edges} className={cn('flex-1 bg-canvas', className)}>
      {children}
    </SafeAreaView>
  );
}

export function ScrollBody({
  children,
  refreshing,
  onRefresh,
  className,
  ...rest
}: ScrollViewProps & { refreshing?: boolean; onRefresh?: () => void; className?: string }) {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerClassName={cn('px-4 pb-10 pt-2', className)}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.brand} /> : undefined
      }
      {...rest}
    >
      {children}
    </ScrollView>
  );
}

export function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View className="flex-row items-center justify-between px-4 pb-2 pt-3">
      <View className="flex-1 pr-3">
        <Text className="text-2xl font-bold text-ink" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="mt-0.5 text-sm text-ink-soft" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <View className={cn('mb-3 rounded-2xl border border-line bg-white p-4', className)}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View className="mb-2 mt-4 flex-row items-center justify-between">
      <Text className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{children}</Text>
      {right}
    </View>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const BUTTON_STYLES: Record<ButtonVariant, { box: string; text: string; spinner: string }> = {
  primary: { box: 'bg-brand', text: 'text-white', spinner: colors.white },
  secondary: { box: 'bg-brand-soft', text: 'text-brand-deep', spinner: colors.brand },
  danger: { box: 'bg-danger-soft', text: 'text-danger', spinner: colors.danger },
  ghost: { box: 'bg-transparent', text: 'text-brand', spinner: colors.brand },
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  className,
  small,
  testID,
}: {
  title: string;
  onPress?: PressableProps['onPress'];
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  className?: string;
  small?: boolean;
  testID?: string;
}) {
  const s = BUTTON_STYLES[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      className={cn(
        'flex-row items-center justify-center rounded-xl',
        small ? 'px-3 py-2' : 'px-4 py-3.5',
        s.box,
        inactive && 'opacity-50',
        className,
      )}
    >
      {loading ? <ActivityIndicator color={s.spinner} size="small" /> : icon}
      <Text className={cn('font-semibold', small ? 'text-sm' : 'text-base', s.text, (loading || icon) && 'ml-2')}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  error,
  hint,
  autoFocus,
  secureTextEntry,
  autoCapitalize,
  className,
  testID,
}: {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  error?: string | null;
  hint?: string;
  autoFocus?: boolean;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  className?: string;
  testID?: string;
}) {
  return (
    <View className={cn('mb-3', className)}>
      {label ? <Text className="mb-1.5 text-sm font-medium text-ink-soft">{label}</Text> : null}
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.inkMuted}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        className={cn(
          'rounded-xl border bg-field px-3.5 py-3 text-base text-ink',
          error ? 'border-danger' : 'border-line',
        )}
      />
      {error ? <Text className="mt-1 text-sm text-danger">{error}</Text> : null}
      {!error && hint ? <Text className="mt-1 text-xs text-ink-muted">{hint}</Text> : null}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  tone = 'brand',
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'brand' | 'warn' | 'info';
}) {
  const selectedBox = tone === 'warn' ? 'bg-warn border-warn' : tone === 'info' ? 'bg-info border-info' : 'bg-brand border-brand';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      className={cn('mb-2 mr-2 rounded-full border px-3 py-1.5', selected ? selectedBox : 'border-line bg-white')}
    >
      <Text className={cn('text-sm', selected ? 'font-semibold text-white' : 'text-ink-soft')}>{label}</Text>
    </Pressable>
  );
}

export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  labels,
  allowNone,
}: {
  options: readonly T[];
  value: T | null;
  onChange: (v: T | null) => void;
  labels?: Partial<Record<T, string>>;
  allowNone?: boolean;
}) {
  return (
    <View className="flex-row flex-wrap">
      {options.map((o) => (
        <Chip
          key={o}
          label={labels?.[o] ?? o}
          selected={value === o}
          onPress={() => onChange(allowNone && value === o ? null : o)}
        />
      ))}
    </View>
  );
}

export function Banner({ tone, children, action }: { tone: 'error' | 'warn' | 'info' | 'ok'; children: React.ReactNode; action?: React.ReactNode }) {
  const box = {
    error: 'bg-danger-soft border-danger/30',
    warn: 'bg-warn-soft border-warn/30',
    info: 'bg-info-soft border-info/30',
    ok: 'bg-brand-soft border-brand/30',
  }[tone];
  const text = { error: 'text-danger', warn: 'text-warn', info: 'text-info', ok: 'text-brand-deep' }[tone];
  return (
    <View className={cn('mb-3 rounded-xl border px-3.5 py-3', box)}>
      <Text className={cn('text-sm', text)}>{children}</Text>
      {action ? <View className="mt-2 flex-row">{action}</View> : null}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View className="flex-1 items-center justify-center py-16">
      <ActivityIndicator color={colors.brand} />
      {label ? <Text className="mt-3 text-sm text-ink-muted">{label}</Text> : null}
    </View>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <View className="items-center px-6 py-10">
      <Text className="text-center text-base font-semibold text-ink">{title}</Text>
      {body ? <Text className="mt-1.5 text-center text-sm text-ink-soft">{body}</Text> : null}
      {action ? <View className="mt-4">{action}</View> : null}
    </View>
  );
}

export function Row({
  title,
  subtitle,
  right,
  onPress,
  last,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  const content = (
    <View className={cn('flex-row items-center py-3', !last && 'border-b border-line-soft')}>
      <View className="flex-1 pr-3">
        <Text className="text-base text-ink">{title}</Text>
        {subtitle ? <Text className="mt-0.5 text-sm text-ink-soft">{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

/** Circular progress (calories vs goal). */
export function Ring({
  progress,
  size = 132,
  stroke = 12,
  color = colors.brand,
  children,
}: {
  progress: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.line} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - clamped)}
          strokeLinecap="round"
        />
      </Svg>
      {children}
    </View>
  );
}

/** Horizontal bar against a goal; goes amber past 100 %. */
export function Bar({ progress, color = colors.brand }: { progress: number; color?: string }) {
  const pct = Math.max(0, Math.min(1, progress)) * 100;
  return (
    <View className="h-2 overflow-hidden rounded-full bg-line">
      <View style={{ width: `${pct}%`, backgroundColor: progress > 1 ? colors.warn : color }} className="h-2 rounded-full" />
    </View>
  );
}
