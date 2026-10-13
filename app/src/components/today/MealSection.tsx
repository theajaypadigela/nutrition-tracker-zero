import React from 'react';
import { Pressable, View } from 'react-native';
import { Cookie, Mic, Moon, Plus, Sun, Sunrise, Utensils, type LucideIcon } from 'lucide-react-native';
import type { Item, Meal } from '@/api/types';
import { Badge, Card, Divider, Icon, Text } from '@/components/kit';
import { createStyles, space, useTheme } from '@/theme';
import { capitalize, formatAmount, formatQuantity } from '@/utils/format';

const MEAL_ICON: Record<string, LucideIcon> = {
  breakfast: Sunrise,
  lunch: Sun,
  snack: Cookie,
  dinner: Moon,
};

const PENDING_LABEL: Record<Item['status'], string> = {
  resolved: '',
  pending_food: 'Unknown food',
  pending_unit: 'Unknown unit',
};

const useStyles = createStyles(() => ({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md + 2 },
  headerTitle: { flex: 1 },
  total: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  itemBody: { flex: 1, minWidth: 0, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  add: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, height: 48 },
}));

/**
 * One meal's foods in a card: the meal and its calories on top, each food as a row you tap
 * to edit, and an add row at the bottom that already knows the meal.
 */
export function MealSection({
  meal,
  items,
  onEdit,
  onAdd,
}: {
  /** null groups items logged without a meal ("Other"). */
  meal: Meal | null;
  items: Item[];
  onEdit: (item: Item) => void;
  onAdd: (meal: Meal | null) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  if (items.length === 0) return null;

  const name = meal ? capitalize(meal) : 'Other';
  const total = Math.round(items.reduce((sum, item) => sum + (item.nutrients.calories ?? 0), 0));

  return (
    <Card padding="none" testID={`meal-${meal ?? 'other'}`}>
      <View style={styles.header}>
        <Icon as={MEAL_ICON[meal ?? ''] ?? Utensils} size="md" tone="muted" />
        <Text variant="bodyStrong" style={styles.headerTitle}>
          {name}
        </Text>
        <View style={styles.total}>
          <Text variant="bodyStrong" tabular>
            {total}
          </Text>
          <Text variant="small" tone="muted">
            kcal
          </Text>
        </View>
      </View>

      {items.map(item => {
        const { protein, carbs, fat, calories } = item.nutrients;
        const pending = item.status !== 'resolved';
        const alsoKnownAs =
          item.foodName && item.foodName.toLowerCase() !== item.rawName.toLowerCase() ? ` · ${item.foodName}` : '';
        const macros = [
          protein != null ? `P ${formatAmount(protein)}g` : null,
          carbs != null ? `C ${formatAmount(carbs)}g` : null,
          fat != null ? `F ${formatAmount(fat)}g` : null,
        ]
          .filter(Boolean)
          .join(' · ');

        return (
          <React.Fragment key={item.id}>
            <Divider />
            <Pressable
              onPress={() => onEdit(item)}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${item.rawName}`}
              android_ripple={{ color: colors.ripple }}
              style={styles.item}
            >
              <View style={styles.itemBody}>
                <View style={styles.nameRow}>
                  <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {item.rawName}
                  </Text>
                  {item.source === 'call' ? (
                    <View accessible accessibilityLabel="Logged by voice">
                      <Icon as={Mic} size={13} tone="faint" />
                    </View>
                  ) : null}
                </View>
                <Text variant="small" tone="secondary" numberOfLines={1}>
                  {formatQuantity(item.quantity, item.unit)}
                  {alsoKnownAs}
                </Text>
                {pending ? (
                  <View style={{ gap: 4, marginTop: 2 }}>
                    <Badge label={PENDING_LABEL[item.status]} tone="warning" />
                    <Text variant="caption" tone="warning">
                      Not counted until someone adds its values
                    </Text>
                  </View>
                ) : macros ? (
                  <Text variant="caption" tone="muted">
                    {macros}
                  </Text>
                ) : null}
              </View>
              {!pending && calories != null ? (
                <View style={styles.total}>
                  <Text variant="bodyStrong" tabular>
                    {Math.round(calories)}
                  </Text>
                  <Text variant="small" tone="muted">
                    kcal
                  </Text>
                </View>
              ) : (
                <Text variant="bodyStrong" tone="faint">
                  —
                </Text>
              )}
            </Pressable>
          </React.Fragment>
        );
      })}

      <Divider />
      <Pressable
        onPress={() => onAdd(meal)}
        accessibilityRole="button"
        accessibilityLabel={`Add to ${name.toLowerCase()}`}
        android_ripple={{ color: colors.ripple }}
        style={styles.add}
      >
        <Icon as={Plus} size="md" tone="primary" />
        <Text variant="smallStrong" tone="primary">
          Add to {name.toLowerCase()}
        </Text>
      </Pressable>
    </Card>
  );
}
