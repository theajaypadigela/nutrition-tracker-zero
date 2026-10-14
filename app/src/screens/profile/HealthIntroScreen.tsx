import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { UserRound } from 'lucide-react-native';
import { Button, Card, Icon, LoadingState, Notice, Text } from '@/components/kit';
import { StackScreen } from '@/components/layout/StackScreen';
import { ChoiceCard } from '@/components/health/ChoiceCard';
import { strings } from '@/i18n/strings';
import { useHealth } from '@/state/HealthContext';
import { draftFromProfile, useHealthDraft } from '@/state/HealthDraft';
import { space } from '@/theme';

const t = strings.health.intro;

/** Step 0: what is asked, why, what is stored and who sees it; then Continue or Skip (WEEKLY_BREAKDOWN_PLAN.md 3.5, 8.3). */
export default function HealthIntroScreen() {
  const navigation = useNavigation();
  const { draft, update, reset } = useHealthDraft();
  const { profile, status, error, refresh } = useHealth();
  const seeded = useRef(false);

  // Editing starts from the answers already given; a first run starts empty.
  useEffect(() => {
    // Wait for the saved profile before initializing the form, and never overwrite edits during a background refresh.
    if (status !== 'ready' || seeded.current) return;
    reset(profile ? draftFromProfile(profile) : undefined);
    seeded.current = true;
  }, [status, profile, reset]);

  if (status === 'locked' || status === 'mismatch') {
    return (
      <StackScreen title={t.title}>
        <Notice tone="info">{strings.health.targets.locked}</Notice>
        <Button label={strings.health.settings.unlock} onPress={() => navigation.navigate('Reauthenticate')} />
      </StackScreen>
    );
  }
  if (status !== 'ready') {
    return (
      <StackScreen title={t.title}>
        {error ? <Notice tone="danger" action={{ label: 'Retry', onPress: refresh }}>{error}</Notice> : <LoadingState />}
      </StackScreen>
    );
  }

  return (
    <StackScreen
      title={profile ? 'Edit personal details' : t.title}
      footer={
        <>
          <Button
            testID="intro-continue"
            label={t.continue}
            size="lg"
            fullWidth
            disabled={!draft.consent}
            onPress={() => navigation.navigate('SafetyCheck')}
          />
          <Button label={t.skip} variant="ghost" fullWidth onPress={() => navigation.goBack()} />
        </>
      }
    >
      <View style={{ alignItems: 'flex-start', gap: space.lg }}>
        <Icon as={UserRound} size={32} tone="primary" />
        <Text variant="body" tone="secondary">
          {t.lead}
        </Text>
      </View>
      {[t.asks, t.why, t.stored, t.who].map(block => (
        <Card key={block.title}>
          <Text variant="bodyStrong">{block.title}</Text>
          <Text variant="small" tone="secondary" style={{ marginTop: space.xs }}>
            {block.body}
          </Text>
        </Card>
      ))}
      <Text variant="caption" tone="muted">
        {strings.disclaimer.full}
      </Text>
      <ChoiceCard
        testID="intro-consent"
        multi
        title={t.consent}
        selected={draft.consent}
        onPress={() => update({ consent: !draft.consent })}
      />
    </StackScreen>
  );
}
