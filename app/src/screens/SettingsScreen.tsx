import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LogOut, User } from 'lucide-react-native';
import { api, errorMessage } from '@/api/client';
import type { CallInfo, Settings } from '@/api/types';
import AppBar from '@/components/common/AppBar';
import { LoadingState, Notice } from '@/components/common/Feedback';
import TimezoneField from '@/components/TimezoneField';
import { Button, ButtonText } from '@/components/ui/button';
import { Divider } from '@/components/ui/divider';
import { HStack } from '@/components/ui/hstack';
import { Input, InputField } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboard';
import { armTestCall } from '@/services/calls/reconcile';
import { applySchedule } from '@/services/calls/schedule';
import { loadLastRing, type LastRing } from '@/services/calls/scheduleStore';
import { useProfile } from '@/state/ProfileContext';
import { tokens } from '@/theme/tokens';
import { formatClock } from '@/utils/dates';

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

/** The old Profile screen's layout, holding this app's settings (it opens from the AppBar avatar). */
export default function SettingsScreen() {
  const navigation = useNavigation();
  const { profile, selectProfile } = useProfile();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [lastRing, setLastRing] = useState<LastRing | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  // Clearance for the Save / Remove buttons under the key field.
  const { keyboardHeight, scrollProps } = useKeyboardAwareScroll(100);

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

  const pickerDate = (() => {
    const [h, m] = (settings?.callTime ?? '20:00').split(':').map(Number);
    const d = new Date();
    d.setHours(h ?? 20, m ?? 0, 0, 0);
    return d;
  })();

  return (
    <View className="flex-1">
      <AppBar title="Settings" variant="secondary" showBackButton />
      {!settings ? (
        error ? (
          <View className="p-6">
            <Notice tone="error">{error}</Notice>
          </View>
        ) : (
          <LoadingState color={tokens.dashboard.green} />
        )
      ) : (
        <ScrollView
          {...scrollProps}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 40 + keyboardHeight }}
        >
          <VStack className="gap-6 p-6">
            <VStack className="bg-white rounded-2xl p-10 border border-gray-200 items-center">
              <View className="flex justify-center mb-4">
                <View className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center">
                  <User size={36} color={tokens.icon.green} />
                </View>
              </View>
              <Text size="2xl" className="font-semibold text-gray-900 text-center">
                {profile?.name}
              </Text>
              <Text size="md" className="text-gray-600 mt-1 text-center">
                Your profile
              </Text>
            </VStack>

            {error ? <Notice tone="error">{error}</Notice> : null}

            {/* Vapi key */}
            <VStack className="bg-white rounded-2xl p-6 border border-gray-200 gap-4">
              <HStack className="justify-between items-center">
                <Text size="xl" className="font-semibold">
                  Vapi
                </Text>
                {settings.vapi.configured ? (
                  <View className="rounded-full bg-emerald-50 px-2.5 py-[3px]">
                    <Text className="text-xs font-medium text-emerald-600">Configured ✓</Text>
                  </View>
                ) : null}
              </HStack>
              <Text className="text-sm text-gray-600">
                {settings.vapi.configured
                  ? 'Paste a new key to replace the saved one.'
                  : 'Paste the PUBLIC key from your Vapi dashboard (API Keys). Calls use your own free Vapi credit.'}
              </Text>
              <VStack className="gap-2">
                <Text>Public key</Text>
                <Input size="xl" className="w-full px-4 h-14 rounded-xl border-2 bg-white">
                  <InputField
                    testID="vapi-key"
                    value={key}
                    onChangeText={setKey}
                    placeholder={settings.vapi.configured ? '••••••••  (paste to replace)' : 'Vapi public key'}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </Input>
              </VStack>
              <HStack className="w-full gap-3">
                {settings.vapi.configured ? (
                  <Button
                    className="flex-1"
                    variant="outline"
                    action="negative"
                    onPress={() => patch('key', { vapiPublicKey: null })}
                    isDisabled={busy === 'key'}
                  >
                    <ButtonText>Remove</ButtonText>
                  </Button>
                ) : null}
                <Button
                  className="flex-1"
                  variant="solid"
                  action="positive"
                  isDisabled={!key.trim() || busy === 'key'}
                  onPress={async () => {
                    if (await patch('key', { vapiPublicKey: key.trim() })) setKey('');
                  }}
                >
                  <ButtonText>{busy === 'key' ? 'Saving...' : 'Save key'}</ButtonText>
                </Button>
              </HStack>
            </VStack>

            {/* Daily call — the old Meal Reminder card */}
            <VStack className="bg-white rounded-2xl p-6 border border-gray-200 gap-4">
              <Text size="xl" className="font-semibold">
                Daily call
              </Text>
              <View style={styles.reminderRow}>
                <View style={styles.cardLeft}>
                  <Text style={styles.mealLabel}>Ring me every day</Text>
                  <TouchableOpacity onPress={() => settings.callEnabled && setShowPicker(true)} disabled={!settings.callEnabled}>
                    <Text style={[styles.timeText, !settings.callEnabled && styles.timeTextDisabled]}>
                      {formatClock(settings.callTime)}
                    </Text>
                    {settings.callEnabled && <Text style={styles.tapToChange}>Tap to change time</Text>}
                  </TouchableOpacity>
                </View>
                <Switch
                  value={settings.callEnabled}
                  onValueChange={v => {
                    patch('enabled', { callEnabled: v });
                  }}
                  trackColor={{ false: tokens.settings.switchTrackOff, true: tokens.settings.switchTrackOn }}
                  thumbColor={settings.callEnabled ? tokens.settings.green : tokens.settings.switchThumbOff}
                />
              </View>
              {showPicker ? (
                <DateTimePicker
                  value={pickerDate}
                  mode="time"
                  is24Hour={false}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, picked) => {
                    setShowPicker(Platform.OS === 'ios');
                    if (event.type === 'set' && picked) {
                      patch('time', {
                        callTime: `${String(picked.getHours()).padStart(2, '0')}:${String(picked.getMinutes()).padStart(2, '0')}`,
                      });
                    }
                  }}
                />
              ) : null}
              <Divider />
              <VStack className="gap-2">
                <Text>Time zone</Text>
                <TimezoneField value={settings.timezone} onChange={timezone => patch('tz', { timezone })} />
              </VStack>
              <Text className="text-xs text-gray-500">
                If you miss the call it rings once more an hour later. "Snooze" on the missed-call notification re-rings in 10
                minutes.
              </Text>
            </VStack>

            <TouchableOpacity
              testID="test-call"
              style={[styles.saveBtn, busy === 'test' && styles.saveBtnDisabled]}
              onPress={testCall}
              disabled={busy === 'test'}
            >
              <Text style={styles.saveBtnText}>{busy === 'test' ? 'Arming…' : 'Send test call now'}</Text>
            </TouchableOpacity>

            {/* Last call */}
            <VStack className="bg-white rounded-2xl p-6 border border-gray-200 gap-2">
              <Text size="xl" className="font-semibold">
                Last call
              </Text>
              <Text className="text-sm text-gray-700">{settings.lastCall ? describeCall(settings.lastCall) : 'No calls yet.'}</Text>
              {lastRing ? (
                <Text className="text-xs text-gray-500">
                  Last ring: {lastRing.result} ({lastRing.callKind}),{' '}
                  {new Date(lastRing.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                </Text>
              ) : null}
            </VStack>

            <TouchableOpacity style={styles.menuRow} onPress={() => navigation.navigate('ReminderHealth')}>
              <Text style={styles.rowIcon}>🩺</Text>
              <Text style={styles.rowLabel}>Reminder health</Text>
              <Text style={styles.rowChevron}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuRow} onPress={() => navigation.navigate('Goals')}>
              <Text style={styles.rowIcon}>🎯</Text>
              <Text style={styles.rowLabel}>Daily goals</Text>
              <Text style={styles.rowChevron}>›</Text>
            </TouchableOpacity>

            <View>
              <Button
                variant="outline"
                action="negative"
                className="w-full mt-4 rounded-xl shadow-lg border border-red-200 bg-gray-50"
                onPress={() =>
                  Alert.alert('Switch profile?', 'Your data stays on the server. This phone stops ringing for this profile.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Switch', onPress: () => selectProfile(null) },
                  ])
                }
              >
                <LogOut size={20} color={tokens.icon.red} />
                <ButtonText size="md" className="text-red-500">
                  Switch profile
                </ButtonText>
              </Button>
            </View>
          </VStack>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLeft: { flex: 1 },
  mealLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: tokens.settings.ink,
    marginBottom: 4,
  },
  timeText: { fontSize: 22, fontWeight: '700', color: tokens.settings.green },
  timeTextDisabled: { color: tokens.settings.disabledInk },
  tapToChange: { fontSize: 11, color: tokens.settings.inkMuted, marginTop: 2 },
  saveBtn: {
    backgroundColor: tokens.settings.green,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  saveBtnDisabled: { backgroundColor: tokens.settings.disabled },
  saveBtnText: { color: tokens.settings.surface, fontSize: 17, fontWeight: '700' },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.settings.surface,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: tokens.settings.line,
  },
  rowIcon: { fontSize: 22, marginRight: 12 },
  rowLabel: { flex: 1, fontSize: 16, fontWeight: '600', color: tokens.settings.ink },
  rowChevron: { fontSize: 22, color: tokens.settings.inkMuted },
});
