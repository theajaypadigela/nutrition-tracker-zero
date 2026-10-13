import React from 'react';
import { Alert, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Button, Chip, Field, FormGroup, Notice, Segmented, Text } from '@/components/kit';
import { StackScreen } from '@/components/layout/StackScreen';
import { ChoiceCard } from '@/components/health/ChoiceCard';
import { strings } from '@/i18n/strings';
import { birthYearOf, useHealthDraft } from '@/state/HealthDraft';
import { ageOn, localDateIn } from '@/utils/dates';
import { space } from '@/theme';
import { heightCm, weightKg, type HeightUnit, type WeightUnit } from '@/utils/units';

const t = strings.health.about;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The hard limits of the form (the Worker enforces the same): a typo is stopped here, an unusual value only asked about. */
export const HEIGHT_HARD = { min: 120, max: 230 };
export const WEIGHT_HARD = { min: 25, max: 350 };
export const HEIGHT_SOFT = { min: 140, max: 200 };

/** Step 2: birth year, sex used for calculations, height and weight (WEEKLY_BREAKDOWN_PLAN.md 3.2, 7.7). */
export default function AboutYouScreen() {
  const navigation = useNavigation();
  const { draft, update } = useHealthDraft();
  const year = birthYearOf(draft);
  const nowYear = new Date().getFullYear();
  const h = heightCm(draft.height);
  const w = weightKg(draft.weight);
  const yearBad =
    draft.birthYear.length > 0 && (year === null || year < 1900 || year > nowYear || nowYear - year > 100);
  const heightBad = h !== null && (h < HEIGHT_HARD.min || h > HEIGHT_HARD.max);
  const weightBad = w !== null && (w < WEIGHT_HARD.min || w > WEIGHT_HARD.max);
  const complete = year !== null && !yearBad && !!draft.sex && h !== null && !heightBad && w !== null && !weightBad;

  const next = () => {
    // A birth year under 19 stops the flow before any body data is entered (G1).
    if (ageOn(localDateIn(Intl.DateTimeFormat().resolvedOptions().timeZone), year!, draft.birthMonth) < 19) {
      navigation.navigate('Under19');
      return;
    }
    const bmi = w! / (h! / 100) ** 2;
    const odd = h! < HEIGHT_SOFT.min || h! > HEIGHT_SOFT.max || bmi < 16 || bmi > 50;
    if (odd) {
      Alert.alert(
        t.isThatRight,
        'Heights outside 140 to 200 cm, and weights that put your BMI under 16 or over 50, are unusual.',
        [
          { text: 'Change it', style: 'cancel' },
          {
            text: 'It is right',
            onPress: () => navigation.navigate('Activity'),
          },
        ],
      );
      return;
    }
    navigation.navigate('Activity');
  };

  return (
    <StackScreen
      title={t.title}
      subtitle="Step 2"
      footer={
        <Button testID="about-continue" label={t.continue} size="lg" fullWidth disabled={!complete} onPress={next} />
      }
    >
      <FormGroup title={t.birthYear}>
        <Field
          testID="about-birth-year"
          value={draft.birthYear}
          onChangeText={v => update({ birthYear: v.replace(/\D/g, '').slice(0, 4) })}
          keyboardType="number-pad"
          maxLength={4}
          placeholder="e.g. 1990"
          error={yearBad ? 'Enter a four-digit year, for someone aged 100 or under' : null}
        />
        <Text variant="caption" tone="muted">
          {t.birthMonth}. {t.birthMonthHint}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {MONTHS.map((m, i) => (
            <Chip
              key={m}
              label={m}
              selected={draft.birthMonth === i + 1}
              onPress={() =>
                update({
                  birthMonth: draft.birthMonth === i + 1 ? null : i + 1,
                })
              }
            />
          ))}
        </View>
      </FormGroup>

      <FormGroup title={t.sexTitle} hint={t.sexHint}>
        <View style={{ gap: space.md }}>
          <ChoiceCard
            testID="about-sex-female"
            title={t.female}
            selected={draft.sex === 'female'}
            onPress={() => update({ sex: 'female' })}
          />
          <ChoiceCard
            testID="about-sex-male"
            title={t.male}
            selected={draft.sex === 'male'}
            onPress={() => update({ sex: 'male' })}
          />
          <ChoiceCard
            testID="about-sex-average"
            title={t.average}
            selected={draft.sex === 'average'}
            onPress={() => update({ sex: 'average' })}
          />
        </View>
      </FormGroup>

      <FormGroup title={t.height}>
        <Segmented<HeightUnit>
          options={[
            { value: 'cm', label: 'cm' },
            { value: 'ftin', label: 'ft + in' },
          ]}
          value={draft.height.unit}
          onChange={unit => update({ height: { ...draft.height, unit } })}
        />
        {draft.height.unit === 'cm' ? (
          <Field
            testID="about-height-cm"
            value={draft.height.cm}
            onChangeText={cm => update({ height: { ...draft.height, cm } })}
            keyboardType="decimal-pad"
            suffix="cm"
            placeholder="e.g. 165"
            error={heightBad ? `Between ${HEIGHT_HARD.min} and ${HEIGHT_HARD.max} cm` : null}
          />
        ) : (
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Field
                testID="about-height-ft"
                value={draft.height.feet}
                onChangeText={feet => update({ height: { ...draft.height, feet } })}
                keyboardType="number-pad"
                suffix="ft"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                testID="about-height-in"
                value={draft.height.inches}
                onChangeText={inches => update({ height: { ...draft.height, inches } })}
                keyboardType="decimal-pad"
                suffix="in"
              />
            </View>
          </View>
        )}
        {heightBad && draft.height.unit === 'ftin' ? (
          <Notice tone="warning">{`Between ${HEIGHT_HARD.min} and ${HEIGHT_HARD.max} cm`}</Notice>
        ) : null}
      </FormGroup>

      <FormGroup title={t.weight} hint={t.weightHint}>
        <Segmented<WeightUnit>
          options={[
            { value: 'kg', label: 'kg' },
            { value: 'lb', label: 'lb' },
            { value: 'st', label: 'st + lb' },
          ]}
          value={draft.weight.unit}
          onChange={unit => update({ weight: { ...draft.weight, unit } })}
        />
        {draft.weight.unit === 'kg' ? (
          <Field
            testID="about-weight-kg"
            value={draft.weight.kg}
            onChangeText={kg => update({ weight: { ...draft.weight, kg } })}
            keyboardType="decimal-pad"
            suffix="kg"
            placeholder="e.g. 62"
            error={weightBad ? `Between ${WEIGHT_HARD.min} and ${WEIGHT_HARD.max} kg` : null}
          />
        ) : draft.weight.unit === 'lb' ? (
          <Field
            testID="about-weight-lb"
            value={draft.weight.lb}
            onChangeText={lb => update({ weight: { ...draft.weight, lb } })}
            keyboardType="decimal-pad"
            suffix="lb"
            error={weightBad ? 'Check the weight' : null}
          />
        ) : (
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Field
                testID="about-weight-st"
                value={draft.weight.stones}
                onChangeText={stones => update({ weight: { ...draft.weight, stones } })}
                keyboardType="number-pad"
                suffix="st"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                testID="about-weight-stlb"
                value={draft.weight.stonePounds}
                onChangeText={stonePounds => update({ weight: { ...draft.weight, stonePounds } })}
                keyboardType="decimal-pad"
                suffix="lb"
              />
            </View>
          </View>
        )}
      </FormGroup>
    </StackScreen>
  );
}
