import React from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Button, Text, Toggle } from '@/components/kit';
import { StackScreen } from '@/components/layout/StackScreen';
import { ChoiceCard } from '@/components/health/ChoiceCard';
import { strings } from '@/i18n/strings';
import { flagged, useHealthDraft } from '@/state/HealthDraft';
import { space } from '@/theme';

const t = strings.health.safety;

/**
 * Step 1: one self-declaration question, not a symptom questionnaire (WEEKLY_BREAKDOWN_PLAN.md 3.4, 8.1). The answers
 * are used once to decide what can be offered and are never stored. Any of the first three means no personal targets,
 * so no body questions follow.
 */
export default function SafetyCheckScreen() {
  const navigation = useNavigation();
  const { draft, update } = useHealthDraft();
  const answered = draft.pregnant || draft.eatingDisorder || draft.clinician || draft.none || draft.preferNot;

  const choose = (key: 'pregnant' | 'eatingDisorder' | 'clinician') =>
    update({ [key]: !draft[key], none: false, preferNot: false });
  const none = () =>
    update({
      none: !draft.none,
      preferNot: false,
      pregnant: false,
      eatingDisorder: false,
      clinician: false,
    });
  const preferNot = () =>
    update({
      preferNot: !draft.preferNot,
      none: false,
      pregnant: false,
      eatingDisorder: false,
      clinician: false,
    });

  const next = () => navigation.navigate(flagged(draft) ? 'HealthReview' : 'AboutYou');

  return (
    <StackScreen
      title={t.title}
      subtitle="Step 1"
      footer={
        <Button testID="safety-continue" label={t.continue} size="lg" fullWidth disabled={!answered} onPress={next} />
      }
    >
      <Text variant="body" tone="secondary">
        {t.lead}
      </Text>
      <View style={{ gap: space.md }}>
        <ChoiceCard
          testID="safety-pregnant"
          multi
          title={t.pregnant}
          selected={draft.pregnant}
          onPress={() => choose('pregnant')}
        />
        <ChoiceCard
          testID="safety-ed"
          multi
          title={t.eatingDisorder}
          selected={draft.eatingDisorder}
          onPress={() => choose('eatingDisorder')}
        />
        <ChoiceCard
          testID="safety-clinician"
          multi
          title={t.clinician}
          selected={draft.clinician}
          onPress={() => choose('clinician')}
        />
        <ChoiceCard testID="safety-none" multi title={t.none} selected={draft.none} onPress={none} />
        <ChoiceCard
          testID="safety-prefer-not"
          multi
          title={t.preferNot}
          selected={draft.preferNot}
          onPress={preferNot}
        />
      </View>

      <View style={{ gap: space.sm }}>
        <Text variant="overline" tone="muted">
          {t.medicineTitle}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Text variant="body" style={{ flex: 1 }}>
            {t.medicine}
          </Text>
          <Toggle
            value={draft.medicine}
            onValueChange={v => update({ medicine: v })}
            accessibilityLabel={t.medicine}
            testID="safety-medicine"
          />
        </View>
        <Text variant="caption" tone="muted">
          {t.medicineHint}
        </Text>
      </View>
      <Text variant="caption" tone="muted">
        {t.note}
      </Text>
    </StackScreen>
  );
}
