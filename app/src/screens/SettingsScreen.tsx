import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { api, errorMessage } from '@/api/client';
import type { CallInfo, Settings } from '@/api/types';
import { Banner, Button, Card, Field, Header, Loading, Row, Screen, ScrollBody, SectionTitle } from '@/components/ui';
import TimeField from '@/components/TimeField';
import TimezoneField from '@/components/TimezoneField';
import { armTestCall } from '@/services/calls/reconcile';
import { applySchedule } from '@/services/calls/schedule';
import { loadLastRing, type LastRing } from '@/services/calls/scheduleStore';
import { useProfile } from '@/state/ProfileContext';
import { colors } from '@/theme/colors';

const STATUS_TEXT: Record<CallInfo['status'], string> = {
  queued: 'Starting…',
  called: 'In progress',
  tool_saved: 'Food list saved',
  no_list: 'Ended without a food list',
  failed: 'Failed',
};

function describeCall(c: CallInfo): string {
  const when = new Date(c.createdAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  const detail = c.status === 'failed' ? `: ${c.error ?? c.endedReason ?? 'unknown error'}` : '';
  return `${when} · ${c.kind} · ${STATUS_TEXT[c.status]}${detail}`;
}

export default function SettingsScreen() {
  const navigation = useNavigation();
  const { profile, selectProfile } = useProfile();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [lastRing, setLastRing] = useState<LastRing | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await api.getSettings();
      setSettings(s);
      setError(null);
      setLastRing(await loadLastRing());
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useEffect(() => {
    if (settings) applySchedule(settings).catch(() => {});
  }, [settings?.callTime, settings?.callEnabled, settings?.timezone]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = async (label: string, body: Parameters<typeof api.updateSettings>[0]) => {
    setBusy(label);
    try {
      setSettings(await api.updateSettings(body));
      setError(null);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const testCall = async () => {
    if (!settings?.vapi.configured) {
      Alert.alert('Add your Vapi key first', 'The test call uses your Vapi public key.');
      return;
    }
    setBusy('test');
    try {
      await armTestCall();
      Alert.alert('Test call armed', 'Your phone rings in about 5 seconds. Lock the screen to check the full-screen call.');
    } catch (e) {
      Alert.alert('Could not arm the test call', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  if (!settings) {
    return (
      <Screen>
        <Header title="Settings" />
        {error ? <View className="px-4"><Banner tone="error">{error}</Banner></View> : <Loading />}
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title="Settings" subtitle={profile?.name} />
      <ScrollBody>
        {error ? <Banner tone="error">{error}</Banner> : null}

        <SectionTitle>Vapi</SectionTitle>
        <Card>
          <Text className="mb-2 text-sm text-ink-soft">
            {settings.vapi.configured ? 'Public key configured ✓' : 'Paste the PUBLIC key from your Vapi dashboard (API Keys). Calls use your own free Vapi credit.'}
          </Text>
          <Field value={key} onChangeText={setKey} placeholder={settings.vapi.configured ? '••••••••  (paste to replace)' : 'Vapi public key'} secureTextEntry autoCapitalize="none" testID="vapi-key" />
          <View className="flex-row">
            <Button
              small
              title="Save key"
              className="mr-2"
              loading={busy === 'key'}
              disabled={!key.trim()}
              onPress={async () => {
                if (await patch('key', { vapiPublicKey: key.trim() })) setKey('');
              }}
            />
            {settings.vapi.configured ? <Button small variant="danger" title="Remove" onPress={() => patch('key', { vapiPublicKey: null })} /> : null}
          </View>
        </Card>

        <SectionTitle>Daily call</SectionTitle>
        <Card>
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-base text-ink">Ring me every day</Text>
            <Switch
              value={settings.callEnabled}
              onValueChange={(v) => {
                patch('enabled', { callEnabled: v });
              }}
              trackColor={{ true: colors.brandMid, false: colors.line }}
              thumbColor={colors.white}
            />
          </View>
          <Text className="mb-1.5 text-sm font-medium text-ink-soft">Call time</Text>
          <TimeField value={settings.callTime} onChange={(callTime) => patch('time', { callTime })} />
          <Text className="mb-1.5 mt-3 text-sm font-medium text-ink-soft">Time zone</Text>
          <TimezoneField value={settings.timezone} onChange={(timezone) => patch('tz', { timezone })} />
          <Text className="mt-3 text-xs text-ink-muted">
            If you miss the call it rings once more an hour later. "Snooze" on the missed-call notification re-rings in 10 minutes.
          </Text>
        </Card>
        <Button title="Send test call now" variant="secondary" loading={busy === 'test'} onPress={testCall} testID="test-call" />

        <SectionTitle>Last call</SectionTitle>
        <Card>
          <Text className="text-sm text-ink">{settings.lastCall ? describeCall(settings.lastCall) : 'No calls yet.'}</Text>
          {lastRing ? (
            <Text className="mt-1 text-xs text-ink-muted">
              Last ring: {lastRing.result} ({lastRing.callKind}), {new Date(lastRing.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
            </Text>
          ) : null}
        </Card>

        <SectionTitle>More</SectionTitle>
        <Card className="py-1">
          <Row title="Reminder health" subtitle="Check what could stop the call from ringing" onPress={() => navigation.navigate('ReminderHealth')} />
          <Row title="Daily goals" onPress={() => navigation.navigate('Goals')} />
          <Row
            title="Switch profile"
            last
            onPress={() =>
              Alert.alert('Switch profile?', 'Your data stays on the server. This phone stops ringing for this profile.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Switch', onPress: () => selectProfile(null) },
              ])
            }
          />
        </Card>
      </ScrollBody>
    </Screen>
  );
}
