import React, { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Apple, BarChart3, ClipboardList, Home, type LucideIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, Text } from '@/components/kit';
import { useKeyboardHeight } from '@/hooks/useKeyboard';
import { refreshPendingTotal, usePendingTotal } from '@/state/pendingStore';
import { createStyles, hairline, radius, size, useTheme } from '@/theme';

const TABS: Record<string, { label: string; icon: LucideIcon }> = {
  Today: { label: 'Today', icon: Home },
  // The route is still "Uncached"; people see "Pending".
  Uncached: { label: 'Pending', icon: ClipboardList },
  Foods: { label: 'Foods', icon: Apple },
  Report: { label: 'Report', icon: BarChart3 },
};

const useStyles = createStyles(({ colors }) => ({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
  },
  tab: { flex: 1, height: size.tabBar, alignItems: 'center', justifyContent: 'center', gap: 3 },
  iconWrap: { alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

/**
 * A flat bar in normal layout, so screens end above it instead of scrolling underneath. The
 * active tab is the accent colour; the Pending tab carries the count of things waiting.
 */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const pending = usePendingTotal();

  // Coming back to any tab is the moment the count may have changed.
  useEffect(() => {
    refreshPendingTotal();
  }, [state.index]);

  if (keyboardHeight > 0) return null;

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
      {state.routes.map((route, index) => {
        const tab = TABS[route.name];
        if (!tab) return null;
        const active = state.index === index;
        const showBadge = route.name === 'Uncached' && pending > 0;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={showBadge ? `${tab.label}, ${pending} waiting` : tab.label}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!active && !event.defaultPrevented) navigation.navigate(route.name);
            }}
            android_ripple={{ color: colors.ripple, borderless: true, radius: 40 }}
            style={styles.tab}
          >
            <View style={styles.iconWrap}>
              <Icon as={tab.icon} size="lg" tone={active ? 'primary' : 'muted'} strokeWidth={active ? 2.1 : 1.75} />
              {showBadge ? (
                <View style={styles.badge}>
                  <Text variant="micro" tabular style={{ color: colors.onDanger }}>
                    {pending > 99 ? '99+' : pending}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text variant="micro" tone={active ? 'primary' : 'muted'}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
