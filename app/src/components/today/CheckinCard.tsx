import React, { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { ChevronRight, Clock, PhoneCall } from 'lucide-react-native';
import type { Settings } from '@/api/types';
import { Button, Card, Icon, Sheet, Text, Toggle } from '@/components/kit';
import { requestCorePermissions } from '@/services/calls/permissions';
import { createStyles, radius, space, useTheme } from '@/theme';
import { formatClock } from '@/utils/dates';

type CallPatch = Partial<Pick<Settings, 'callTime' | 'callEnabled'>>;

function parseClock(hhmm: string | null): { hour: number; minute: number } {
  const [h, m] = (hhmm ?? '20:00').split(':').map(Number);
  return { hour: h ?? 20, minute: m ?? 0 };
}

function toClock(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Minutes past midnight right now in the profile's zone (the call rings in that zone). */
function minutesNowIn(timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

/**
 * Day label + countdown for the next occurrence of a daily (hour, minute). Once today's
 * slot has passed, the next call is tomorrow — the label has to say so, otherwise the
 * row reads "Today at 8:00 PM · in 23h".
 */
function computeNextCall(hour: number, minute: number, timeZone: string): { dayLabel: string; eta: string } {
  const now = minutesNowIn(timeZone);
  const target = hour * 60 + minute;
  const isTomorrow = target <= now;
  const diff = isTomorrow ? target + 1440 - now : target - now;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  const eta = diff < 60 ? `in ${diff}m` : m > 0 ? `in ${h}h ${m}m` : `in ${h}h`;
  return { dayLabel: isTomorrow ? 'Tomorrow' : 'Today', eta };
}

/** True unless notifications are off — the call can't ring without them. */
async function notificationsAllowed(): Promise<boolean> {
  try {
    return (await requestCorePermissions()).notificationsAuthorized;
  } catch {
    return true;
  }
}

const DENIED_TITLE = 'Saved — but notifications are off';
const DENIED_BODY =
  "Your check-in call is saved, but it can't ring until you enable notifications. Fix this from Settings → Reminder health.";

const useStyles = createStyles(({ colors }) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md + 2, paddingLeft: space.lg, paddingRight: space.md },
  tile: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileOff: { backgroundColor: colors.surfaceMuted },
  body: { flex: 1, minWidth: 0, gap: 2 },
  well: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  picker: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceMuted },
}));

interface CheckinCardProps {
  callTime: string | null;
  callEnabled: boolean;
  timezone: string;
  /** Saves to the server and re-arms the ring; resolves false when it failed. */
  onSave: (patch: CallPatch) => Promise<boolean>;
}

/** The daily call, as one row: when it rings next, an on/off switch, and a sheet to change the time. */
export function CheckinCard({ callTime, callEnabled, timezone, onSave }: CheckinCardProps) {
  const { colors, isDark } = useTheme();
  const styles = useStyles();
  const [showSheet, setShowSheet] = useState(false);
  const [draftHour, setDraftHour] = useState(20);
  const [draftMinute, setDraftMinute] = useState(0);
  // Android's time picker is a native dialog rather than an inline view, so it is mounted
  // on demand; iOS renders its spinner inline inside the sheet.
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const current = parseClock(callTime);
  const timeLabel = callTime ? formatClock(callTime) : 'Not set';
  const { dayLabel, eta } = computeNextCall(current.hour, current.minute, timezone);

  const subtitle = !callEnabled
    ? callTime
      ? `Off · was ${timeLabel}`
      : 'Off'
    : callTime
      ? `${dayLabel} at ${timeLabel} · ${eta}`
      : 'Pick a time for the daily call';

  const draftDate = useMemo(() => {
    const d = new Date();
    d.setHours(draftHour, draftMinute, 0, 0);
    return d;
  }, [draftHour, draftMinute]);

  const openSheet = () => {
    setDraftHour(current.hour);
    setDraftMinute(current.minute);
    setShowSheet(true);
  };

  const onPickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShowAndroidPicker(false);
    if (event.type === 'dismissed' || !selected) return;
    setDraftHour(selected.getHours());
    setDraftMinute(selected.getMinutes());
  };

  const toggleEnabled = async (val: boolean) => {
    // Schedule-and-flag: persist the intent either way, but tell the user when the call
    // can't actually ring because notifications are denied.
    const denied = val ? !(await notificationsAllowed()) : false;
    const saved = await onSave({ callEnabled: val });
    if (!saved) Alert.alert('Error', 'Could not save your check-in schedule.');
    else if (denied) Alert.alert(DENIED_TITLE, DENIED_BODY);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const denied = !(await notificationsAllowed());
      const saved = await onSave({ callTime: toClock(draftHour, draftMinute), callEnabled: true });
      if (!saved) {
        Alert.alert('Error', 'Could not save schedule');
        return;
      }
      setShowSheet(false);
      if (denied) Alert.alert(DENIED_TITLE, DENIED_BODY);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card padding="none" testID="checkin-card">
        <View style={styles.row}>
          <Pressable
            onPress={openSheet}
            accessibilityRole="button"
            accessibilityLabel={`Daily check-in call. ${subtitle}. Change time`}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, minWidth: 0 }}
          >
            <View style={[styles.tile, !callEnabled ? styles.tileOff : null]}>
              <Icon as={PhoneCall} size="md" tone={callEnabled ? 'primary' : 'muted'} />
            </View>
            <View style={styles.body}>
              <Text variant="bodyStrong">Daily check-in call</Text>
              <Text variant="small" tone="muted" numberOfLines={2}>
                {subtitle}
              </Text>
            </View>
            <Icon as={ChevronRight} size="sm" tone="faint" />
          </Pressable>
          <Toggle value={callEnabled} onValueChange={toggleEnabled} accessibilityLabel="Daily check-in call" />
        </View>
      </Card>

      <Sheet
        visible={showSheet}
        onClose={() => setShowSheet(false)}
        title="When should we call?"
        subtitle="Pick any daily time. The call takes about two minutes."
        footer={<Button label="Save check-in time" size="lg" fullWidth loading={saving} onPress={handleSave} />}
      >
        {Platform.OS === 'ios' ? (
          <View style={styles.picker}>
            <DateTimePicker
              value={draftDate}
              mode="time"
              display="spinner"
              is24Hour={false}
              minuteInterval={1}
              themeVariant={isDark ? 'dark' : 'light'}
              textColor={colors.text}
              onChange={onPickerChange}
              style={{ height: 190 }}
            />
          </View>
        ) : (
          <>
            <Pressable
              onPress={() => setShowAndroidPicker(true)}
              accessibilityRole="button"
              accessibilityLabel="Pick the call time"
              style={styles.well}
            >
              <Icon as={Clock} size="lg" tone="primary" />
              <View style={{ flex: 1 }}>
                <Text variant="title2" tone="primary" tabular>
                  {formatClock(toClock(draftHour, draftMinute))}
                </Text>
                <Text variant="small" tone="muted">
                  Tap to pick any time
                </Text>
              </View>
              <Icon as={ChevronRight} size="sm" tone="primary" />
            </Pressable>
            {showAndroidPicker ? (
              <DateTimePicker value={draftDate} mode="time" display="clock" is24Hour={false} onChange={onPickerChange} />
            ) : null}
          </>
        )}
        <Text variant="caption" tone="muted">
          Rings in your profile's time zone ({timezone}). If you miss it, it rings once more an hour later.
        </Text>
      </Sheet>
    </>
  );
}
