import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import type { NutrientInfo } from '@/api/types';
import { Icon, InlineField, ListGroup, Text } from '@/components/kit';
import { fill } from '@/i18n/fill';
import { strings } from '@/i18n/strings';
import { createStyles, space } from '@/theme';
import { groupNutrients, readNumber, type NutrientGroupId } from '@/utils/foodData';

const useStyles = createStyles(() => ({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, minHeight: 36, paddingHorizontal: space.xs },
  count: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
}));

/**
 * Every nutrient of a food, in groups, each with a field of its own: a pack label's, then minerals, then vitamins. All of them are
 * there to look at and fill in; nothing hides behind "more". A field left empty is saved as 0, and says so with a 0 where the number
 * would go. A group folds away to save scrolling and says how many of its fields hold a value; one with a mistake in it stays open.
 */
export function NutrientFields({
  nutrients,
  values,
  errors,
  unknown,
  onChange,
}: {
  nutrients: readonly NutrientInfo[];
  values: Record<string, string>;
  errors: Record<string, string>;
  /** Nutrients nobody has given a value for (an older food): an empty field says Unknown, not 0, and saving it empty keeps it so. */
  unknown?: ReadonlySet<string>;
  onChange: (key: string, text: string) => void;
}) {
  const styles = useStyles();
  const [folded, setFolded] = useState<Partial<Record<NutrientGroupId, boolean>>>({});
  const t = strings.foodEntry.fields;

  return (
    <View style={{ gap: space.lg }}>
      {groupNutrients(nutrients).map(group => {
        const title = t.groups[group.id];
        const filled = group.nutrients.filter(n => (readNumber(values[n.key] ?? '') ?? 0) > 0).length;
        const hasError = group.nutrients.some(n => errors[n.key]);
        const isFolded = !!folded[group.id] && !hasError;
        const count = fill(t.filled, { n: filled, total: group.nutrients.length });
        return (
          <View key={group.id} style={{ gap: space.sm }}>
            <Pressable
              testID={`group-${group.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${title}, ${count}`}
              accessibilityState={{ expanded: !isFolded }}
              onPress={() => setFolded(prev => ({ ...prev, [group.id]: !prev[group.id] }))}
              hitSlop={{ top: 6, bottom: 6 }}
              style={styles.header}
            >
              <Text variant="overline" tone="muted">
                {title}
              </Text>
              <View style={styles.count}>
                <Text variant="caption" tone="muted" tabular>
                  {count}
                </Text>
                <Icon as={isFolded ? ChevronDown : ChevronUp} size="sm" tone="faint" />
              </View>
            </Pressable>
            {isFolded ? null : (
              <ListGroup>
                {group.nutrients.map(n => {
                  // "mcg DFE": the unit is "mcg", and "DFE" says what it is counted as, so it goes with the name.
                  const [unit = '', ...note] = n.unit.split(' ');
                  return (
                    <InlineField
                      key={n.key}
                      testID={`nutrient-${n.key}`}
                      label={note.length > 0 ? `${n.label} (${note.join(' ')})` : n.label}
                      unit={unit}
                      value={values[n.key] ?? ''}
                      onChangeText={text => onChange(n.key, text)}
                      placeholder={unknown?.has(n.key) ? t.unknown : t.placeholder}
                      error={errors[n.key]}
                    />
                  );
                })}
              </ListGroup>
            )}
          </View>
        );
      })}
    </View>
  );
}
