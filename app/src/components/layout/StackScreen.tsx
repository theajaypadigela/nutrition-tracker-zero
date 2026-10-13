import React from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton, Text } from '@/components/kit';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboard';
import { FocusAwareStatusBar, hairline, size, space, useTheme } from '@/theme';

/**
 * The frame of a pushed screen: a fixed header (back button, title, optional right action),
 * a scrolling body, and an optional footer for the one primary action. Forms get the keyboard
 * handling edge-to-edge Android needs: the whole frame rides on top of the keyboard and the
 * focused field scrolls clear of the footer.
 */
export function StackScreen({
  title,
  subtitle,
  right,
  onBack,
  children,
  footer,
  scroll = true,
  refreshing,
  onRefresh,
  gap = space.lg,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  /** Defaults to going back one screen. */
  onBack?: () => void;
  children: React.ReactNode;
  /** Fixed under the body, e.g. a Save button. */
  footer?: React.ReactNode;
  /** Pass false when the body manages its own scrolling. */
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  gap?: number;
}) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { keyboardHeight, scrollProps } = useKeyboardAwareScroll(footer ? 110 : 24);

  const back = () => {
    if (onBack) onBack();
    else if (navigation.canGoBack()) navigation.goBack();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: keyboardHeight }}>
      <FocusAwareStatusBar />
      <View
        style={{
          paddingTop: insets.top,
          borderBottomWidth: hairline,
          borderBottomColor: colors.border,
          backgroundColor: colors.bg,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: size.header, paddingLeft: space.sm, paddingRight: size.gutter, gap: space.xs }}>
          <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={back} size={44} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="title3" numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {right}
        </View>
      </View>

      {scroll ? (
        <ScrollView
          {...scrollProps}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: size.gutter, paddingBottom: size.gutter + (footer ? 0 : insets.bottom), gap }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={!!refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
                progressBackgroundColor={colors.surface}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{children}</View>
      )}

      {footer ? (
        <View
          style={{
            paddingHorizontal: size.gutter,
            paddingTop: space.md,
            paddingBottom: keyboardHeight > 0 ? space.md : Math.max(insets.bottom, space.md) + space.xs,
            borderTopWidth: hairline,
            borderTopColor: colors.border,
            backgroundColor: colors.bg,
            gap: space.md,
          }}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}
