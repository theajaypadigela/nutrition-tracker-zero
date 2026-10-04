import type { CallKind, Item } from '@/api/types';

export type RootStackParamList = {
  Profiles: undefined;
  Onboarding: undefined;
  Main: undefined;
  VoiceCall: { kind: CallKind; autoStart?: boolean };
  AddItems: { date: string; callId?: number };
  EditItem: { item: Item };
  FoodEditor: { foodId?: string; name?: string; unitHint?: string };
  FoodPicker: { aliasFor: string };
  UnitConversion: { foodId: string; foodName: string; baseUnit: string; unit: string };
  ReminderHealth: undefined;
  Goals: undefined;
};

export type TabParamList = {
  Today: undefined;
  Uncached: undefined;
  Foods: undefined;
  Report: undefined;
  Settings: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
