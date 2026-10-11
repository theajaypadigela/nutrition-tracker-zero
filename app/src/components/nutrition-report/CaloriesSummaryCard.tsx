import React from 'react';
import { View } from 'react-native';
import { HStack } from '../ui/hstack';
import { VStack } from '../ui/vstack';
import { Text } from '../ui/text';

interface CaloriesSummaryCardProps {
  caloriesSoFar: number;
  proratedGoal: number;
  weeklyGoal: number;
  daysElapsed: number;
}

const CaloriesSummaryCard: React.FC<CaloriesSummaryCardProps> = ({
  caloriesSoFar,
  proratedGoal,
  weeklyGoal,
  daysElapsed,
}) => {
  const safeProratedGoal = proratedGoal > 0 ? proratedGoal : 1;
  const percentage = Math.round((caloriesSoFar / safeProratedGoal) * 100);
  const progressWidth = Math.max(0, Math.min(percentage, 100));

  return (
    <VStack className="bg-emerald-600 rounded-2xl p-6 gap-3">
      <HStack className="justify-between items-center">
        <Text
          size="sm"
          className="text-white opacity-90 font-medium uppercase tracking-wide"
        >
          This Week so far
        </Text>
        <Text size="xs" className="text-white opacity-80">
          Day {daysElapsed} of 7
        </Text>
      </HStack>
      <HStack className="items-end gap-2">
        <Text className="text-5xl font-bold text-white">
          {caloriesSoFar.toLocaleString()}
        </Text>
        <Text className="text-2xl text-white opacity-80 mb-2">kcal</Text>
      </HStack>
      <HStack className="items-center gap-2">
        <View className="flex-1 h-2 bg-white/20 rounded-full overflow-hidden">
          <View
            className="h-full bg-white rounded-full"
            style={{
              width: `${progressWidth}%`,
            }}
          />
        </View>
        <Text className="text-white text-sm">
          {percentage}% of {proratedGoal.toLocaleString()}
        </Text>
      </HStack>
      <Text size="xs" className="text-white opacity-80">
        Weekly target: {weeklyGoal.toLocaleString()} kcal
      </Text>
    </VStack>
  );
};

export default CaloriesSummaryCard;
