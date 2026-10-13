import React from 'react';
import { Pressable, View } from 'react-native';
import { Cookie, Moon, Sun, Sunrise, type LucideIcon } from 'lucide-react-native';
import type { Meal } from '@/api/types';
import { Icon, Text } from '@/components/kit';
import { strings } from '@/i18n/strings';
import { createStyles, radius, space, useTheme } from '@/theme';
import { capitalize } from '@/utils/format';

const MEAL_ICON: Record<Meal, LucideIcon> = { breakfast: Sunrise, lunch: Sun, snack: Cookie, dinner: Moon };

const useStyles = createStyles(() => ({
  row: { flexDirection: 'row', gap: space.sm },
  tile: {
    flex: 1,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingHorizontal: space.xs,
    borderRadius: radius.md,
    borderWidth: 1,
  },
}));

/**
 * The meal being logged, as four tiles in a row: an icon over its name, one chosen (or none: tap the chosen one again, and the food is
 * listed under Other). It is the first thing on the log screen because the suggestions below depend on it. Selected is the accent tint
 * and outline, as a chip is; the name says it too, never colour alone.
 */
export function MealTiles({ meals, value, onChange }: { meals: readonly Meal[]; value: Meal | null; onChange: (meal: Meal | null) => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {meals.map(meal => {
        const selected = meal === value;
        return (
          <Pressable
            key={meal}
            testID={`meal-${meal}`}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={capitalize(meal)}
            accessibilityHint={selected ? strings.log.mealClear : undefined}
            onPress={() => onChange(selected ? null : meal)}
            style={[
              styles.tile,
              { backgroundColor: selected ? colors.primarySoft : colors.surface, borderColor: selected ? colors.primary : colors.borderStrong },
            ]}
          >
            <Icon as={MEAL_ICON[meal]} size="md" tone={selected ? 'primary' : 'muted'} />
            <Text variant={selected ? 'smallStrong' : 'small'} tone={selected ? 'primary' : 'secondary'} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {capitalize(meal)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
