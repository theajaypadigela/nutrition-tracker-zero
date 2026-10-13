import React, { useState } from 'react';
import { Share, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { KeyRound, ShieldCheck } from 'lucide-react-native';
import { api, ApiError, errorMessage } from '@/api/client';
import { Button, Card, Field, Icon, Notice, Text } from '@/components/kit';
import { StackScreen } from '@/components/layout/StackScreen';
import { verifyRecoveryCode } from '@/hooks/useEnsureSecret';
import { strings } from '@/i18n/strings';
import { groupSecret, normaliseSecret, SECRET_RE } from '@/services/secret';
import { useHealth } from '@/state/HealthContext';
import { useProfile } from '@/state/ProfileContext';
import { space } from '@/theme';

const r = strings.health.recovery;

/**
 * The profile's secret, shown once as a recovery code to keep in a password manager (WEEKLY_BREAKDOWN_PLAN.md 8.3.2,
 * Q17). It cannot be shown again: the server keeps only a hash. Shown right after a profile is made, and when a
 * profile made before secrets existed claims one.
 */
export function RecoveryCodeScreen() {
  const navigation = useNavigation();
  const { recoveryCode, acknowledgeRecovery, secretNotStored } = useProfile();
  const done = () => {
    acknowledgeRecovery();
    if (navigation.canGoBack()) navigation.goBack();
  };
  return (
    <StackScreen
      title={r.title}
      onBack={navigation.canGoBack() ? done : undefined}
      footer={<Button testID="recovery-saved" label={r.saved} size="lg" fullWidth onPress={done} />}
    >
      <View style={{ alignItems: 'flex-start', gap: space.lg }}>
        <Icon as={ShieldCheck} size={32} tone="primary" />
        <Text variant="body" tone="secondary">
          {r.body}
        </Text>
      </View>
      <Card padding="xl">
        <Text variant="title3" selectable testID="recovery-code" style={{ letterSpacing: 1, lineHeight: 30 }}>
          {recoveryCode ? groupSecret(recoveryCode) : ''}
        </Text>
      </Card>
      <Button
        label={r.share}
        variant="secondary"
        fullWidth
        onPress={() => {
          if (recoveryCode) Share.share({ message: recoveryCode }).catch(() => {});
        }}
      />
      <Notice tone="warning">{r.warn}</Notice>
      {secretNotStored ? (
        <Notice tone="danger" testID="recovery-not-stored">
          {r.notStored}
        </Notice>
      ) : null}
    </StackScreen>
  );
}

/** Enter the recovery code on a phone that does not hold it (a new phone, a reinstall, a stale Keychain entry). */
export function RecoveryEntryScreen() {
  const navigation = useNavigation();
  const { secret, adoptSecret, selectProfile } = useProfile();
  const health = useHealth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unlock = async () => {
    const typed = normaliseSecret(code);
    if (!SECRET_RE.test(typed)) {
      setError(r.entryWrong);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (await verifyRecoveryCode(typed, secret)) {
        await adoptSecret(typed);
        await health.refresh();
        navigation.goBack();
      } else setError(r.entryWrong);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // "I do not have it": if the server holds no secret for this profile (it was never claimed), a new one can be set up now; if it
  // holds one, it cannot, and the person is told so (plan 8.3.2). Where the deployment requires the secret everywhere, claims are
  // closed, and only the owner of the deployment can issue a code (docs/BREACH_RUNBOOK.md).
  const claimNew = async () => {
    setBusy(true);
    setError(null);
    try {
      const claimed = await api.claimSecret();
      await adoptSecret(claimed.secret, { show: true });
      await health.refresh();
      navigation.navigate('RecoveryCode');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'secret_already_set') setError(r.claimRefused);
      else if (e instanceof ApiError && (e.code === 'profile_secret_required' || e.code === 'profile_secret_invalid')) setError(r.claimClosed);
      else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <StackScreen
      title={r.entryTitle}
      footer={
        <Button
          testID="recovery-unlock"
          label={r.entryAction}
          size="lg"
          fullWidth
          loading={busy}
          disabled={!code.trim()}
          onPress={unlock}
        />
      }
    >
      <View style={{ alignItems: 'flex-start', gap: space.lg }}>
        <Icon as={KeyRound} size={32} tone="primary" />
        <Text variant="body" tone="secondary">
          {r.entryBody}
        </Text>
      </View>
      <Field
        testID="recovery-input"
        label={r.entryField}
        value={code}
        onChangeText={setCode}
        error={error}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Paste or type the code"
      />
      <Card>
        <Text variant="bodyStrong">{r.startOver}</Text>
        <Text variant="small" tone="secondary" style={{ marginTop: space.xs }}>
          {r.startOverBody}
        </Text>
        <View style={{ marginTop: space.md, gap: space.sm }}>
          <Button testID="recovery-claim" label={r.claimAction} variant="soft" disabled={busy} onPress={claimNew} />
          <Button label="Use a different account" variant="ghost" onPress={() => selectProfile(null)} />
        </View>
      </Card>
    </StackScreen>
  );
}
