import React from 'react';
import { Pressable, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { createStyles, hairline, radius, space, useTheme } from '@/theme';
import { Icon } from './Icon';
import { Text } from './Text';
import { usePressed } from './usePressed';

const useStyles = createStyles(({ colors }) => ({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  track: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md - 2,
    padding: 3,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: space.md,
    borderRadius: radius.md - 4,
  },
  // Icon over label, like the buttons on a phone's call screen: three of them fit 360 dp at a large font size.
  segmentTall: { height: 56, flexDirection: 'column', gap: 2, paddingHorizontal: space.xs },
  thumb: { backgroundColor: colors.surface, borderWidth: hairline, borderColor: colors.border },
  dot: { width: 7, height: 7, borderRadius: 4 },
}));

/** A selectable pill: a filter, a unit, a meal. Selected is the accent tint; unselected is a plain outline. */
export function Chip({
  label,
  selected,
  onPress,
  icon,
  count,
  dot,
  testID,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: LucideIcon;
  count?: number;
  /** A small status dot before the label. */
  dot?: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { pressed, handlers } = usePressed();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={count !== undefined ? `${label}, ${count}` : label}
      onPress={onPress}
      // 36 tall to look light, 44 tall to touch.
      hitSlop={{ top: 4, bottom: 4 }}
      {...handlers}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.primarySoft : pressed ? colors.surfaceMuted : colors.surface,
          borderColor: selected ? colors.primary : colors.borderStrong,
        },
      ]}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
      {icon ? <Icon as={icon} size="sm" tone={selected ? 'primary' : 'secondary'} /> : null}
      <Text variant={selected ? 'smallStrong' : 'small'} tone={selected ? 'primary' : 'secondary'}>
        {label}
      </Text>
      {count !== undefined ? (
        <Text variant="caption" tone={selected ? 'primary' : 'muted'} tabular>
          {count}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Two or three exclusive options in one track (Amount / %). `tall` (icon over label) is for a control used mid-call. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  tall,
}: {
  options: { value: T; label: string; icon?: LucideIcon; testID?: string }[];
  value: T;
  onChange: (v: T) => void;
  tall?: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {options.map(o => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={o.testID}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            hitSlop={{ top: 5, bottom: 5 }}
            style={[styles.segment, tall ? styles.segmentTall : null, selected ? styles.thumb : null]}
          >
            {o.icon ? <Icon as={o.icon} size="sm" tone={selected ? 'primary' : 'muted'} /> : null}
            <Text
              variant="smallStrong"
              tone={selected ? 'text' : 'muted'}
              numberOfLines={tall ? 1 : undefined}
              adjustsFontSizeToFit={tall}
              minimumFontScale={tall ? 0.75 : undefined}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
