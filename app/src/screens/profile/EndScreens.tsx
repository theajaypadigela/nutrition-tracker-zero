import React from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ban, UserRoundX } from 'lucide-react-native';
import { Button, Icon, Notice, Text } from '@/components/kit';
import { StackScreen } from '@/components/layout/StackScreen';
import { strings } from '@/i18n/strings';
import { useHealthDraft } from '@/state/HealthDraft';
import { space } from '@/theme';

/** A birth year under 19 stops the flow before any body data is entered (WEEKLY_BREAKDOWN_PLAN.md 8.1 G1). */
export function Under19Screen() {
  const navigation = useNavigation();
  const { reset } = useHealthDraft();
  const t = strings.health.under19;
  const done = () => {
    reset();
    navigation.navigate('Main');
  };
  return (
    <StackScreen
      title={t.title}
      onBack={done}
      footer={<Button testID="under19-done" label={t.action} size="lg" fullWidth onPress={done} />}
    >
      <View style={{ alignItems: 'flex-start', gap: space.lg }}>
        <Icon as={UserRoundX} size={32} tone="muted" />
        <Text variant="body" tone="secondary">
          {t.body}
        </Text>
      </View>
    </StackScreen>
  );
}

/** After a safety answer or a gate puts the profile in reference-only mode: what that means, and the care-team path (plan 6.7). */
export function ReferenceOnlyScreen() {
  const navigation = useNavigation();
  const t = strings.health.referenceOnly;
  return (
    <StackScreen
      title={t.title}
      onBack={() => navigation.navigate('Main')}
      footer={
        <>
          <Button
            testID="ref-care-team"
            label={t.careTeamAction}
            variant="secondary"
            size="lg"
            fullWidth
            onPress={() => navigation.navigate('Goals', { careTeam: true })}
          />
          <Button testID="ref-done" label={t.done} size="lg" fullWidth onPress={() => navigation.navigate('Main')} />
        </>
      }
    >
      <View style={{ alignItems: 'flex-start', gap: space.lg }}>
        <Icon as={Ban} size={32} tone="muted" />
        <Text variant="body" tone="secondary">
          {t.body}
        </Text>
      </View>
      <Notice tone="info">{t.careTeam}</Notice>
      <Text variant="caption" tone="muted">
        {t.talk}
      </Text>
    </StackScreen>
  );
}
