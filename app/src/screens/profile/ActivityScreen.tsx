import React, { useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Button, Field, Text, Toggle } from '@/components/kit';
import { StackScreen } from '@/components/layout/StackScreen';
import { ChoiceCard } from '@/components/health/ChoiceCard';
import type { ActivityLevel } from '@/api/types';
import { strings } from '@/i18n/strings';
import { useHealthDraft } from '@/state/HealthDraft';
import { space } from '@/theme';
import { activityFromSteps, parseNumber } from '@/utils/units';

const t = strings.health.activity;
const LEVELS: ActivityLevel[] = ['inactive', 'low_active', 'active', 'very_active'];

/** Step 3: four cards that match the categories the energy equation was built on, with an honest caveat (plan 4.2). */
export default function ActivityScreen() {
  const navigation = useNavigation();
  const { draft, update } = useHealthDraft();
  const [steps, setSteps] = useState('');
  const [helper, setHelper] = useState(false);

  const onSteps = (text: string) => {
    setSteps(text);
    const n = parseNumber(text);
    // The helper only pre-selects a card: the step bands were not calibrated to these categories.
    if (n !== null && n >= 0) update({ activity: activityFromSteps(n) });
  };

  return (
    <StackScreen
      title={t.title}
      subtitle="Step 3"
      footer={
        <Button
          testID="activity-continue"
          label={t.continue}
          size="lg"
          fullWidth
          disabled={!draft.activity}
          onPress={() => navigation.navigate('HealthGoal')}
        />
      }
    >
      <Text variant="body" tone="secondary">
        {t.lead}
      </Text>
      <View style={{ gap: space.md }}>
        {LEVELS.map(level => (
          <ChoiceCard
            key={level}
            testID={`activity-${level}`}
            title={t[level].title}
            body={t[level].body}
            selected={draft.activity === level}
            onPress={() => update({ activity: level })}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Text variant="body" style={{ flex: 1 }}>
          {t.stepsHelper}
        </Text>
        <Toggle value={helper} onValueChange={setHelper} accessibilityLabel={t.stepsHelper} />
      </View>
      {helper ? (
        <Field
          testID="activity-steps"
          value={steps}
          onChangeText={onSteps}
          keyboardType="number-pad"
          suffix="steps a day"
          hint={t.stepsHint}
        />
      ) : null}
      <Text variant="caption" tone="muted">
        {t.note}
      </Text>
    </StackScreen>
  );
}
