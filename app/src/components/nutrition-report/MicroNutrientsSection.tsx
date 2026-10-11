import React from 'react';
import { FlatList } from 'react-native';
import { HStack } from '../ui/hstack';
import { VStack } from '../ui/vstack';
import { Text } from '../ui/text';
import MicroNutrientCard from './MicroNutrientCard';
import { getMicroConfig } from './constants';
import { MicroNutrients } from '@/types/nutrition';

interface MicroNutrientsSectionProps {
  microNutrients: MicroNutrients;
}

const MicroNutrientsSection: React.FC<MicroNutrientsSectionProps> = ({
  microNutrients,
}) => {
  const microData = getMicroConfig(microNutrients);

  return (
    <>
      <VStack className="gap-4 px-6">
        <HStack className="justify-between items-center">
          <Text
            size="md"
            className="font-bold text-gray-800 uppercase tracking-wide"
          >
            Micronutrients
          </Text>
          <Text className="text-xs text-gray-500 font-medium">
            Swipe for more →
          </Text>
        </HStack>
      </VStack>

      {/* FlatList for horizontal scrolling */}
      <FlatList
        horizontal
        data={microData}
        keyExtractor={item => item.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 12 }}
        renderItem={({ item }) => <MicroNutrientCard item={item} />}
      />
    </>
  );
};

export default MicroNutrientsSection;
