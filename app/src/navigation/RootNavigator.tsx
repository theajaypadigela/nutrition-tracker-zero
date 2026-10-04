import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AlertCircle, BarChart3, CalendarDays, Salad, Settings as SettingsIcon } from 'lucide-react-native';
import { colors } from '@/theme/colors';
import { useProfile } from '@/state/ProfileContext';
import type { RootStackParamList, TabParamList } from './types';
import ProfilesScreen from '@/screens/ProfilesScreen';
import OnboardingScreen from '@/screens/OnboardingScreen';
import TodayScreen from '@/screens/TodayScreen';
import UncachedScreen from '@/screens/UncachedScreen';
import FoodsScreen from '@/screens/FoodsScreen';
import ReportScreen from '@/screens/ReportScreen';
import SettingsScreen from '@/screens/SettingsScreen';
import VoiceCallScreen from '@/screens/VoiceCallScreen';
import AddItemsScreen from '@/screens/AddItemsScreen';
import EditItemScreen from '@/screens/EditItemScreen';
import FoodEditorScreen from '@/screens/FoodEditorScreen';
import FoodPickerScreen from '@/screens/FoodPickerScreen';
import UnitConversionScreen from '@/screens/UnitConversionScreen';
import ReminderHealthScreen from '@/screens/ReminderHealthScreen';
import GoalsScreen from '@/screens/GoalsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

type TabIconProps = { color: string; size: number };
const TodayIcon = ({ color, size }: TabIconProps) => <CalendarDays color={color} size={size} />;
const UncachedIcon = ({ color, size }: TabIconProps) => <AlertCircle color={color} size={size} />;
const FoodsIcon = ({ color, size }: TabIconProps) => <Salad color={color} size={size} />;
const ReportIcon = ({ color, size }: TabIconProps) => <BarChart3 color={color} size={size} />;
const SettingsTabIcon = ({ color, size }: TabIconProps) => <SettingsIcon color={color} size={size} />;

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarStyle: { borderTopColor: colors.line },
      }}
    >
      <Tab.Screen name="Today" component={TodayScreen} options={{ tabBarIcon: TodayIcon }} />
      <Tab.Screen name="Uncached" component={UncachedScreen} options={{ tabBarIcon: UncachedIcon }} />
      <Tab.Screen name="Foods" component={FoodsScreen} options={{ tabBarIcon: FoodsIcon }} />
      <Tab.Screen name="Report" component={ReportScreen} options={{ tabBarIcon: ReportIcon }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarIcon: SettingsTabIcon }} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const { profile, onboarding } = useProfile();
  return (
    <Stack.Navigator screenOptions={{ headerTintColor: colors.brand, headerTitleStyle: { color: colors.ink }, contentStyle: { backgroundColor: '#f4f7f5' } }}>
      {!profile ? (
        <Stack.Screen name="Profiles" component={ProfilesScreen} options={{ headerShown: false }} />
      ) : onboarding ? (
        <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false }} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
          <Stack.Screen name="VoiceCall" component={VoiceCallScreen} options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }} />
          <Stack.Screen name="AddItems" component={AddItemsScreen} options={{ title: 'Add food' }} />
          <Stack.Screen name="EditItem" component={EditItemScreen} options={{ title: 'Edit item' }} />
          <Stack.Screen name="FoodEditor" component={FoodEditorScreen} options={({ route }) => ({ title: route.params.foodId ? 'Edit food' : 'Enter food values' })} />
          <Stack.Screen name="FoodPicker" component={FoodPickerScreen} options={{ title: 'Same as existing food' }} />
          <Stack.Screen name="UnitConversion" component={UnitConversionScreen} options={{ title: 'Unit conversion' }} />
          <Stack.Screen name="ReminderHealth" component={ReminderHealthScreen} options={{ title: 'Reminder health' }} />
          <Stack.Screen name="Goals" component={GoalsScreen} options={{ title: 'Daily goals' }} />
        </>
      )}
    </Stack.Navigator>
  );
}
