import React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark, Text } from '@/components/kit';
import { StatusBarScrim } from '@/components/layout/StatusBarScrim';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboard';
import { FocusAwareStatusBar, size, space, useTheme } from '@/theme';

/** The frame of the log in and create account screens: the mark, a title and a line under it, the form, and a way to the other screen. */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  // Clearance for the button under the last field.
  const { keyboardHeight, scrollProps } = useKeyboardAwareScroll(100);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FocusAwareStatusBar />
      <ScrollView
        {...scrollProps}
        contentContainerStyle={{
          padding: size.gutter,
          paddingTop: insets.top + space.xxxl,
          paddingBottom: Math.max(insets.bottom, space.lg) + keyboardHeight + space.xxl,
          gap: space.xxl,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: space.xl }}>
          <BrandMark size={52} />
          <View style={{ gap: space.sm }}>
            <Text variant="title1">{title}</Text>
            <Text variant="body" tone="secondary">
              {subtitle}
            </Text>
          </View>
        </View>
        {children}
        {footer}
      </ScrollView>
      <StatusBarScrim />
    </View>
  );
}
