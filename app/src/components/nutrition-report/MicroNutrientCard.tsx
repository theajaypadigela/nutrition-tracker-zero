import React from 'react';
import { tokens } from '@/theme/tokens';
import { View } from 'react-native';
import { HStack } from '../ui/hstack';
import { VStack } from '../ui/vstack';
import { Text } from '../ui/text';
import { MicroNutrient } from '@/types/nutrition';

interface MicroNutrientCardProps {
  item: MicroNutrient;
}

const MicroNutrientCard: React.FC<MicroNutrientCardProps> = ({ item }) => {
  const safeCurrent = Number.isFinite(item.current) ? item.current : 0;
  const safeGoal = Number.isFinite(item.goal) && item.goal > 0 ? item.goal : 1;
  const percentage = Math.round((safeCurrent / safeGoal) * 100);

  return (
    <View
      style={{
        width: 160,
        backgroundColor: tokens.report.surface,
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: tokens.report.cardLineNeutral,
        gap: 12,
      }}
    >
      <HStack className="justify-between items-start">
        <View
          style={{
            backgroundColor: item.iconBg,
            borderRadius: 999,
            padding: 8,
          }}
        >
          {item.icon}
        </View>
        <View
          style={{
            backgroundColor: item.iconBg,
            borderRadius: 999,
            paddingHorizontal: 10,
            paddingVertical: 4,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: item.color }}>
            {percentage}%
          </Text>
        </View>
      </HStack>

      <VStack className="gap-1">
        <Text className="text-xs text-gray-500 font-medium uppercase">
          {item.label}
        </Text>
        <HStack className="items-end gap-1">
          <Text className="text-3xl font-bold text-gray-900">
            {safeCurrent}
          </Text>
          <Text className="text-sm text-gray-500 mb-1">{item.unit}</Text>
        </HStack>
        <Text className="text-xs text-gray-400">
          Goal so far: {item.goal}
          {item.unit}
        </Text>
        {item.weeklyGoal ? (
          <Text className="text-[10px] text-gray-400">
            Weekly target: {item.weeklyGoal}
            {item.unit}
          </Text>
        ) : null}
      </VStack>

      <View
        style={{
          backgroundColor: item.statusBg,
          borderRadius: 999,
          paddingHorizontal: 12,
          paddingVertical: 4,
          alignSelf: 'flex-start',
        }}
      >
        <Text
          style={{
            fontSize: 12,
            fontWeight: '600',
            color: item.statusColor,
          }}
        >
          {item.status}
        </Text>
      </View>
    </View>
  );
};

export default MicroNutrientCard;
