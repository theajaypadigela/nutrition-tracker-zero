import type { NavigatorScreenParams } from '@react-navigation/native';
import type { CallKind, Meal } from '@/api/types';

export type TabParamList = {
  Today: undefined;
  Uncached: undefined;
  Foods: undefined;
  Report: undefined;
};

export type RootStackParamList = {
  Profiles: undefined;
  Onboarding: undefined;
  Main: NavigatorScreenParams<TabParamList> | undefined;
  VoiceCall: { kind: CallKind; autoStart?: boolean };
  AddItems: { date: string; callId?: number; meal?: Meal | null };
  FoodEditor: { foodId?: string; name?: string; unitHint?: string };
  FoodPicker: { aliasFor: string };
  UnitConversion: { foodId: string; foodName: string; baseUnit: string; unit: string };
  ReminderHealth: undefined;
  Goals: undefined;
  Settings: undefined;
  WeeklySummary: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
