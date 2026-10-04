import React, { useState } from 'react';
import { Platform, Text } from 'react-native';
import { useProfile } from '@/state/ProfileContext';
import { api, errorMessage } from '@/api/client';
import { Banner, Button, Card, Header, Screen, ScrollBody, SectionTitle } from '@/components/ui';
import TimeField from '@/components/TimeField';
import TimezoneField, { DEFAULT_TIMEZONE } from '@/components/TimezoneField';
import { openAlarmPermissionSettings, requestCorePermissions } from '@/services/calls/permissions';
import { openFullScreenIntentSettings } from '@/services/calls/native';
import { applySchedule } from '@/services/calls/schedule';

export default function OnboardingScreen() {
  const { finishOnboarding } = useProfile();
  const [callTime, setCallTime] = useState('20:00');
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notificationsAsked, setNotificationsAsked] = useState(false);

  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      const settings = await api.updateSettings({ callTime, timezone, callEnabled: true });
      await applySchedule(settings);
      finishOnboarding();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Set up your daily call" subtitle="You can change all of this later in Settings." />
      <ScrollBody>
        {error ? <Banner tone="error">{error}</Banner> : null}
        <SectionTitle>Call time</SectionTitle>
        <Card>
          <TimeField value={callTime} onChange={setCallTime} />
          <Text className="mt-2 text-xs text-ink-muted">Your phone rings at this time every day, like a normal call.</Text>
        </Card>

        <SectionTitle>Time zone</SectionTitle>
        <Card>
          <TimezoneField value={timezone} onChange={setTimezone} />
        </Card>

        <SectionTitle>Permissions</SectionTitle>
        <Card>
          <Text className="mb-3 text-sm text-ink-soft">
            The call is an alarm inside this app. It needs notifications, and on Android exact alarms and full-screen calls,
            to ring on time over the lock screen.
          </Text>
          <Button
            title={notificationsAsked ? 'Notifications requested ✓' : 'Allow notifications'}
            variant="secondary"
            className="mb-2"
            onPress={async () => {
              await requestCorePermissions().catch(() => {});
              setNotificationsAsked(true);
            }}
          />
          {Platform.OS === 'android' ? (
            <>
              <Button title="Allow exact alarms" variant="secondary" className="mb-2" onPress={() => openAlarmPermissionSettings()} />
              <Button title="Allow full-screen calls" variant="secondary" onPress={() => openFullScreenIntentSettings()} />
            </>
          ) : null}
        </Card>

        <Button title="Done" onPress={finish} loading={saving} className="mt-4" testID="onboarding-done" />
      </ScrollBody>
    </Screen>
  );
}
