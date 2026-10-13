import React from 'react';
import { Pressable, View } from 'react-native';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { createStyles, radius, space, useTheme } from '@/theme';
import { Card } from './Card';
import { Divider } from './Divider';
import { Icon } from './Icon';
import { Text, type TextTone } from './Text';
import { usePressed } from './usePressed';

/** Rows in one card, a hairline between each: the app's list. */
export function ListGroup({ children }: { children: React.ReactNode }) {
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <Card padding="none">
      {rows.map((row, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <Divider inset={space.lg} /> : null}
          {row}
        </React.Fragment>
      ))}
    </Card>
  );
}

const useStyles = createStyles(() => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  body: { flex: 1, minWidth: 0, gap: 2 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 0 },
  tile: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
}));

interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  iconTone?: TextTone;
  /** Draw the icon on a soft green circle: for the rows that are the point of a sheet or screen. */
  tile?: boolean;
  /** Right-aligned secondary text. */
  value?: string;
  /** A control on the right (a Switch, a Badge); replaces the value and the chevron. */
  right?: React.ReactNode;
  onPress?: () => void;
  /** Defaults to on for pressable rows without a custom `right`. */
  chevron?: boolean;
  destructive?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}

export function ListRow({
  title,
  subtitle,
  icon,
  iconTone = 'secondary',
  tile,
  value,
  right,
  onPress,
  chevron,
  destructive,
  testID,
  accessibilityLabel,
}: ListRowProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { pressed, handlers } = usePressed();
  const showChevron = chevron ?? (!!onPress && !right);
  const hasTrailing = !!right || !!value || showChevron;
  const content = (
    <>
      {icon && tile ? (
        <View style={[styles.tile, { backgroundColor: destructive ? colors.dangerSoft : colors.primarySoft }]}>
          <Icon as={icon} size="md" tone={destructive ? 'danger' : 'primary'} />
        </View>
      ) : icon ? (
        <Icon as={icon} size="md" tone={destructive ? 'danger' : iconTone} />
      ) : null}
      <View style={styles.body}>
        <Text variant="body" tone={destructive ? 'danger' : 'text'} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {hasTrailing ? (
        <View style={styles.trailing}>
          {right ?? (value ? <Text variant="small" tone="muted">{value}</Text> : null)}
          {!right && showChevron ? <Icon as={ChevronRight} size="sm" tone="faint" /> : null}
        </View>
      ) : null}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      {...handlers}
      style={[styles.row, pressed ? { backgroundColor: colors.surfaceMuted } : null]}
    >
      {content}
    </Pressable>
  );
}
