/** Response shapes of the Worker API (worker/src/routes/*). */

export type Meal = 'breakfast' | 'lunch' | 'snack' | 'dinner';
export type ItemStatus = 'resolved' | 'pending_food' | 'pending_unit';
export type CallKind = 'scheduled' | 'retry' | 'test' | 'manual';
export type CallStatus = 'queued' | 'called' | 'tool_saved' | 'no_list' | 'failed';

export interface NutrientInfo {
  key: string;
  label: string;
  unit: string;
  defaultGoal: number | null;
}

export interface Meta {
  units: string[];
  baseUnits: string[];
  meals: Meal[];
  nutrients: NutrientInfo[];
}

export type NutrientValues = Record<string, number | null>;
export type Totals = Record<string, { value: number; missingItems: number }>;

export interface Profile {
  id: string;
  name: string;
}

export interface CallInfo {
  id: number;
  vapiCallId: string | null;
  localDate: string;
  kind: CallKind | 'unknown';
  status: CallStatus;
  endedReason: string | null;
  durationSeconds: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  transcript?: string | null;
}

export interface Settings {
  id: string;
  name: string;
  timezone: string;
  callTime: string | null;
  callEnabled: boolean;
  vapi: { configured: boolean };
  lastCall: CallInfo | null;
}

export interface Goal {
  key: string;
  label: string;
  unit: string;
  defaultGoal: number | null;
  target: number | null;
  custom: boolean;
}

export interface Item {
  id: string;
  localDate: string;
  meal: Meal | null;
  rawName: string;
  normalizedName: string;
  quantity: number;
  unit: string;
  foodId: string | null;
  foodName: string | null;
  baseUnit: string | null;
  status: ItemStatus;
  source: 'call' | 'manual' | 'import';
  callId: string | null;
  createdAt: string;
  nutrients: NutrientValues;
}

export interface Day {
  date: string;
  items: Item[];
  totals: Totals;
  goals: Record<string, number | null>;
  pendingCount: number;
  calls: CallInfo[];
}

export interface DayRange {
  from: string;
  to: string;
  days: { date: string; itemCount: number; pendingCount: number; totals: Totals }[];
  goals: Record<string, number | null>;
}

export interface Food {
  id: string;
  name: string;
  displayName: string;
  baseUnit: string;
  nutrients: NutrientValues;
  aliases: string[];
  units: { unit: string; servings: number }[];
}

export interface Suggestion {
  foodId: string;
  name: string;
  displayName: string;
  matched: string;
  score: number;
}

export interface UnknownFood {
  normalizedName: string;
  examples: string[];
  units: string[];
  itemCount: number;
  userCount: number;
  suggestions: Suggestion[];
}

export interface MissingUnit {
  foodId: string;
  foodName: string;
  baseUnit: string;
  unit: string;
  itemCount: number;
  userCount: number;
}

export interface Uncached {
  totals: { unknownFoods: number; missingUnits: number };
  unknownFoods: UnknownFood[];
  missingUnits: MissingUnit[];
}

export interface ItemInput {
  name: string;
  quantity: number;
  unit: string;
  meal?: Meal | null;
}

export interface FoodInput {
  displayName: string;
  baseUnit: string;
  nutrients: Record<string, number | null>;
  aliases?: string[];
  units?: { unit: string; servings: number }[];
}

export interface StartCallResponse {
  callId: number;
  localDate: string;
  publicKey: string;
  /** Inline Vapi assistant, passed straight to vapi.start(). */
  assistant: Record<string, unknown>;
}
