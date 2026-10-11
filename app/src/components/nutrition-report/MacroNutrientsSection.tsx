import React from 'react';
import { HStack } from '../ui/hstack';
import { VStack } from '../ui/vstack';
import { Text } from '../ui/text';
import MacroNutrientCard from './MacroNutrientCard';
import { getMacroConfig } from './constants';
import { MacroNutrients } from '@/types/nutrition';

interface MacroNutrientsSectionProps {
  macroNutrients: MacroNutrients;
}

const MacroNutrientsSection: React.FC<MacroNutrientsSectionProps> = ({
  macroNutrients,
}) => {
  const macroConfig = getMacroConfig(
    macroNutrients.protein,
    macroNutrients.carbs,
    macroNutrients.fats,
  );

  return (
    <VStack className="gap-4">
      <HStack className="justify-between items-center">
        <Text
          size="md"
          className="font-bold text-gray-800 uppercase tracking-wide"
        >
          Weekly Macros
        </Text>
        <Text className="text-xs text-gray-500 font-medium">Week so far</Text>
      </HStack>

      {/* 3-Column Grid Layout */}
      <HStack className="gap-3">
        {macroConfig.map(macro => (
          <MacroNutrientCard key={macro.label} macro={macro} />
        ))}
      </HStack>
    </VStack>
  );
};

export default MacroNutrientsSection;
