import { buildIndex, type Food } from '../../src/domain/match';
import { emptyNutrients, type NutrientValues } from '../../src/domain/nutrients';
import type { BaseUnit } from '../../src/domain/units';

export function food(id: string, name: string, baseUnit: BaseUnit, nutrients: Partial<NutrientValues>): Food {
  return { id, name, displayName: name, baseUnit, nutrients: { ...emptyNutrients(), ...nutrients } };
}

export function sampleIndex() {
  return buildIndex(
    [
      food('rice', 'rice', '100 g', { calories: 130, protein: 2.7, carbs: 28 }),
      food('idli', 'idli', 'piece', { calories: 39, protein: 2 }),
      food('dal', 'dal', 'katori', { calories: 150, protein: 9, fiber: 4 }),
      food('milk', 'milk', '100 ml', { calories: 60 }),
    ],
    [
      { alias: 'chawal', food_id: 'rice' },
      { alias: 'steamed rice', food_id: 'rice' },
      { alias: 'toor dal', food_id: 'dal' },
    ],
    [
      { food_id: 'rice', unit: 'katori', servings: 1.5 },
      { food_id: 'idli', unit: 'g', servings: 1 / 40 },
    ],
  );
}
