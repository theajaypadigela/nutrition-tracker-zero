import React, { useEffect, useRef } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/kit';
import { FocusAwareStatusBar, size, space, useTheme } from '@/theme';
import { ProfileButton } from './ProfileButton';
import { StatusBarScrim } from './StatusBarScrim';

/**
 * The frame of a tab's root screen: a large title (with the profile button) that scrolls away
 * with the content, then the content. The tab bar is outside this view, so nothing here needs
 * to clear it; a `fab` gets bottom padding instead.
 */
export function TabScreen({
  title,
  subtitle,
  headerActions,
  children,
  refreshing,
  onRefresh,
  fab,
}: {
  title: string;
  subtitle?: string;
  /** Buttons to the left of the profile button. */
  headerActions?: React.ReactNode;
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** A <Fab>; rendered above the scroll view. */
  fab?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const scrollRef = useRef<ScrollView>(null);

  // Tapping the tab you are already on scrolls back to the title, where the profile button is.
  useEffect(() => {
    const unsubscribe = (navigation as unknown as { addListener: (e: 'tabPress', cb: () => void) => () => void }).addListener(
      'tabPress',
      () => scrollRef.current?.scrollTo({ y: 0, animated: true }),
    );
    return unsubscribe;
  }, [navigation]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FocusAwareStatusBar />
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + space.lg,
          paddingHorizontal: size.gutter,
          paddingBottom: fab ? size.fab + space.xxxl + space.lg : space.xxxl,
          gap: space.xl,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={!!refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
              progressBackgroundColor={colors.surface}
              progressViewOffset={insets.top}
            />
          ) : undefined
        }
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text variant="title1" numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              // Two lines, not an ellipsis: "Tuesday, October 1…" would read as the wrong date on a narrow screen or a large font.
              <Text variant="small" tone="muted" numberOfLines={2}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {headerActions}
          <ProfileButton />
        </View>
        {children}
      </ScrollView>
      <StatusBarScrim />
      {fab}
    </View>
  );
}
