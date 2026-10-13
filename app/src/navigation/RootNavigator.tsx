import React from 'react';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TabBar } from '@/components/layout/TabBar';
import { useProfile } from '@/state/ProfileContext';
import { useTheme } from '@/theme';
import type { RootStackParamList, TabParamList } from './types';
import ProfilesScreen from '@/screens/ProfilesScreen';
import OnboardingScreen from '@/screens/OnboardingScreen';
import TodayScreen from '@/screens/TodayScreen';
import UncachedScreen from '@/screens/UncachedScreen';
import FoodsScreen from '@/screens/FoodsScreen';
import ReportScreen from '@/screens/ReportScreen';
import WeeklySummaryScreen from '@/screens/WeeklySummaryScreen';
import SettingsScreen from '@/screens/SettingsScreen';
import VoiceCallScreen from '@/screens/VoiceCallScreen';
import AddItemsScreen from '@/screens/AddItemsScreen';
import FoodEditorScreen from '@/screens/FoodEditorScreen';
import FoodPickerScreen from '@/screens/FoodPickerScreen';
import UnitConversionScreen from '@/screens/UnitConversionScreen';
import ReminderHealthScreen from '@/screens/ReminderHealthScreen';
import GoalsScreen from '@/screens/GoalsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const renderTabBar = (props: BottomTabBarProps) => <TabBar {...props} />;

function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }} tabBar={renderTabBar}>
      <Tab.Screen name="Today" component={TodayScreen} />
      <Tab.Screen name="Uncached" component={UncachedScreen} />
      <Tab.Screen name="Foods" component={FoodsScreen} />
      <Tab.Screen name="Report" component={ReportScreen} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const { profile, onboarding } = useProfile();
  const { colors } = useTheme();
  // Every screen draws its own header (see StackScreen / TabScreen), so the stack has none.
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      {!profile ? (
        <Stack.Screen name="Profiles" component={ProfilesScreen} />
      ) : onboarding ? (
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen
            name="VoiceCall"
            component={VoiceCallScreen}
            options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
          />
          <Stack.Screen name="AddItems" component={AddItemsScreen} />
          <Stack.Screen name="FoodEditor" component={FoodEditorScreen} />
          <Stack.Screen name="FoodPicker" component={FoodPickerScreen} />
          <Stack.Screen name="UnitConversion" component={UnitConversionScreen} />
          <Stack.Screen name="ReminderHealth" component={ReminderHealthScreen} />
          <Stack.Screen name="Goals" component={GoalsScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="WeeklySummary" component={WeeklySummaryScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}
