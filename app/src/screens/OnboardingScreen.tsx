import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { AlarmClock, Bell, ChevronRight, Check, Clock, Maximize2, PhoneCall, ShieldCheck } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, errorMessage } from '@/api/client';
import { Badge, Button, Card, FormGroup, Icon, ListGroup, ListRow, Notice, Text } from '@/components/kit';
import { StatusBarScrim } from '@/components/layout/StatusBarScrim';
import TimezoneField, { DEFAULT_TIMEZONE } from '@/components/TimezoneField';
import { openFullScreenIntentSettings } from '@/services/calls/native';
import { openAlarmPermissionSettings, requestCorePermissions } from '@/services/calls/permissions';
import { applySchedule } from '@/services/calls/schedule';
import { useProfile } from '@/state/ProfileContext';
import { createStyles, FocusAwareStatusBar, hairline, radius, size, space, useTheme } from '@/theme';
import { formatClock } from '@/utils/dates';

const useStyles = createStyles(({ colors }) => ({
  badge: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  timeTile: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
}));

/**
 * One-time daily-call setup after creating a profile: when to ring, in which time zone, and
 * the permissions the ring needs.
 */
export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useStyles();
  const { finishOnboarding } = useProfile();
  const [callTime, setCallTime] = useState('20:00');
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notificationState, setNotificationState] = useState<'enabled' | 'denied' | 'error' | null>(null);

  const [h, m] = callTime.split(':').map(Number);
  const pickerValue = new Date();
  pickerValue.setHours(h ?? 20, m ?? 0, 0, 0);

  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      const settings = await api.updateSettings({ callTime, timezone, callEnabled: true });
      await applySchedule(settings);
      await finishOnboarding();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FocusAwareStatusBar />
      <ScrollView
        contentContainerStyle={{ padding: size.gutter, paddingTop: insets.top + space.xxxl, paddingBottom: space.xxl, gap: space.xxl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: space.xl }}>
          <View style={styles.badge}>
            <Icon as={PhoneCall} size={28} tone="primary" />
          </View>
          <View style={{ gap: space.sm }}>
            <Text variant="title1">When should we call you?</Text>
            <Text variant="body" tone="secondary">
              {Platform.OS === 'ios'
                ? 'Each day at this time a sound reminder arrives. Tap it, tell the assistant what you ate, and it logs it for you.'
                : 'Each day at this time your phone rings like a normal call. Tell the assistant what you ate and it logs it for you.'}
            </Text>
          </View>
        </View>

        {error ? (
          <Notice tone="danger" title="Couldn't save">
            {error}
          </Notice>
        ) : null}

        <FormGroup title="Call time">
          <Card padding="none">
            <Pressable
              onPress={() => setShowPicker(true)}
              accessibilityRole="button"
              accessibilityLabel={`Call time, ${formatClock(callTime)}. Change`}
              style={[styles.timeRow, { padding: space.lg }]}
            >
              <View style={styles.timeTile}>
                <Icon as={Clock} size="lg" tone="primary" />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="small" tone="muted">
                  Preferred time
                </Text>
                <Text variant="title2" tabular>
                  {formatClock(callTime)}
                </Text>
              </View>
              <Icon as={ChevronRight} size="sm" tone="faint" />
            </Pressable>
            {showPicker && Platform.OS === 'ios' ? (
              <View style={{ borderTopWidth: hairline, borderTopColor: colors.border }}>
                <DateTimePicker
                  value={pickerValue}
                  mode="time"
                  is24Hour={false}
                  display="spinner"
                  themeVariant={isDark ? 'dark' : 'light'}
                  textColor={colors.text}
                  onChange={(_event, picked) => {
                    if (picked) setCallTime(`${String(picked.getHours()).padStart(2, '0')}:${String(picked.getMinutes()).padStart(2, '0')}`);
                  }}
                />
              </View>
            ) : null}
          </Card>
        </FormGroup>
        {showPicker && Platform.OS === 'android' ? (
          <DateTimePicker
            value={pickerValue}
            mode="time"
            is24Hour={false}
            display="default"
            onChange={(event, picked) => {
              setShowPicker(false);
              if (event.type === 'set' && picked) {
                setCallTime(`${String(picked.getHours()).padStart(2, '0')}:${String(picked.getMinutes()).padStart(2, '0')}`);
              }
            }}
          />
        ) : null}

        <FormGroup title="Time zone">
          <TimezoneField value={timezone} onChange={setTimezone} />
        </FormGroup>

        <FormGroup title="Let the call ring">
          <ListGroup>
            <ListRow
              icon={Bell}
              title="Allow notifications"
              right={notificationState === 'enabled' ? <Badge label="Done" tone="success" icon={Check} /> : notificationState === 'denied' ? <Badge label="Off" tone="warning" /> : undefined}
              onPress={async () => {
                try {
                  const permissions = await requestCorePermissions();
                  setNotificationState(permissions.notificationsAuthorized ? 'enabled' : 'denied');
                } catch {
                  setNotificationState('error');
                }
              }}
            />
            {Platform.OS === 'android' ? (
              <ListRow icon={AlarmClock} title="Allow exact alarms" onPress={() => openAlarmPermissionSettings()} />
            ) : null}
            {Platform.OS === 'android' ? (
              <ListRow icon={Maximize2} title="Allow full-screen calls" onPress={() => openFullScreenIntentSettings()} />
            ) : null}
          </ListGroup>
          {notificationState === 'denied' ? <Notice tone="warning">Notifications are off. After setup, open Settings → Reminder health to enable them.</Notice> : null}
          {notificationState === 'error' ? <Notice tone="warning">Could not check notification permission. Try again.</Notice> : null}
        </FormGroup>

        <View style={styles.note}>
          <Icon as={ShieldCheck} size="sm" tone="muted" />
          <Text variant="caption" tone="muted">
            You can change or turn off calls anytime in Settings.
          </Text>
        </View>
      </ScrollView>

      <View
        style={{
          paddingHorizontal: size.gutter,
          paddingTop: space.md,
          paddingBottom: Math.max(insets.bottom, space.md) + space.xs,
          borderTopWidth: hairline,
          borderTopColor: colors.border,
          backgroundColor: colors.bg,
        }}
      >
        <Button testID="onboarding-done" label={saving ? 'Saving…' : 'Set call time'} size="lg" fullWidth loading={saving} onPress={finish} />
      </View>
      <StatusBarScrim />
    </View>
  );
}
