import React, { useCallback, useState } from 'react';
import { Alert, Platform, Share, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { FileDown, HeartPulse, KeyRound, LogOut, PhoneCall, Target, Trash2, UserRound } from 'lucide-react-native';
import { api, errorMessage } from '@/api/client';
import type { CallInfo, Settings } from '@/api/types';
import { Avatar, Badge, Button, Card, Field, FormGroup, ListGroup, ListRow, LoadingState, Notice, Segmented, Text, Toggle } from '@/components/kit';
import { StackScreen } from '@/components/layout/StackScreen';
import TimezoneField from '@/components/TimezoneField';
import { armTestCall } from '@/services/calls/reconcile';
import { applySchedule } from '@/services/calls/schedule';
import { loadLastRing, type LastRing } from '@/services/calls/scheduleStore';
import { strings, where } from '@/i18n/strings';
import { useHealth } from '@/state/HealthContext';
import { useProfile } from '@/state/ProfileContext';
import { clearProfileSecret } from '@/services/secret';
import { space, useTheme, useThemePreference, type ThemePreference } from '@/theme';
import { formatClock } from '@/utils/dates';
import { voiceApi } from '@/services/voice/api';
import type { VoiceConfiguration } from '../../../shared/voice';
import { initialsOf } from '@/utils/format';

const STATUS_TEXT: Record<CallInfo['status'], string> = {
  queued: 'Starting…',
  called: 'In progress',
  tool_saved: 'Food list saved',
  no_list: 'Ended without a food list',
  failed: 'Failed',
};

const when = (iso: string | number) =>
  new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });

function describeCall(c: CallInfo): string {
  const detail = c.status === 'failed' ? `: ${c.error ?? c.endedReason ?? 'unknown error'}` : '';
  return `${when(c.createdAt)} · ${c.kind} · ${STATUS_TEXT[c.status]}${detail}`;
}

