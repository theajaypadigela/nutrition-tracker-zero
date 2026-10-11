import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { AlarmClock, Bell, Check, ChevronRight, Clock, Maximize2, Phone, ShieldCheck, Sparkles, type LucideIcon } from 'lucide-react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, errorMessage } from '@/api/client';
import { Banner, GenderChips, PrimaryButton, R } from '@/components/auth';
import { DEFAULT_TIMEZONE, timezoneOptions } from '@/components/TimezoneField';
import { openFullScreenIntentSettings } from '@/services/calls/native';
import { openAlarmPermissionSettings, requestCorePermissions } from '@/services/calls/permissions';
import { applySchedule } from '@/services/calls/schedule';
import { useProfile } from '@/state/ProfileContext';
import { tokens } from '@/theme/tokens';
import { formatClock } from '@/utils/dates';

/**
 * One-time daily-call setup after creating a profile — the old CallSetup design (call
 * rings, time selector), plus the time zone and the permissions the ring needs.
 */
export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { finishOnboarding } = useProfile();
  const [callTime, setCallTime] = useState('20:00');
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notificationsAsked, setNotificationsAsked] = useState(false);

  const [h, m] = callTime.split(':').map(Number);
  const pickerValue = new Date();
  pickerValue.setHours(h ?? 20, m ?? 0, 0, 0);

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
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={tokens.auth.surface} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* concentric call rings */}
        <View style={styles.ringsWrap}>
          {[150, 116].map((sz, i) => (
            <View
              key={sz}
              style={[
                styles.ring,
                {
                  width: sz,
                  height: sz,
                  borderRadius: sz / 2,
                  opacity: [0.14, 0.26][i],
                },
              ]}
            />
          ))}
          <LinearGradient
            colors={[tokens.auth.greenMid, tokens.auth.green, tokens.auth.greenDeep]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.ringCore}
          >
            <Phone size={34} color={tokens.auth.white} />
          </LinearGradient>
          <View style={styles.sparkleBadge}>
            <Sparkles size={15} color={tokens.auth.green} fill={tokens.auth.green} />
          </View>
        </View>

        <View style={styles.headerBlock}>
          <View style={styles.pill}>
            <Text style={styles.pillText}>ONE LAST STEP</Text>
          </View>
          <Text style={styles.title}>When should we call you?</Text>
          <Text style={styles.subtitle}>
            Each day at this time your phone rings like a normal call. Tell the assistant what you ate and it logs it all
            for you.
          </Text>
        </View>

        {error ? (
          <View style={styles.block}>
            <Banner tone="error" title="Couldn't save">
              {error}
            </Banner>
          </View>
        ) : null}

        {/* time selector */}
        <Pressable onPress={() => setShowPicker(true)} style={styles.timeSelect}>
          <View style={styles.timeIcon}>
            <Clock size={24} color={tokens.auth.green} />
          </View>
          <View style={styles.timeTextBlock}>
            <Text style={styles.timeLabel}>PREFERRED TIME</Text>
            <Text style={styles.timeValue}>{formatClock(callTime)}</Text>
          </View>
          <ChevronRight size={20} color={tokens.auth.inkMuted} />
        </Pressable>

        <View style={styles.block}>
          <GenderChips
            label="Time zone"
            options={timezoneOptions(timezone).map(tz => ({ label: tz, value: tz }))}
            value={timezone}
            onChange={setTimezone}
          />
        </View>

        <View style={styles.block}>
          <Text style={styles.sectionLabel}>Let the call ring</Text>
          <View style={styles.permList}>
            <PermissionRow
              icon={Bell}
              title="Allow notifications"
              done={notificationsAsked}
              onPress={async () => {
                await requestCorePermissions().catch(() => {});
                setNotificationsAsked(true);
              }}
            />
            {Platform.OS === 'android' ? (
              <>
                <PermissionRow icon={AlarmClock} title="Allow exact alarms" onPress={() => openAlarmPermissionSettings()} />
                <PermissionRow icon={Maximize2} title="Allow full-screen calls" onPress={() => openFullScreenIntentSettings()} />
              </>
            ) : null}
          </View>
        </View>

        <View style={styles.noteRow}>
          <ShieldCheck size={15} color={tokens.auth.inkMuted} />
          <Text style={styles.noteText}>You can change or turn off calls anytime in Settings.</Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <PrimaryButton onPress={finish} loading={saving} testID="onboarding-done">
          {saving ? 'Saving…' : 'Set call time'}
        </PrimaryButton>
      </View>

      {showPicker ? (
        <DateTimePicker
          value={pickerValue}
          mode="time"
          is24Hour={false}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, picked) => {
            setShowPicker(Platform.OS === 'ios');
            if (event.type === 'set' && picked) {
              setCallTime(`${String(picked.getHours()).padStart(2, '0')}:${String(picked.getMinutes()).padStart(2, '0')}`);
            }
          }}
        />
      ) : null}
    </View>
  );
}

/** A permission step in the auth field-box style; shows a check once it has been asked. */
function PermissionRow({ icon: Icon, title, done, onPress }: { icon: LucideIcon; title: string; done?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.permRow, done && { borderColor: tokens.auth.green, backgroundColor: tokens.auth.greenSoft }]}
    >
      <Icon size={20} color={done ? tokens.auth.green : tokens.auth.inkMuted} />
      <Text style={[styles.permTitle, done && { color: tokens.auth.greenDeep }]}>{title}</Text>
      {done ? <Check size={18} color={tokens.auth.green} /> : <ChevronRight size={18} color={tokens.auth.inkMuted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.auth.surface },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 26,
    paddingTop: 14,
    paddingBottom: 24,
  },
  ringsWrap: {
    width: 150,
    height: 150,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    marginBottom: 6,
  },
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: tokens.auth.green,
  },
  ringCore: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: tokens.auth.green,
    shadowOpacity: 0.33,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  sparkleBadge: {
    position: 'absolute',
    top: 30,
    right: 30,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: tokens.auth.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: tokens.auth.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  timeTextBlock: { flex: 1 },
  headerBlock: { alignItems: 'center', marginTop: 14 },
  pill: {
    backgroundColor: tokens.auth.greenSoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  pillText: {
    color: tokens.auth.greenDeep,
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  title: {
    fontSize: 27,
    fontWeight: '800',
    letterSpacing: -0.8,
    color: tokens.auth.ink,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 14.5,
    fontWeight: '500',
    color: tokens.auth.inkSoft,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 12,
    maxWidth: 300,
  },
  block: { marginTop: 22 },
  timeSelect: {
    marginTop: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1.6,
    borderRadius: R.lg,
    padding: 18,
    borderColor: tokens.auth.green,
    backgroundColor: tokens.auth.surface,
  },
  timeIcon: {
    width: 46,
    height: 46,
    borderRadius: R.md,
    backgroundColor: tokens.auth.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: tokens.auth.inkMuted,
    letterSpacing: 0.4,
  },
  timeValue: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 3,
    color: tokens.auth.ink,
  },
  sectionLabel: {
    fontSize: 13.5,
    fontWeight: '700',
    color: tokens.auth.ink,
    marginBottom: 8,
  },
  permList: { gap: 9 },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.6,
    borderRadius: R.md,
    borderColor: tokens.auth.line,
    backgroundColor: tokens.auth.field,
    paddingHorizontal: 14,
    height: 54,
  },
  permTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: tokens.auth.ink,
    letterSpacing: -0.2,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 18,
  },
  noteText: { fontSize: 12, fontWeight: '600', color: tokens.auth.inkMuted },
  footer: {
    paddingHorizontal: 26,
    paddingTop: 18,
    gap: 12,
  },
});
