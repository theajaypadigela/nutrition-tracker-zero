import type { NavigatorScreenParams } from '@react-navigation/native';
import type { CallKind, Meal } from '@/api/types';
import type { AddedFood } from '@/utils/foodChoices';

export type TabParamList = {
  /** `date` opens that day (from an insight about it): YYYY-MM-DD. */
  Today: { date?: string } | undefined;
  Uncached: undefined;
  Foods: undefined;
  Report: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Onboarding: undefined;
  Main: NavigatorScreenParams<TabParamList> | undefined;
  VoiceCall: { kind: CallKind; autoStart?: boolean };
  /** `meal` is where the log starts (the time of day decides when it is not given). `addedFood` is a food just made in the food form. */
  AddItems: { date: string; callId?: number; meal?: Meal | null; addedFood?: AddedFood };
  /** `forLog`: opened from the log screen of that day; after saving, go back to it with the new food to log. */
  FoodEditor: { foodId?: string; name?: string; unitHint?: string; forLog?: { date: string } };
  FoodPicker: { aliasFor: string };
  UnitConversion: { foodId: string; foodName: string; baseUnit: string; unit: string };
  ReminderHealth: undefined;
  /** `careTeam`: type the numbers a doctor or dietitian gave, for a profile without personal targets (plan 6.7). */
  Goals: { careTeam?: boolean } | undefined;
  Settings: undefined;
  WeeklySummary: { start?: string } | undefined;
  /** One nutrient over its window; `window` is `four_weeks` for a vitamin judged over four weeks. */
  Nutrient: { key: string; start: string; window?: 'week' | 'four_weeks' };
  /**
   * The logged items that add up to one nutrient's total, from `from` to `to` (YYYY-MM-DD; one day is the same date twice). `origin` is the
   * dashboard it was opened from, so the total reads the way that dashboard writes it.
   */
  NutrientBreakdown: { nutrient: string; from: string; to: string; origin?: 'today' | 'report' };
  // ---- personal targets (WEEKLY_BREAKDOWN_PLAN.md 3.5, 9.4)
  Reauthenticate: undefined;
  HealthIntro: undefined;
  SafetyCheck: undefined;
  AboutYou: undefined;
  Activity: undefined;
  HealthGoal: undefined;
  Pattern: undefined;
  HealthReview: undefined;
  ReferenceOnly: undefined;
  Under19: undefined;
  Targets: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
