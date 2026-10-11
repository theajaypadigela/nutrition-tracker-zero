import React from 'react';
import { tokens } from '@/theme/tokens';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { AlertCircle, ShieldCheck } from 'lucide-react-native';
import { R } from './authTheme';

/** Full-width gradient CTA. Shows a spinner + label while `loading`. */
export function PrimaryButton({
  children,
  onPress,
  loading,
  disabled,
  trailing,
  style,
  testID,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  trailing?: React.ReactNode;
  style?: ViewStyle;
  testID?: string;
}) {
  const off = !!disabled || !!loading;
  const label =
    typeof children === 'string' ? (
      <Text style={styles.primaryText}>{children}</Text>
    ) : (
      children
    );
  return (
    <Pressable
      testID={testID}
      onPress={off ? undefined : onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: !!loading }}
      style={({ pressed }) => [
        { borderRadius: R.lg, overflow: 'hidden' },
        pressed && !off ? { transform: [{ scale: 0.985 }] } : null,
        !off ? styles.primaryShadow : null,
        style,
      ]}
    >
      <LinearGradient
        colors={off ? [tokens.auth.buttonDisabled, tokens.auth.buttonDisabled] : [tokens.auth.greenMid, tokens.auth.green, tokens.auth.greenDeep]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.primaryInner}
      >
        {loading ? (
          <>
            <ActivityIndicator color={tokens.auth.white} />
            {label}
          </>
        ) : (
          <>
            {label}
            {trailing}
          </>
        )}
      </LinearGradient>
    </Pressable>
  );
}

/** Outlined secondary button on a white surface. */
export function GhostButton({
  children,
  onPress,
}: {
  children: React.ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.ghost, pressed ? { opacity: 0.7 } : null]}
    >
      <Text style={styles.ghostText}>{children}</Text>
    </Pressable>
  );
}

/** Inline text link / button (e.g. "Forgot password?", "Log in"). */
export function TextLink({
  children,
  onPress,
  color = tokens.auth.green,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  color?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
    >
      <Text style={[styles.link, { color }]}>{children}</Text>
    </Pressable>
  );
}

/** Inline status banner (sign-in errors, info). */
export function Banner({
  tone = 'error',
  title,
  children,
}: {
  tone?: 'error' | 'info';
  title?: string;
  children?: React.ReactNode;
}) {
  const isError = tone === 'error';
  const bg = isError ? tokens.auth.dangerSoft : tokens.auth.greenSoft;
  const fg = isError ? tokens.auth.danger : tokens.auth.greenDeep;
  const Icon = isError ? AlertCircle : ShieldCheck;
  return (
    <View
      accessibilityRole="alert"
      style={[styles.banner, { backgroundColor: bg, borderColor: `${fg}22` }]}
    >
      <Icon size={18} color={isError ? tokens.auth.danger : tokens.auth.green} />
      <View style={{ flex: 1 }}>
        {title ? <Text style={[styles.bannerTitle, { color: fg }]}>{title}</Text> : null}
        {children ? (
          <Text style={[styles.bannerBody, { color: fg, marginTop: title ? 2 : 0 }]}>
            {children}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  primaryInner: {
    height: 56,
    borderRadius: R.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  primaryText: {
    color: tokens.auth.white,
    fontSize: 16.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  primaryShadow: {
    shadowColor: tokens.auth.green,
    shadowOpacity: 0.34,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  ghost: {
    height: 54,
    borderRadius: R.lg,
    borderWidth: 1.6,
    borderColor: tokens.auth.line,
    backgroundColor: tokens.auth.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostText: {
    color: tokens.auth.ink,
    fontSize: 15.5,
    fontWeight: '700',
  },
  link: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  banner: {
    flexDirection: 'row',
    gap: 11,
    alignItems: 'flex-start',
    borderRadius: R.md,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  bannerTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  bannerBody: {
    fontSize: 12.5,
    fontWeight: '500',
    lineHeight: 18,
  },
});
