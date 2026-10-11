import React from 'react';
import { tokens } from '@/theme/tokens';
import {
  Apple,
  Droplets,
  Drumstick,
  Cookie,
  Wheat,
  Salad,
} from 'lucide-react-native';
import { MacroNutrient } from '@/types/nutrition';

type NutrientInput = { current: number; goal: number; weeklyGoal?: number };

type MicroStatus = { status: string; statusBg: string; statusColor: string };

const GOOD: MicroStatus = {
  status: 'Good ✓',
  statusBg: tokens.micro.statusGoodSurface,
  statusColor: tokens.micro.statusGoodText,
};

const warnStatus = (status: string): MicroStatus => ({
  status,
  statusBg: tokens.micro.statusWarnSurface,
  statusColor: tokens.micro.statusWarnText,
});

/**
 * The old cards hard-coded "Good ✓" / "Moderate" / "High". These are the same chips,
 * picked from intake vs the goal so far: limits (sugar, sodium) go "High" past the goal,
 * targets (fiber) go "Low" under 80 %.
 */
function microStatus(n: NutrientInput, kind: 'limit' | 'target'): MicroStatus {
  if (!(n.goal > 0)) return warnStatus('No goal');
  const pct = n.current / n.goal;
  if (kind === 'limit') return pct <= 1 ? GOOD : pct <= 1.15 ? warnStatus('Moderate') : warnStatus('High');
  return pct >= 1 ? GOOD : pct >= 0.8 ? warnStatus('Moderate') : warnStatus('Low');
}

export const getMacroConfig = (
  protein: NutrientInput,
  carbs: NutrientInput,
  fats: NutrientInput,
): MacroNutrient[] => [
  {
    label: 'Protein',
    current: protein.current,
    goal: protein.goal,
    weeklyGoal: protein.weeklyGoal,
    unit: 'g',
    icon: <Drumstick size={24} color={tokens.macro.protein} />,
    color: tokens.macro.protein,
    bgColor: 'bg-blue-50',
    progressColor: 'bg-blue-500',
    progressBgColor: 'bg-blue-200',
    textColor: 'text-blue-600',
    borderColor: 'border-blue-100',
  },
  {
    label: 'Carbs',
    current: carbs.current,
    goal: carbs.goal,
    weeklyGoal: carbs.weeklyGoal,
    unit: 'g',
    icon: <Apple size={24} color={tokens.macro.carbs} />,
    color: tokens.macro.carbs,
    bgColor: 'bg-amber-50',
    progressColor: 'bg-amber-500',
    progressBgColor: 'bg-amber-200',
    textColor: 'text-amber-600',
    borderColor: 'border-amber-100',
  },
  {
    label: 'Fats',
    current: fats.current,
    goal: fats.goal,
    weeklyGoal: fats.weeklyGoal,
    unit: 'g',
    icon: <Droplets size={24} color={tokens.macro.fats} />,
    color: tokens.macro.fats,
    bgColor: 'bg-purple-50',
    progressColor: 'bg-purple-500',
    progressBgColor: 'bg-purple-200',
    textColor: 'text-purple-600',
    borderColor: 'border-purple-100',
  },
];

export const getMicroConfig = (microNutrients: {
  sugar: NutrientInput;
  fiber: NutrientInput;
  sodium: NutrientInput;
}) => [
  {
    key: 'sugar',
    label: 'Sugar',
    current: microNutrients.sugar.current,
    goal: microNutrients.sugar.goal,
    weeklyGoal: microNutrients.sugar.weeklyGoal,
    unit: 'g',
    icon: <Cookie size={20} color={tokens.micro.sugar} />,
    iconBg: tokens.micro.sugarSurface,
    color: tokens.micro.sugarDeep,
    ...microStatus(microNutrients.sugar, 'limit'),
  },
  {
    key: 'fiber',
    label: 'Fiber',
    current: microNutrients.fiber.current,
    goal: microNutrients.fiber.goal,
    weeklyGoal: microNutrients.fiber.weeklyGoal,
    unit: 'g',
    icon: <Wheat size={20} color={tokens.micro.fiber} />,
    iconBg: tokens.micro.fiberSurface,
    color: tokens.micro.fiberDeep,
    ...microStatus(microNutrients.fiber, 'target'),
  },
  {
    key: 'sodium',
    label: 'Sodium',
    current: microNutrients.sodium.current,
    goal: microNutrients.sodium.goal,
    weeklyGoal: microNutrients.sodium.weeklyGoal,
    unit: 'mg',
    icon: <Salad size={20} color={tokens.micro.sodium} />,
    iconBg: tokens.micro.sodiumSurface,
    color: tokens.micro.sodiumDeep,
    ...microStatus(microNutrients.sodium, 'limit'),
  },
];
