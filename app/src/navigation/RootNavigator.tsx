import React, { useEffect } from 'react';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TabBar } from '@/components/layout/TabBar';
import { useProfile } from '@/state/ProfileContext';
import { useTheme } from '@/theme';
import type { RootStackParamList, TabParamList } from './types';
import LoginScreen, { ReauthenticateScreen } from '@/screens/LoginScreen';
import RegisterScreen from '@/screens/RegisterScreen';
import OnboardingScreen from '@/screens/OnboardingScreen';
import TodayScreen from '@/screens/TodayScreen';
import UncachedScreen from '@/screens/UncachedScreen';
import FoodsScreen from '@/screens/FoodsScreen';
import ReportScreen from '@/screens/ReportScreen';
import WeeklySummaryScreen from '@/screens/WeeklySummaryScreen';
import NutrientScreen from '@/screens/NutrientScreen';
import NutrientBreakdownScreen from '@/screens/NutrientBreakdownScreen';
import SettingsScreen from '@/screens/SettingsScreen';
import VoiceCallScreen from '@/screens/VoiceCallScreen';
import AddItemsScreen from '@/screens/AddItemsScreen';
import FoodEditorScreen from '@/screens/FoodEditorScreen';
import FoodPickerScreen from '@/screens/FoodPickerScreen';
import UnitConversionScreen from '@/screens/UnitConversionScreen';
import ReminderHealthScreen from '@/screens/ReminderHealthScreen';
import GoalsScreen from '@/screens/GoalsScreen';
import TargetsScreen from '@/screens/TargetsScreen';
import HealthIntroScreen from '@/screens/profile/HealthIntroScreen';
import SafetyCheckScreen from '@/screens/profile/SafetyCheckScreen';
import AboutYouScreen from '@/screens/profile/AboutYouScreen';
import ActivityScreen from '@/screens/profile/ActivityScreen';
import GoalStepScreen from '@/screens/profile/GoalStepScreen';
import PatternScreen from '@/screens/profile/PatternScreen';
import ReviewScreen from '@/screens/profile/ReviewScreen';
import { ReferenceOnlyScreen, Under19Screen } from '@/screens/profile/EndScreens';
import { navigationRef } from './ref';

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
  const { profile, onboarding, healthIntroPending, consumeHealthIntro } = useProfile();
  const { colors } = useTheme();

  // A new profile, once its call is set up, is offered personal targets once. Skipping is safe: a card stays on Today.
  useEffect(() => {
    if (!profile || onboarding || !healthIntroPending) return undefined;
    const timer = setTimeout(() => {
      consumeHealthIntro();
      if (navigationRef.isReady()) navigationRef.navigate('HealthIntro');
    }, 400);
    return () => clearTimeout(timer);
  }, [profile, onboarding, healthIntroPending, consumeHealthIntro]);

  // Every screen draws its own header (see StackScreen / TabScreen), so the stack has none.
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      {!profile ? (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
        </>
      ) : onboarding ? (
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen
            name="VoiceCall"
            component={VoiceCallScreen}
            // A call that was answered (or opened from a notification) takes over at once, so nothing slides in under the lock screen.
            options={({ route }) => ({
              presentation: 'fullScreenModal',
              gestureEnabled: false,
              animation: route.params?.autoStart ? 'none' : 'default',
            })}
          />
          <Stack.Screen name="AddItems" component={AddItemsScreen} />
          <Stack.Screen name="FoodEditor" component={FoodEditorScreen} />
          <Stack.Screen name="FoodPicker" component={FoodPickerScreen} />
          <Stack.Screen name="UnitConversion" component={UnitConversionScreen} />
          <Stack.Screen name="ReminderHealth" component={ReminderHealthScreen} />
          <Stack.Screen name="Goals" component={GoalsScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="WeeklySummary" component={WeeklySummaryScreen} />
          <Stack.Screen name="Nutrient" component={NutrientScreen} />
          <Stack.Screen name="NutrientBreakdown" component={NutrientBreakdownScreen} />
          <Stack.Screen name="Targets" component={TargetsScreen} />
          <Stack.Screen name="Reauthenticate" component={ReauthenticateScreen} />
          <Stack.Screen name="HealthIntro" component={HealthIntroScreen} />
          <Stack.Screen name="SafetyCheck" component={SafetyCheckScreen} />
          <Stack.Screen name="AboutYou" component={AboutYouScreen} />
          <Stack.Screen name="Activity" component={ActivityScreen} />
          <Stack.Screen name="HealthGoal" component={GoalStepScreen} />
          <Stack.Screen name="Pattern" component={PatternScreen} />
          <Stack.Screen name="HealthReview" component={ReviewScreen} />
          <Stack.Screen name="ReferenceOnly" component={ReferenceOnlyScreen} />
          <Stack.Screen name="Under19" component={Under19Screen} />
        </>
      )}
    </Stack.Navigator>
  );
}
