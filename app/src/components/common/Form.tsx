/**
 * Form pieces in the style of the old app's "New Habit" screen: white section cards
 * with a tinted icon well, gray-50 inputs, emerald quick-select pills and a fixed
 * bottom action bar. Used by the screens the old app had no direct equivalent for
 * (food editor, unit conversion, goals).
 */
import React from 'react';
import {
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  View,
  type KeyboardTypeOptions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LucideIcon } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { useKeyboardHeight } from '@/hooks/useKeyboard';
import { tokens } from '@/theme/tokens';

export function SectionCard({
  icon: Icon,
  iconColor,
  iconBg,
  title,
  subtitle,
  right,
  children,
}: {
  icon: LucideIcon;
  iconColor: string;
  /** Tailwind background class for the icon well, e.g. 'bg-emerald-50'. */
  iconBg: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <VStack className="bg-white rounded-2xl p-5 border border-gray-200 gap-4">
      <HStack className="items-center gap-2.5">
        <View className={`w-9 h-9 rounded-full items-center justify-center ${iconBg}`}>
          <Icon size={16} color={iconColor} />
        </View>
        <VStack className="flex-1">
          <Text size="lg" className="font-semibold text-gray-900">
            {title}
          </Text>
          {subtitle ? (
            <Text size="xs" className="text-gray-500">
              {subtitle}
            </Text>
          ) : null}
        </VStack>
        {right}
      </HStack>
      {children}
    </VStack>
  );
}

export function FormInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  error,
  autoFocus,
  autoCapitalize,
  secureTextEntry,
  className,
  testID,
}: {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  error?: string | null;
  autoFocus?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  secureTextEntry?: boolean;
  className?: string;
  testID?: string;
}) {
  return (
    <VStack className={`gap-1 ${className ?? ''}`}>
      {label ? <Text className="text-sm font-medium text-gray-700">{label}</Text> : null}
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={tokens.icon.muted}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        secureTextEntry={secureTextEntry}
        className={`bg-gray-50 rounded-xl px-4 py-3.5 text-gray-900 text-base border ${
          error ? 'border-red-400' : 'border-gray-200'
        }`}
      />
      {error ? <Text className="text-xs text-red-500 mt-0.5">{error}</Text> : null}
    </VStack>
  );
}

/** The habit form's "Every Day / Weekdays / Weekends" quick-select pill. */
export function QuickPill({
  label,
  selected,
  onPress,
  grow,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  grow?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`${grow ? 'flex-1' : ''} px-3 py-2 rounded-lg items-center border ${
        selected ? 'bg-emerald-50 border-emerald-300' : 'bg-gray-50 border-gray-200'
      }`}
    >
      <Text size="xs" className={`font-medium ${selected ? 'text-emerald-700' : 'text-gray-600'}`}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/** Full-width emerald button, gray while disabled (the habit form's Create button). */
export function ActionButton({
  title,
  onPress,
  disabled,
  loading,
  testID,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
}) {
  const active = !disabled && !loading;
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={!active}
      accessibilityRole="button"
      accessibilityState={{ disabled: !active, busy: !!loading }}
      className={`py-4 rounded-xl items-center flex-row justify-center gap-2 ${active ? 'bg-emerald-500' : 'bg-gray-300'}`}
    >
      {loading ? <ActivityIndicator color={tokens.icon.onAccent} /> : null}
      <Text size="lg" className={`font-bold ${active ? 'text-white' : 'text-gray-500'}`}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

/**
 * The habit form's fixed bottom bar: optional error above one action button. It rides on
 * top of the open keyboard, as adjustResize did before edge-to-edge.
 */
export function BottomActionBar({ error, children }: { error?: string | null; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  return (
    <View
      className="absolute left-0 right-0 px-6 pt-4 bg-white border-t border-gray-200"
      style={{ bottom: keyboardHeight, paddingBottom: keyboardHeight ? 16 : Math.max(insets.bottom, 16) + 16 }}
    >
      {error ? (
        <View className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <Text size="sm" className="text-red-700">
            {error}
          </Text>
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Space at the end of a scroll view so its content clears the BottomActionBar. */
export const BOTTOM_BAR_SPACE = 150;

/** Room to keep above the keyboard for a focused field when the BottomActionBar sits on it. */
export const BOTTOM_BAR_CLEARANCE = 110;
