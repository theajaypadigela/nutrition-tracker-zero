/**
 * Android notification channels. Ids must match the Kotlin CallConstants:
 * NOTIFICATION_CHANNEL_ID (native CallStyle ring) and MISSED_CHANNEL_ID (missed follow-up).
 * Channel settings are immutable once created, so changes need a new id.
 */
import notifee, { AndroidImportance, AndroidVisibility } from '@notifee/react-native';
import { Platform } from 'react-native';
import { reminderLog } from './logger';

/** Silent alarm carrier: fires the trigger and the DELIVERED event, then is cancelled. */
export const CALL_HEARTBEAT_CHANNEL_ID = 'call-heartbeat-v1';
/** The native full-screen ring (CallStyle). Silent: the native Ringer plays the ringtone. */
export const NATIVE_CALL_CHANNEL_ID = 'incoming-call-native-v1';
/** Audible "you missed your call" follow-ups. */
export const MISSED_CHANNEL_ID = 'reminder-missed-v2';

const CHANNELS = [
  { id: NATIVE_CALL_CHANNEL_ID, name: 'Incoming Calls', description: 'Full-screen daily food check-in calls', importance: AndroidImportance.HIGH, silent: true },
  { id: CALL_HEARTBEAT_CHANNEL_ID, name: 'Call Delivery', description: 'Internal: wakes the app to ring a call (no sound of its own)', importance: AndroidImportance.LOW, silent: true },
  { id: MISSED_CHANNEL_ID, name: 'Missed Calls', description: 'Follow-ups when a check-in call was missed', importance: AndroidImportance.HIGH, silent: false },
];

export async function ensureChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  for (const c of CHANNELS) {
    await notifee.createChannel({
      id: c.id,
      name: c.name,
      description: c.description,
      importance: c.importance,
      visibility: AndroidVisibility.PUBLIC,
      bypassDnd: false,
      vibration: !c.silent,
      sound: c.silent ? undefined : 'default',
    });
  }
}

export interface ChannelHealth {
  id: string;
  exists: boolean;
  blocked: boolean;
  loweredImportance: boolean;
}

/** Users can mute or lower the call channel; we can only detect it and send them to settings. */
export async function inspectCallChannel(): Promise<ChannelHealth | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const channel = await notifee.getChannel(NATIVE_CALL_CHANNEL_ID);
    if (!channel) return { id: NATIVE_CALL_CHANNEL_ID, exists: false, blocked: false, loweredImportance: false };
    return {
      id: NATIVE_CALL_CHANNEL_ID,
      exists: true,
      blocked: channel.blocked === true,
      loweredImportance: (channel.importance ?? AndroidImportance.HIGH) < AndroidImportance.HIGH,
    };
  } catch (e) {
    reminderLog.warn('channel.inspect_failed', 'Could not inspect the call channel', { error: String(e) });
    return { id: NATIVE_CALL_CHANNEL_ID, exists: false, blocked: false, loweredImportance: false };
  }
}
