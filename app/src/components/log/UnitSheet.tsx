import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Chip, Field, FormGroup, Sheet } from '@/components/kit';
import { strings } from '@/i18n/strings';
import { space } from '@/theme';

const wrap = { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm } as const;

/**
 * Pick the unit of a food in the list. The units the food already has a conversion for come first (an amount in one of them counts
 * right away), then every unit, then a field for anything else ("ladle", "handful"), which is kept as typed.
 */
export function UnitSheet({
  visible,
  onClose,
  name,
  current,
  forFood,
  all,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  /** The food it is for, shown under the title. */
  name: string;
  current: string;
  forFood: readonly string[];
  all: readonly string[];
  onPick: (unit: string) => void;
}) {
  const [other, setOther] = useState('');
  useEffect(() => {
    if (visible) setOther('');
  }, [visible]);

  const pick = (unit: string) => {
    onPick(unit);
    onClose();
  };
  const chips = (units: readonly string[]) => (
    <View style={wrap}>
      {units.map(u => (
        <Chip key={u} testID={`unit-choice-${u}`} label={u} selected={u === current} onPress={() => pick(u)} />
      ))}
    </View>
  );
  // A unit typed earlier (or logged by voice) that is not in the list still shows, so the current one can always be seen.
  const rest = all.filter(u => !forFood.includes(u));
  const everyUnit = current && !forFood.includes(current) && !rest.includes(current) ? [current, ...rest] : rest;
  const typed = other.trim();

  return (
    <Sheet visible={visible} onClose={onClose} title={strings.log.units.title} subtitle={name}>
      {forFood.length > 0 ? <FormGroup title={strings.log.units.forFood}>{chips(forFood)}</FormGroup> : null}
      <FormGroup title={forFood.length > 0 ? strings.log.units.all : undefined}>{chips(everyUnit)}</FormGroup>
      <FormGroup title={strings.log.units.other}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Field
              testID="unit-other"
              value={other}
              onChangeText={setOther}
              placeholder={strings.log.units.otherPlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => typed && pick(typed)}
            />
          </View>
          <Button testID="unit-other-use" label={strings.log.units.use} variant="soft" disabled={!typed} onPress={() => pick(typed)} />
        </View>
      </FormGroup>
    </Sheet>
  );
}
