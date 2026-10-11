import React from 'react';
import { tokens } from '@/theme/tokens';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertCircle,
  BarChart3,
  Home,
  UtensilsCrossed,
} from 'lucide-react-native';

export interface BottomNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

type IconComponent = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

type TabConfig = {
  id: string;
  label: string;
  icon: IconComponent;
};

// Settings is not a tab: like the old app's Profile it opens from the AppBar avatar.
const TABS: TabConfig[] = [
  { id: 'Today', label: 'Today', icon: Home },
  { id: 'Uncached', label: 'Uncached', icon: AlertCircle },
  { id: 'Foods', label: 'Foods', icon: UtensilsCrossed },
  { id: 'Report', label: 'Report', icon: BarChart3 },
];

interface TabItemProps {
  tab: TabConfig;
  isActive: boolean;
  onPress: () => void;
}

const TabItem: React.FC<TabItemProps> = ({ tab, isActive, onPress }) => {
  const Icon = tab.icon;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tabButton,
        isActive && styles.tabButtonActive,
        pressed && styles.tabButtonPressed,
      ]}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      android_ripple={{ color: 'rgba(5,150,105,0.08)', borderless: false }}
    >
      <View style={styles.tabContent}>
        <View style={styles.iconWrap}>
          <Icon
            size={isActive ? 22 : 18}
            color={isActive ? tokens.dashboard.greenDeep : tokens.dashboard.inkMuted}
            strokeWidth={isActive ? 2.8 : 1.8}
          />
        </View>
        <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>
          {tab.label}
        </Text>
      </View>
    </Pressable>
  );
};

const BottomNavigation = ({
  activeTab,
  onTabChange,
}: BottomNavigationProps) => {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrapper, { paddingBottom: bottomInset }]}
    >
      <View style={styles.container}>
        <View style={styles.tabRow}>
          {TABS.map(tab => (
            <TabItem
              key={tab.id}
              tab={tab}
              isActive={activeTab === tab.id}
              onPress={() => onTabChange(tab.id)}
            />
          ))}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    paddingHorizontal: 18,
  },
  container: {
    width: '100%',
    backgroundColor: tokens.dashboard.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: tokens.dashboard.navLine,
    paddingHorizontal: 8,
    paddingVertical: 10,
    shadowColor: tokens.dashboard.ink,
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    elevation: 10,
  },
  tabRow: {
    flexDirection: 'row',
    flex: 1,
    justifyContent: 'space-around',
    alignItems: 'stretch',
  },
  tabButton: {
    flex: 1,
    minHeight: 62,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    overflow: 'hidden',
  },
  tabButtonActive: {},
  tabButtonPressed: {
    opacity: 0.9,
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    color: tokens.dashboard.inkMuted,
    letterSpacing: 0.15,
  },
  labelActive: {
    color: tokens.dashboard.greenDeepest,
    fontSize: 13,
  },
});

export default BottomNavigation;
