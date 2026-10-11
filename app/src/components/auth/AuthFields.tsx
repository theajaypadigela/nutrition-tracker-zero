import React, { useState } from 'react';
import { tokens } from '@/theme/tokens';
import {
  KeyboardTypeOptions,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  AlertCircle,
  Check,
  LucideIcon,
} from 'lucide-react-native';
import { R } from './authTheme';

/**
 * Opacity of the green focus glow. The glow is always mounted (see
 * `styles.fieldFocusRing`) and only its opacity moves, so focusing a field never
 * adds or removes shadow props.
 */
const FOCUS_RING_OPACITY = 0.18;

// ─── label + footer ────────────────────────────────────────
function FieldLabel({ label, optional }: { label: string; optional?: boolean }) {
  return (
    <View style={styles.labelRow}>
      <Text style={styles.labelText}>{label}</Text>
      {optional ? (
        <View style={styles.optionalPill}>
          <Text style={styles.optionalText}>Optional</Text>
        </View>
      ) : null}
    </View>
  );
}

function FieldFoot({ error, hint }: { error?: string | false; hint?: string }) {
  if (error) {
    return (
      <View style={styles.footRow} accessibilityRole="alert">
        <AlertCircle size={15} color={tokens.auth.danger} />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }
  if (hint) {
    return <Text style={styles.hintText}>{hint}</Text>;
  }
  return null;
}

// ─── text field ────────────────────────────────────────────
export interface AuthTextFieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  onBlur?: () => void;
  icon?: LucideIcon;
  placeholder?: string;
  error?: string | false;
  hint?: string;
  optional?: boolean;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoComplete?: React.ComponentProps<typeof TextInput>['autoComplete'];
  trailing?: React.ReactNode;
  testID?: string;
}

export function AuthTextField({
  label,
  value,
  onChangeText,
  onBlur,
  icon: Icon,
  placeholder,
  error,
  hint,
  optional,
  secureTextEntry,
  keyboardType,
  autoCapitalize = 'none',
  autoComplete,
  trailing,
  testID,
}: AuthTextFieldProps) {
  const [focus, setFocus] = useState(false);
  const borderColor = error ? tokens.auth.danger : focus ? tokens.auth.green : tokens.auth.line;
  const iconColor = error ? tokens.auth.danger : focus ? tokens.auth.green : tokens.auth.inkMuted;
  return (
    <View>
      <FieldLabel label={label} optional={optional} />
      <View
        style={[
          styles.fieldBox,
          styles.fieldFocusRing,
          {
            borderColor,
            backgroundColor: focus ? tokens.auth.surface : tokens.auth.field,
            shadowOpacity: focus ? FOCUS_RING_OPACITY : 0,
          },
        ]}
      >
        {Icon ? <Icon size={20} color={iconColor} /> : null}
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocus(true)}
          onBlur={() => {
            setFocus(false);
            onBlur?.();
          }}
          placeholder={placeholder}
          placeholderTextColor={tokens.auth.inkMuted}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          style={styles.input}
        />
        {trailing}
      </View>
      <FieldFoot error={error} hint={hint} />
    </View>
  );
}

// ─── gender chips ──────────────────────────────────────────
export function GenderChips({
  label,
  options,
  value,
  onChange,
  error,
}: {
  label: string;
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
  error?: string | false;
}) {
  return (
    <View>
      <View style={styles.labelRow}>
        <Text style={styles.labelText}>{label}</Text>
      </View>
      <View style={styles.chipWrap} accessibilityRole="radiogroup">
        {options.map(o => {
          const on = value === o.value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={[
                styles.chip,
                {
                  borderColor: on ? tokens.auth.green : tokens.auth.line,
                  backgroundColor: on ? tokens.auth.greenSoft : tokens.auth.field,
                },
              ]}
            >
              {on ? <Check size={16} color={tokens.auth.green} /> : null}
              <Text style={[styles.chipText, { color: on ? tokens.auth.greenDeep : tokens.auth.inkSoft }]}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <FieldFoot error={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 7,
    marginBottom: 8,
  },
  labelText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: tokens.auth.ink,
  },
  optionalPill: {
    backgroundColor: tokens.auth.lineSoft,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  optionalText: {
    fontSize: 11,
    fontWeight: '700',
    color: tokens.auth.inkMuted,
  },
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.6,
    borderRadius: R.md,
    paddingHorizontal: 14,
    height: 54,
  },
  fieldFocusRing: {
    // iOS-only glow, and it must stay applied UNCONDITIONALLY — callers vary only
    // `shadowOpacity` (0 <-> FOCUS_RING_OPACITY). Adding or removing a View's shadow
    // props on focus reconfigures its native layer, which resigns the child
    // TextInput's first responder: the field unfocuses ~100ms after you tap it, so
    // the form cannot be typed into at all. Same reason `elevation` must never go
    // here — toggling Android elevation recreates the native shadow node and drops
    // focus the same way. Both are the "tap the field, it immediately unselects" bug.
    shadowColor: tokens.auth.green,
    shadowOpacity: 0,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  input: {
    flex: 1,
    minWidth: 0,
    padding: 0,
    fontSize: 16,
    fontWeight: '600',
    color: tokens.auth.ink,
    letterSpacing: -0.2,
  },
  footRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  errorText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: tokens.auth.danger,
    flex: 1,
  },
  hintText: {
    marginTop: 8,
    fontSize: 12.5,
    fontWeight: '500',
    color: tokens.auth.inkMuted,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  chip: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 48,
    borderWidth: 1.6,
    borderRadius: R.md,
    paddingHorizontal: 10,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  chipText: {
    fontSize: 14.5,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
