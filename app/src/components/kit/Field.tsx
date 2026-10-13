import React, { useState } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';
import { Search, X, type LucideIcon } from 'lucide-react-native';
import { createStyles, fontFor, radius, space, useTheme } from '@/theme';
import { Icon } from './Icon';
import { Text } from './Text';

type PassThrough = Pick<
  TextInputProps,
  | 'keyboardType'
  | 'autoCapitalize'
  | 'autoCorrect'
  | 'autoFocus'
  | 'secureTextEntry'
  | 'returnKeyType'
  | 'onSubmitEditing'
  | 'editable'
  | 'maxLength'
  | 'onFocus'
  | 'onBlur'
>;

const INPUT_SIZE = 16;

const useStyles = createStyles(({ colors }) => ({
  group: { gap: 6 },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderColor: colors.inputBorder,
  },
  input: {
    flex: 1,
    padding: 0,
    color: colors.text,
    fontSize: INPUT_SIZE,
    includeFontPadding: false,
    ...fontFor('regular'),
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  inlineBox: {
    width: 104,
    height: 40,
    borderRadius: radius.sm + 2,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: space.md,
    justifyContent: 'center',
    borderColor: 'transparent',
  },
  inlineInput: {
    padding: 0,
    color: colors.text,
    fontSize: INPUT_SIZE,
    textAlign: 'right',
    includeFontPadding: false,
    ...fontFor('medium'),
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 46,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
}));

/** A labelled text field: 48 high, a 1dp outline that turns green on focus and red on error. */
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  hint,
  suffix,
  icon,
  required,
  testID,
  ...input
}: {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  error?: string | null;
  hint?: string;
  /** A unit shown inside the field, after the value. */
  suffix?: string;
  icon?: LucideIcon;
  required?: boolean;
  testID?: string;
} & PassThrough) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.danger : focused ? colors.primary : colors.inputBorder;
  return (
    <View style={styles.group}>
      {label ? (
        <Text variant="smallStrong" tone="secondary">
          {label}
          {required ? <Text variant="smallStrong" tone="danger"> *</Text> : null}
        </Text>
      ) : null}
      <View
        style={[
          styles.box,
          // Focus thickens the outline by 1dp; the side padding gives it back so the text stays put.
          { borderColor, borderWidth: focused || error ? 2 : 1, paddingHorizontal: focused || error ? 13 : 14 },
        ]}
      >
        {icon ? <Icon as={icon} size="md" tone="muted" /> : null}
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.primary}
          cursorColor={colors.primary}
          style={styles.input}
          accessibilityLabel={label}
          {...input}
          onFocus={e => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={e => {
            setFocused(false);
            input.onBlur?.(e);
          }}
        />
        {suffix ? (
          <Text variant="small" tone="muted">
            {suffix}
          </Text>
        ) : null}
      </View>
      {error ? (
        <Text variant="small" tone="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A label on the left and a small right-aligned input on the right, for lists of numbers
 * (goals, nutrient values). Put these inside a ListGroup.
 */
export function InlineField({
  label,
  unit,
  value,
  onChangeText,
  placeholder,
  error,
  keyboardType = 'decimal-pad',
  testID,
}: {
  label: string;
  unit?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  error?: string | null;
  keyboardType?: TextInputProps['keyboardType'];
  testID?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [focused, setFocused] = useState(false);
  return (
    <View>
      <View style={styles.inline}>
        <Text variant="body" style={{ flex: 1 }} numberOfLines={2}>
          {label}
        </Text>
        <View
          style={[
            styles.inlineBox,
            { borderWidth: error || focused ? 1.5 : 0, borderColor: error ? colors.danger : colors.primary },
          ]}
        >
          <TextInput
            testID={testID}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.primary}
            cursorColor={colors.primary}
            keyboardType={keyboardType}
            autoCorrect={false}
            style={styles.inlineInput}
            accessibilityLabel={`${label}${unit ? ` (${unit})` : ''}`}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
        </View>
        {unit ? (
          <Text variant="small" tone="muted" style={{ width: 34 }} numberOfLines={1}>
            {unit}
          </Text>
        ) : null}
      </View>
      {error ? (
        <Text variant="small" tone="danger" style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** A search box with a clear button once there is text. */
export function SearchField({
  value,
  onChangeText,
  placeholder = 'Search',
  autoFocus,
  testID,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.search}>
      <Icon as={Search} size="md" tone="muted" />
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.primary}
        cursorColor={colors.primary}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        style={styles.input}
        accessibilityLabel={placeholder}
      />
      {value ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
          <Icon as={X} size="md" tone="muted" />
        </Pressable>
      ) : null}
    </View>
  );
}
