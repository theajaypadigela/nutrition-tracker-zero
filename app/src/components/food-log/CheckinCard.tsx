import React, { useState, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  Switch,
  Modal,
  Platform,
  StyleSheet,
  Alert,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Text } from '../ui/text';
import { Phone, Zap, Clock, ChevronRight, X } from 'lucide-react-native';
import type { Settings } from '@/api/types';
import { requestCorePermissions } from '@/services/calls/permissions';
import { formatClock } from '@/utils/dates';
import { tokens } from '@/theme/tokens';

const T = tokens.foodLog;

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
 * card reads "Today at 8:00 PM · in 23h".
 */
function computeNextCall(
  hour: number,
  minute: number,
  timeZone: string,
): { dayLabel: string; eta: string } {
  const now = minutesNowIn(timeZone);
  const target = hour * 60 + minute;
  const isTomorrow = target <= now;
  const diff = isTomorrow ? target + 1440 - now : target - now;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  const eta =
    diff < 60 ? `in ${diff}m` : m > 0 ? `in ${h}h ${m}m` : `in ${h}h`;
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

interface CheckinCardProps {
  callTime: string | null;
  callEnabled: boolean;
  timezone: string;
  /** Saves to the server and re-arms the ring; resolves false when it failed. */
  onSave: (patch: CallPatch) => Promise<boolean>;
}

export const CheckinCard: React.FC<CheckinCardProps> = ({
  callTime,
  callEnabled,
  timezone,
  onSave,
}) => {
  const [showSheet, setShowSheet] = useState(false);
  const [draftHour, setDraftHour] = useState(20);
  const [draftMinute, setDraftMinute] = useState(0);
  // Android's time picker is a native dialog rather than an inline view, so it is mounted
  // on demand; iOS renders its spinner inline inside the sheet.
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const reminder = { ...parseClock(callTime), enabled: callEnabled };
  const timeLabel = callTime ? formatClock(callTime) : 'Not set';
  const { dayLabel, eta: etaLabel } = computeNextCall(
    reminder.hour,
    reminder.minute,
    timezone,
  );

  const draftDate = useMemo(() => {
    const d = new Date();
    d.setHours(draftHour, draftMinute, 0, 0);
    return d;
  }, [draftHour, draftMinute]);

  const openSheet = () => {
    setDraftHour(reminder.hour);
    setDraftMinute(reminder.minute);
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
      <View style={styles.card}>
        {/* header row */}
        <View style={styles.headerRow}>
          <View style={styles.iconWrap}>
            <Phone size={20} color={T.surface} strokeWidth={2} />
            <View style={styles.sparkBadge}>
              <Zap size={9} color={T.surface} fill={T.surface} />
            </View>
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title}>AI check-in call</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              We'll call to log everything you ate
            </Text>
          </View>

          <Switch
            value={reminder.enabled}
            onValueChange={toggleEnabled}
            trackColor={{ false: T.switchTrackOff, true: T.green }}
            thumbColor={T.surface}
            ios_backgroundColor={T.switchTrackOff}
          />
        </View>

        {/* time button */}
        <TouchableOpacity
          onPress={openSheet}
          disabled={!reminder.enabled}
          activeOpacity={0.7}
          style={[
            styles.timeBtn,
            {
              backgroundColor: reminder.enabled ? T.greenSoft : T.lineSoft,
              opacity: reminder.enabled ? 1 : 0.55,
            },
          ]}
        >
          <Clock size={18} color={T.green} strokeWidth={2} />
          <View style={{ flex: 1 }}>
            <Text style={styles.timeMain}>
              {callTime ? `${dayLabel} at ${timeLabel}` : timeLabel}
            </Text>
            <Text style={styles.timeEta}>
              {callTime ? `Next call ${etaLabel}` : 'Pick a time for the daily call'}
            </Text>
          </View>
          <View style={styles.editRow}>
            <Text style={styles.editLabel}>Edit</Text>
            <ChevronRight size={14} color={T.green} strokeWidth={2.2} />
          </View>
        </TouchableOpacity>
      </View>

      {/* time picker sheet */}
      <Modal
        visible={showSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSheet(false)}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setShowSheet(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <View style={styles.handle} />

            <View style={styles.sheetHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetSuper}>AI CHECK-IN</Text>
                <Text style={styles.sheetTitle}>When should we call?</Text>
                <Text style={styles.sheetSub}>
                  Pick any daily time. The call takes about 2 minutes.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowSheet(false)}
                style={styles.closeBtn}
              >
                <X size={16} color={T.inkSoft} strokeWidth={2.2} />
              </TouchableOpacity>
            </View>

            {/* free-form time selection — any hour and minute, not a fixed slot list */}
            {Platform.OS === 'ios' ? (
              <View style={styles.pickerWrap}>
                <DateTimePicker
                  value={draftDate}
                  mode="time"
                  display="spinner"
                  is24Hour={false}
                  minuteInterval={1}
                  themeVariant="light"
                  textColor={T.ink}
                  onChange={onPickerChange}
                  style={styles.iosPicker}
                />
              </View>
            ) : (
              <>
                <TouchableOpacity
                  onPress={() => setShowAndroidPicker(true)}
                  activeOpacity={0.75}
                  style={styles.androidTimeBtn}
                >
                  <Clock size={20} color={T.green} strokeWidth={2} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.androidTimeValue}>
                      {formatClock(toClock(draftHour, draftMinute))}
                    </Text>
                    <Text style={styles.androidTimeHint}>
                      Tap to pick any time
                    </Text>
                  </View>
                  <ChevronRight size={16} color={T.green} strokeWidth={2.2} />
                </TouchableOpacity>

                {showAndroidPicker && (
                  <DateTimePicker
                    value={draftDate}
                    mode="time"
                    display="clock"
                    is24Hour={false}
                    onChange={onPickerChange}
                  />
                )}
              </>
            )}

            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            >
              <Text style={styles.saveBtnText}>
                {saving ? 'Saving…' : 'Save check-in time'}
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: T.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: T.line,
    shadowColor: T.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: T.green,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: T.green,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
    flexShrink: 0,
  },
  sparkBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: T.purple,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: T.surface,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: T.ink,
  },
  subtitle: {
    fontSize: 12.5,
    color: T.inkSoft,
    marginTop: 2,
    fontWeight: '500',
  },
  timeBtn: {
    marginTop: 13,
    borderWidth: 1,
    borderColor: T.line,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  timeMain: {
    fontSize: 15,
    fontWeight: '800',
    color: T.greenDeep,
    letterSpacing: -0.2,
  },
  timeEta: {
    fontSize: 11.5,
    color: T.inkSoft,
    fontWeight: '600',
    marginTop: 1,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  editLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: T.green,
  },
  // sheet
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(8,24,16,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: T.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 32,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.line,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  sheetSuper: {
    fontSize: 11,
    color: T.inkMuted,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sheetTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: T.ink,
    marginTop: 4,
    letterSpacing: -0.3,
  },
  sheetSub: {
    fontSize: 12.5,
    color: T.inkSoft,
    marginTop: 4,
    fontWeight: '500',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: T.lineSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // iOS: inline wheel spinner
  pickerWrap: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: T.line,
    borderRadius: 16,
    backgroundColor: T.lineSoft,
    overflow: 'hidden',
  },
  iosPicker: {
    height: 190,
  },
  // Android: tappable row that opens the native clock dialog
  androidTimeBtn: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderColor: T.green,
    backgroundColor: T.greenSoft,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  androidTimeValue: {
    fontSize: 22,
    fontWeight: '800',
    color: T.greenDeep,
    letterSpacing: -0.4,
  },
  androidTimeHint: {
    fontSize: 12,
    fontWeight: '600',
    color: T.inkSoft,
    marginTop: 2,
  },
  saveBtn: {
    marginTop: 18,
    backgroundColor: T.green,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: T.green,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 5,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: T.surface,
  },
});