/** The profile's settings: the daily call, the Vapi key, and the shortcuts to the rest. Opens from the avatar. */
export default function SettingsScreen() {
  const navigation = useNavigation();
  const { isDark } = useTheme();
  const { preference, setPreference } = useThemePreference();
  const { profile, selectProfile } = useProfile();
  const health = useHealth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [lastRing, setLastRing] = useState<LastRing | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [draftTime, setDraftTime] = useState('20:00');
  const [voice, setVoice] = useState<VoiceConfiguration | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await api.getSettings();
      setSettings(s);
      await applySchedule(s);
      setError(null);
      setLastRing(await loadLastRing());
      Promise.resolve().then(() => voiceApi.configuration()).then(setVoice).catch(() => setVoice(null));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  const patch = async (label: string, body: Parameters<typeof api.updateSettings>[0]) => {
    setBusy(label);
    try {
      const next = await api.updateSettings(body);
      setSettings(next);
      // Finish native scheduling inside the save, before telling the person it succeeded.
      await applySchedule(next);
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
    setBusy('test');
    try {
      const configuration = await voiceApi.configuration();
      setVoice(configuration);
      if (!configuration.configured) {
        Alert.alert('Voice assistant needs setup', configuration.provider === 'vapi'
          ? 'Add your Vapi public key below.' : 'Configure the active voice provider on the backend.');
        return;
      }
      await armTestCall();
      Alert.alert('Test call armed', Platform.OS === 'ios'
        ? 'A sound reminder arrives in about 5 seconds, even if you close the app. Tap it to start the call.'
        : 'Your phone rings in about 5 seconds. Close the app or lock the screen to check the call.');
    } catch (e) {
      Alert.alert('Could not arm the test call', errorMessage(e), [
        { text: 'Reminder health', onPress: () => navigation.navigate('ReminderHealth') },
        { text: 'Close', style: 'cancel' },
      ]);
    } finally {
      setBusy(null);
    }
  };

  const pickerDate = (() => {
    const [h, m] = (showPicker && Platform.OS === 'ios' ? draftTime : settings?.callTime ?? '20:00').split(':').map(Number);
    const d = new Date();
    d.setHours(h ?? 20, m ?? 0, 0, 0);
    return d;
  })();

  const h = strings.health.settings;
  const personal = health.mode === 'personalised' ? health.profile : null;

  const setHidden = async (numbersHidden: boolean) => {
    setBusy('hide');
    try {
      health.apply(await api.saveHealthProfile({ profile: { numbersHidden } }));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const exportHealth = async () => {
    setBusy('export');
    try {
      const data = await api.exportHealthData();
      await Share.share({ title: 'My health data', message: JSON.stringify(data, null, 2) });
    } catch (e) {
      Alert.alert('Could not export', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const confirmDeleteHealth = () =>
    Alert.alert(h.deleteHealthTitle, h.deleteHealthBody, [
      { text: h.cancel, style: 'cancel' },
      {
        text: h.confirm,
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteHealthData();
            await health.refresh();
          } catch (e) {
            Alert.alert('Could not delete', errorMessage(e));
          }
        },
      },
    ]);

  const confirmDeleteProfile = () =>
    Alert.alert(h.deleteProfileTitle, h.deleteProfileBody, [
      { text: h.cancel, style: 'cancel' },
      {
        text: h.confirm,
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteProfile();
            if (profile) await clearProfileSecret(profile.id);
            await selectProfile(null);
          } catch (e) {
            Alert.alert('Could not delete', errorMessage(e));
          }
        },
      },
    ]);

  const confirmSwitch = () =>
    Alert.alert('Log out?', where.switchProfile, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', onPress: () => selectProfile(null) },
    ]);

  // Always reachable, including when the profile's settings can't load (say the profile no longer
  // exists on the server): otherwise the person is stuck on an error with no way to log in as someone else.
  const switchProfileButton = <Button label="Log out" icon={LogOut} variant="ghost" fullWidth onPress={confirmSwitch} />;

  return (
    <StackScreen title="Settings" gap={space.xl}>
      {/* The profile and the look of the app are on this phone: they show whether or not the settings could be loaded. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingHorizontal: space.xs }}>
        <Avatar initials={initialsOf(profile?.name)} size={56} />
        <View style={{ flex: 1 }}>
          <Text variant="title2" numberOfLines={1}>
            {profile?.name}
          </Text>
          <Text variant="small" tone="muted">
            Your profile
          </Text>
        </View>
      </View>

      {personal ? (
        <FormGroup title="Personal details" hint="Edit these answers to update your personal targets.">
          <ListGroup>
            {!health.numbersHidden ? (
              <>
                <ListRow title="Birth year" value={String(personal.birthYear ?? '')} />
                <ListRow title="Height" value={personal.heightCm === undefined ? undefined : `${personal.heightCm} cm`} />
                <ListRow title="Weight" value={personal.weightKg === undefined ? undefined : `${personal.weightKg} kg`} />
              </>
            ) : null}
            {personal.sexForCalc ? <ListRow title={strings.health.about.sexTitle} value={strings.health.about[personal.sexForCalc]} /> : null}
            {personal.activity ? <ListRow title="Activity" value={strings.health.activity[personal.activity].title} /> : null}
            {personal.goal ? <ListRow title="Goal" value={strings.health.goal[personal.goal].title} /> : null}
            {personal.pattern ? <ListRow title="Eating pattern" value={strings.health.pattern[personal.pattern]} /> : null}
            <ListRow
              testID="settings-edit-personal"
              icon={UserRound}
              title="Edit personal details"
              subtitle="Birth year, height, weight, activity and goals"
              onPress={() => navigation.navigate('HealthIntro')}
            />
          </ListGroup>
        </FormGroup>
      ) : null}

      <FormGroup title={strings.appearance.title} hint={strings.appearance.hint}>
        <Segmented<ThemePreference>
          options={[
            { value: 'system', label: strings.appearance.system },
            { value: 'light', label: strings.appearance.light },
            { value: 'dark', label: strings.appearance.dark },
          ]}
          value={preference}
          onChange={setPreference}
        />
      </FormGroup>

      {!settings ? (
        error ? (
          <>
            <Notice tone="danger">{error}</Notice>
            {switchProfileButton}
          </>
        ) : (
          <LoadingState />
        )
      ) : (
        <>
          {error ? <Notice tone="danger">{error}</Notice> : null}

          <FormGroup
            title="Daily call"
            hint={`${
              Platform.OS === 'ios'
                ? 'A sound reminder arrives each day. Tap it to start your voice check-in. Focus and silent mode can silence it.'
                : 'If you miss the call it rings once more an hour later. "Snooze" on the missed-call notification re-rings in 10 minutes.'
            } ${strings.callback.hint}`}
          >
            <ListGroup>
              <ListRow
                title="Call me every day"
                subtitle={
                  settings.callEnabled
                    ? 'The assistant rings at the time below. Turn this off any time for a break.'
                    : 'Paused. Nothing will ring until you turn this back on.'
                }
                right={
                  <Toggle
                    value={settings.callEnabled}
                    onValueChange={v => {
                      patch('enabled', { callEnabled: v });
                    }}
                    accessibilityLabel="Call me every day"
                  />
                }
              />
              <ListRow
                title="Call time"
                value={formatClock(settings.callTime)}
                onPress={settings.callEnabled ? () => {
                  setDraftTime(settings.callTime ?? '20:00');
                  setShowPicker(true);
                } : undefined}
                chevron={settings.callEnabled}
              />
              <View style={{ padding: space.lg, gap: space.md }}>
                <Text variant="body">Time zone</Text>
                <TimezoneField value={settings.timezone} onChange={timezone => patch('tz', { timezone })} />
              </View>
            </ListGroup>
            {showPicker ? (
              <View style={{ gap: space.sm }}>
                <DateTimePicker
                  value={pickerDate}
                  mode="time"
                  is24Hour={false}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  themeVariant={isDark ? 'dark' : 'light'}
                  onChange={(event, picked) => {
                    setShowPicker(Platform.OS === 'ios');
                    if (event.type === 'set' && picked) {
                      const callTime = `${String(picked.getHours()).padStart(2, '0')}:${String(picked.getMinutes()).padStart(2, '0')}`;
                      if (Platform.OS === 'ios') setDraftTime(callTime);
                      else patch('time', { callTime });
                    }
                  }}
                />
                {Platform.OS === 'ios' ? (
                  <View style={{ flexDirection: 'row', gap: space.sm }}>
                    <Button label="Cancel" variant="ghost" disabled={busy === 'time'} onPress={() => setShowPicker(false)} />
                    <Button label="Save call time" testID="save-call-time" loading={busy === 'time'} onPress={async () => {
                      if (await patch('time', { callTime: draftTime })) setShowPicker(false);
                    }} />
                  </View>
                ) : null}
              </View>
            ) : null}
          </FormGroup>
          <Button
            testID="test-call"
            label={busy === 'test' ? 'Arming…' : 'Send test call now'}
            icon={PhoneCall}
            variant="secondary"
            fullWidth
            loading={busy === 'test'}
            onPress={testCall}
          />

          <FormGroup
            title="Voice assistant"
            hint={voice ? `${voice.provider === 'deepgram' ? 'Deepgram' : voice.provider} is the active provider.` : 'Loading voice provider…'}
          >
            <Card>
              <Text variant="body">{voice?.configured ? 'Ready for voice check-ins.' : 'The voice backend needs configuration.'}</Text>
            </Card>
          </FormGroup>

          <FormGroup
            title="Vapi alternative"
            hint={
              settings.vapi.configured
                ? 'A key is saved. Paste a new one to replace it.'
                : 'Paste the public key from your Vapi dashboard (API Keys). Calls use your own free Vapi credit.'
            }
          >
            <Card>
              <View style={{ gap: space.lg }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text variant="bodyStrong">Vapi public key</Text>
                  {settings.vapi.configured ? <Badge label="Saved" tone="success" /> : <Badge label="Not set" tone="warning" />}
                </View>
                <Field
                  testID="vapi-key"
                  value={key}
                  onChangeText={setKey}
                  placeholder={settings.vapi.configured ? '••••••••  (paste to replace)' : 'Vapi public key'}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  {settings.vapi.configured ? (
                    <Button
                      label="Remove"
                      variant="dangerGhost"
                      style={{ flex: 1 }}
                      disabled={busy === 'key'}
                      onPress={() => patch('key', { vapiPublicKey: null })}
                    />
                  ) : null}
                  <Button
                    label="Save key"
                    style={{ flex: 1 }}
                    disabled={!key.trim()}
                    loading={busy === 'key'}
                    onPress={async () => {
                      if (await patch('key', { vapiPublicKey: key.trim() })) setKey('');
                    }}
                  />
                </View>
              </View>
            </Card>
          </FormGroup>

          <FormGroup title="Last call">
            <Card>
              <Text variant="body">{settings.lastCall ? describeCall(settings.lastCall) : 'No calls yet.'}</Text>
              {lastRing ? (
                <Text variant="caption" tone="muted" style={{ marginTop: space.xs }}>
                  Last ring: {lastRing.result} ({lastRing.callKind}), {when(lastRing.at)}
                </Text>
              ) : null}
            </Card>
          </FormGroup>

          <FormGroup title={h.section}>
            <ListGroup>
              <ListRow
                testID="settings-health"
                icon={UserRound}
                title={health.profile ? h.profileSet : h.profileNone}
                onPress={health.status === 'ready' || health.status === 'locked' || health.status === 'mismatch' ? () => navigation.navigate('HealthIntro') : undefined}
              />
              {health.status === 'locked' || health.status === 'mismatch' ? (
                <ListRow icon={KeyRound} title={h.unlock} onPress={() => navigation.navigate('Reauthenticate')} />
              ) : null}
              <ListRow icon={Target} title={h.targets} subtitle={h.targetsHint} onPress={() => navigation.navigate('Targets')} />
              {health.profile ? (
                <ListRow
                  title={h.hideNumbers}
                  subtitle={h.hideNumbersHint}
                  right={<Toggle value={health.numbersHidden} onValueChange={setHidden} disabled={busy === 'hide'} accessibilityLabel={h.hideNumbers} testID="hide-numbers" />}
                />
              ) : null}
              {health.status === 'ready' ? <ListRow icon={FileDown} title={h.export} onPress={exportHealth} /> : null}
              {health.status === 'ready' && health.profile ? <ListRow icon={Trash2} title={h.deleteHealth} destructive onPress={confirmDeleteHealth} /> : null}
              {health.status !== 'locked' ? <ListRow icon={Trash2} title={h.deleteProfile} destructive onPress={confirmDeleteProfile} /> : null}
            </ListGroup>
          </FormGroup>

          <FormGroup title="More">
            <ListGroup>
              <ListRow icon={HeartPulse} title="Reminder health" subtitle="Check that the call can ring on time" onPress={() => navigation.navigate('ReminderHealth')} />
              <ListRow icon={Target} title="Daily targets" subtitle="Numbers you set yourself" onPress={() => navigation.navigate('Goals')} />
            </ListGroup>
          </FormGroup>

          {switchProfileButton}
        </>
      )}
    </StackScreen>
  );
}
