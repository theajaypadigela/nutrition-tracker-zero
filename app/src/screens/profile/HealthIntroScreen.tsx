import React, { useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { UserRound } from 'lucide-react-native';
import { errorMessage } from '@/api/client';
import { Button, Card, Icon, Notice, Text } from '@/components/kit';
import { StackScreen } from '@/components/layout/StackScreen';
import { ChoiceCard } from '@/components/health/ChoiceCard';
import { useEnsureSecret } from '@/hooks/useEnsureSecret';
import { strings } from '@/i18n/strings';
import { useHealth } from '@/state/HealthContext';
import { draftFromProfile, useHealthDraft } from '@/state/HealthDraft';
import { space } from '@/theme';

const t = strings.health.intro;

/** Step 0: what is asked, why, what is stored and who sees it; then Continue or Skip (WEEKLY_BREAKDOWN_PLAN.md 3.5, 8.3). */
export default function HealthIntroScreen() {
  const navigation = useNavigation();
  const { draft, update, reset } = useHealthDraft();
  const { profile } = useHealth();
  const ensureSecret = useEnsureSecret();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editing starts from the answers already given; a first run starts empty.
  React.useEffect(() => {
    reset(profile ? draftFromProfile(profile) : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      if (await ensureSecret()) navigation.navigate('SafetyCheck');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <StackScreen
      title={t.title}
      footer={
        <>
          <Button
            testID="intro-continue"
            label={t.continue}
            size="lg"
            fullWidth
            loading={busy}
            disabled={!draft.consent}
            onPress={go}
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
      {error ? <Notice tone="danger">{error}</Notice> : null}
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
