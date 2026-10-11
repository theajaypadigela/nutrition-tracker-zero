import React from 'react';
import { View } from 'react-native';
import { HStack } from '../ui/hstack';
import { VStack } from '../ui/vstack';
import { Text } from '../ui/text';
import { MacroNutrient } from '@/types/nutrition';

interface MacroNutrientCardProps {
  macro: MacroNutrient;
}

const MacroNutrientCard: React.FC<MacroNutrientCardProps> = ({ macro }) => {
  const safeCurrent = Number.isFinite(macro.current) ? macro.current : 0;
  const safeGoal = Number.isFinite(macro.goal) && macro.goal > 0 ? macro.goal : 1;
  const percentage = Math.round((safeCurrent / safeGoal) * 100);
  const progressWidth = Math.max(0, Math.min(percentage, 140));

  return (
    <VStack
      className={`flex-1 ${macro.bgColor} rounded-2xl p-4 gap-2 border ${macro.borderColor}`}
    >
      {macro.icon}
      <VStack className="gap-1">
        <Text className={`text-xs ${macro.textColor} font-medium uppercase`}>
          {macro.label}
        </Text>
        <HStack className="items-end gap-1">
          <Text
            className={`text-2xl font-bold ${macro.textColor}`}
          >
            {safeCurrent}
          </Text>
          <Text className={`text-sm ${macro.textColor} mb-1`}>
            {macro.unit}
          </Text>
        </HStack>
      </VStack>
      {/* Mini Progress Bar */}
      <View
        className={`w-full h-1.5 ${macro.progressBgColor} rounded-full overflow-hidden`}
      >
        <View
          className={`h-full ${macro.progressColor} rounded-full`}
          style={{
            width: `${progressWidth}%`,
          }}
        />
      </View>
      <Text className={`text-xs ${macro.textColor}`}>
        {percentage}% of {macro.goal}
        {macro.unit} so far
      </Text>
      {macro.weeklyGoal ? (
        <Text className={`text-[10px] ${macro.textColor} opacity-70`}>
          Weekly target: {macro.weeklyGoal}
          {macro.unit}
        </Text>
      ) : null}
    </VStack>
  );
};

export default MacroNutrientCard;
