import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from '../ui/text';
import { ChevronDown, Edit2, Trash2, Plus, Zap, AlertCircle } from 'lucide-react-native';
import type { Item, Meal } from '@/api/types';
import { capitalize, formatQuantity } from '@/utils/format';
import { tokens } from '@/theme/tokens';

const T = tokens.foodLog;

/** [surface, ink] tint pair per meal slot. */
const MEAL_TINTS: Record<string, [string, string]> = {
  breakfast: [T.amberSoft, T.amber],
  lunch: [T.greenSoft, T.good],
  snacks: [T.purpleSoft, T.purple],
  snack: [T.purpleSoft, T.purple],
  dinner: [T.blueSoft, T.blue],
};

const MEAL_ICONS: Record<string, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  snacks: '🍪',
  snack: '🍪',
  dinner: '🌙',
};

const PENDING_LABEL: Record<Item['status'], string> = {
  resolved: '',
  pending_food: 'UNKNOWN FOOD',
  pending_unit: 'UNKNOWN UNIT',
};

interface MealGroupProps {
  /** null groups items logged without a meal ("Other"). */
  meal: Meal | null;
  items: Item[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: (item: Item) => void;
  onDelete: (item: Item) => void;
  onAdd?: (meal: Meal | null) => void;
}

export const MealGroup: React.FC<MealGroupProps> = ({
  meal,
  items,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onAdd,
}) => {
  if (items.length === 0) return null;

  const key = meal ?? 'other';
  const tint = MEAL_TINTS[key] ?? [T.lineSoft, T.inkSoft];
  const icon = MEAL_ICONS[key] ?? '🍽️';
  const mealCalories = items.reduce((sum, item) => sum + (item.nutrients.calories ?? 0), 0);
  const displayName = meal ? capitalize(meal) : 'Other';

  return (
    <View style={styles.card}>
      {/* header */}
      <TouchableOpacity
        onPress={onToggleExpand}
        style={styles.header}
        activeOpacity={0.7}
      >
        <View style={[styles.mealIcon, { backgroundColor: tint[0] }]}>
          <Text style={styles.mealEmoji}>{icon}</Text>
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.mealName}>{displayName}</Text>
          <Text style={styles.mealMeta} numberOfLines={1}>
            {items.length} {items.length === 1 ? 'item' : 'items'} ·{' '}
            {Math.round(mealCalories)} cal
          </Text>
        </View>

        <View style={styles.headerRight}>
          <View style={{ alignItems: 'flex-end', marginRight: 6 }}>
            <Text style={[styles.calCount, { color: tint[1] }]}>
              {Math.round(mealCalories)}
            </Text>
            <Text style={styles.calUnit}>KCAL</Text>
          </View>
          <View
            style={{
              transform: [{ rotate: isExpanded ? '180deg' : '0deg' }],
            }}
          >
            <ChevronDown size={18} color={T.inkMuted} strokeWidth={2.2} />
          </View>
        </View>
      </TouchableOpacity>

      {/* expanded items */}
      {isExpanded && (
        <View style={styles.body}>
          <View style={styles.divider} />
          <View style={styles.itemList}>
            {items.map(item => {
              const { protein, carbs, fat, calories } = item.nutrients;
              const hasMacros = protein != null || carbs != null || fat != null;
              const pending = item.status !== 'resolved';
              const alsoKnownAs =
                item.foodName && item.foodName.toLowerCase() !== item.rawName.toLowerCase()
                  ? ` · ${item.foodName}`
                  : '';

              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.item}
                  activeOpacity={0.8}
                  onPress={() => onEdit(item)}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    {/* name + badges */}
                    <View style={styles.itemNameRow}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {item.rawName}
                      </Text>
                      {item.source === 'call' && (
                        <View style={styles.aiBadge}>
                          <Zap size={8} color={T.purple} fill={T.purple} />
                          <Text style={styles.aiBadgeText}>AI LOGGED</Text>
                        </View>
                      )}
                      {pending && (
                        <View style={[styles.aiBadge, { backgroundColor: T.warnSoft }]}>
                          <AlertCircle size={9} color={T.warn} strokeWidth={2.6} />
                          <Text style={[styles.aiBadgeText, { color: T.warn }]}>
                            {PENDING_LABEL[item.status]}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* qty + cal */}
                    <Text style={styles.itemMeta}>
                      {formatQuantity(item.quantity, item.unit)}
                      {alsoKnownAs}
                      {calories != null && !pending ? ` · ${Math.round(calories)} cal` : ''}
                    </Text>

                    {/* macros */}
                    {hasMacros && !pending && (
                      <Text style={styles.itemMacros}>
                        {protein != null && `P ${fmtG(protein)}g`}
                        {protein != null && carbs != null && ' · '}
                        {carbs != null && `C ${fmtG(carbs)}g`}
                        {carbs != null && fat != null && ' · '}
                        {fat != null && `F ${fmtG(fat)}g`}
                      </Text>
                    )}
                    {pending && (
                      <Text style={styles.itemMacros}>Not counted until someone adds its values</Text>
                    )}
                  </View>

                  {/* action buttons */}
                  <View style={styles.actions}>
                    <TouchableOpacity
                      onPress={() => onEdit(item)}
                      style={[styles.miniBtn, { backgroundColor: T.blueSoft }]}
                      activeOpacity={0.7}
                      accessibilityLabel={`Edit ${item.rawName}`}
                    >
                      <Edit2 size={15} color={T.blue} strokeWidth={2} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => onDelete(item)}
                      style={[styles.miniBtn, { backgroundColor: T.lowSoft }]}
                      activeOpacity={0.7}
                      accessibilityLabel={`Delete ${item.rawName}`}
                    >
                      <Trash2 size={15} color={T.low} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* add button */}
          {onAdd && (
            <TouchableOpacity
              onPress={() => onAdd(meal)}
              style={styles.addBtn}
              activeOpacity={0.7}
            >
              <Plus size={15} color={T.green} strokeWidth={2.4} />
              <Text style={styles.addBtnText}>
                Add to {displayName.toLowerCase()}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

function fmtG(v: number): string {
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return (Math.round(v * 10) / 10).toString().replace(/\.0$/, '');
  return (Math.round(v * 10) / 10).toString();
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: T.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: T.line,
    overflow: 'hidden',
    shadowColor: T.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    paddingHorizontal: 16,
  },
  mealIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  mealEmoji: {
    fontSize: 18,
  },
  mealName: {
    fontSize: 15.5,
    fontWeight: '800',
    color: T.ink,
    letterSpacing: -0.2,
  },
  mealMeta: {
    fontSize: 12,
    color: T.inkMuted,
    fontWeight: '600',
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  calCount: {
    fontSize: 15,
    fontWeight: '800',
  },
  calUnit: {
    fontSize: 10,
    color: T.inkMuted,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  body: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  divider: {
    height: 1,
    backgroundColor: T.lineSoft,
    marginHorizontal: 4,
    marginBottom: 10,
  },
  itemList: {
    gap: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: T.lineSoft,
    borderRadius: 14,
    padding: 11,
    paddingHorizontal: 12,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexWrap: 'wrap',
    marginBottom: 3,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    color: T.ink,
    flexShrink: 1,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: T.purpleSoft,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
  },
  aiBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: T.purple,
    letterSpacing: 0.4,
  },
  itemMeta: {
    fontSize: 12,
    color: T.inkSoft,
    fontWeight: '600',
  },
  itemMacros: {
    fontSize: 11,
    color: T.inkMuted,
    fontWeight: '600',
    marginTop: 3,
  },
  actions: {
    gap: 6,
    flexShrink: 0,
  },
  miniBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    marginTop: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: T.line,
    borderRadius: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: T.green,
  },
});
