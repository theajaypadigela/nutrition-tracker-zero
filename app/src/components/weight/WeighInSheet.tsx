import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { api, ApiError, errorMessage } from '@/api/client';
import type { TargetSetInfo } from '@/api/types';
import { Button, Field, Notice, Segmented, Sheet, Text } from '@/components/kit';
import { strings } from '@/i18n/strings';
import { space } from '@/theme';
import { weightKg, type WeightEntry, type WeightUnit } from '@/utils/units';

const t = strings.report.weighIn;

/** The Worker's hard bounds for a weigh-in, kg (plan 3.2). */
export const WEIGH_IN_RANGE_KG = { min: 25, max: 350 } as const;

const EMPTY: WeightEntry = { unit: 'kg', kg: '', lb: '', stones: '', stonePounds: '' };

export interface WeighInResult {
  weightKg: number;
  /** The weigh-in moved the weight past 3% or 2 kg, so the Worker made a new set of targets, effective today. */
  changed: boolean;
  targetSet: TargetSetInfo | null;
}

/**
 * Add a weigh-in (plan 6.2, 6.6). It takes kg, lb or st + lb and sends metric; the Worker keeps one a day, asks "is that right?" for a
 * change of more than 3 kg from the day before, and makes a new set of targets only when the weight moved by 3% or 2 kg from the one the
 * targets used. Nothing nags: a weigh-in is never required, and skipping one changes nothing.
 */
export function WeighInSheet({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: (r: WeighInResult) => void;
}) {
  const [entry, setEntry] = useState<WeightEntry>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kg = weightKg(entry);
  const bad = kg !== null && (kg < WEIGH_IN_RANGE_KG.min || kg > WEIGH_IN_RANGE_KG.max);
  const ready = kg !== null && !bad;

  const send = async (confirm: boolean) => {
    if (kg === null) return;
    setSaving(true);
    setError(null);
    try {
      const rounded = Math.round(kg * 10) / 10;
      const res = await api.addWeight(rounded, confirm ? { confirm: true } : {});
      setEntry(EMPTY);
      onSaved({ weightKg: rounded, changed: res.changed, targetSet: res.targetSet });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'weight_change_large') {
        // "Is that right?" before a change of more than 3 kg in a day moves anything (plan 7.7).
        Alert.alert(t.largeTitle, `${e.message || t.largeBody}`, [
          { text: 'Cancel', style: 'cancel' },
          { text: t.yes, onPress: () => send(true) },
        ]);
      } else setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const unit = entry.unit;
  return (
    <Sheet visible={visible} onClose={onClose} title={t.title} testID="weigh-in-sheet">
      <View style={{ gap: space.lg, paddingBottom: space.xl }}>
        <Text variant="small" tone="secondary">
          {t.lead}
        </Text>
        <Segmented<WeightUnit>
          options={[
            { value: 'kg', label: t.kg },
            { value: 'lb', label: t.lb },
            { value: 'st', label: t.st },
          ]}
          value={unit}
          onChange={u => setEntry({ ...entry, unit: u })}
        />
        {unit === 'kg' ? (
          <Field
            testID="weigh-in-kg"
            label={t.weight}
            suffix="kg"
            keyboardType="decimal-pad"
            value={entry.kg}
            onChangeText={v => setEntry({ ...entry, kg: v })}
            error={bad ? t.check : null}
          />
        ) : unit === 'lb' ? (
          <Field
            testID="weigh-in-lb"
            label={t.weight}
            suffix="lb"
            keyboardType="decimal-pad"
            value={entry.lb}
            onChangeText={v => setEntry({ ...entry, lb: v })}
            error={bad ? t.check : null}
          />
        ) : (
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Field
                testID="weigh-in-st"
                label={t.stones}
                suffix="st"
                keyboardType="decimal-pad"
                value={entry.stones}
                onChangeText={v => setEntry({ ...entry, stones: v })}
                error={bad ? t.check : null}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                testID="weigh-in-stlb"
                label={t.pounds}
                suffix="lb"
                keyboardType="decimal-pad"
                value={entry.stonePounds}
                onChangeText={v => setEntry({ ...entry, stonePounds: v })}
              />
            </View>
          </View>
        )}
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button
          testID="weigh-in-save"
          label={saving ? t.saving : t.save}
          fullWidth
          loading={saving}
          disabled={!ready}
          onPress={() => send(false)}
        />
      </View>
    </Sheet>
  );
}

/** The two lines of "what changed and why" after a weigh-in made new targets (plan 6.2): never silent. */
export function targetChangeLines(before: TargetSetInfo | null, after: TargetSetInfo | null): string[] {
  if (!before || !after || !before.energy || !after.energy) return [];
  const lines: string[] = [];
  const pick = (set: TargetSetInfo, key: string) => set.targets.find(x => x.nutrient === key)?.value;
  const fmt = (n: number) => n.toLocaleString('en-US');
  if (before.energy.target !== after.energy.target) {
    lines.push(
      `${t.calories.replace('{from}', fmt(before.energy.target)).replace('{to}', fmt(after.energy.target))} ${t.because}`,
    );
  }
  const p0 = pick(before, 'protein');
  const p1 = pick(after, 'protein');
  if (p0 !== undefined && p1 !== undefined && p0 !== p1)
    lines.push(`${t.protein.replace('{from}', fmt(p0)).replace('{to}', fmt(p1))} ${t.because}`);
  return lines;
}
