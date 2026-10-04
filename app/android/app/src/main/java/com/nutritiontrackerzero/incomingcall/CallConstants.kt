package com.nutritiontrackerzero.incomingcall

/** Shared constants for the native incoming-call surface. */
object CallConstants {
  /** High-importance, SILENT channel (the foreground-service ringer owns the looping ringtone). */
  const val NOTIFICATION_CHANNEL_ID = "incoming-call-native-v1"
  const val NOTIFICATION_CHANNEL_NAME = "Incoming Calls"

  /** Only one call is ever in flight, so a single fixed notification id is enough. */
  const val NOTIFICATION_ID = 0x0CA11 // "CALL"

  /**
   * Audible "you missed a call" follow-up channel + notification. Kept in sync with
   * channels.ts MISSED_CHANNEL_ID. A distinct notification id so cancelling the call
   * notification never removes the missed follow-up.
   */
  const val MISSED_CHANNEL_ID = "reminder-missed-v2"
  const val MISSED_CHANNEL_NAME = "Missed Reminders"
  const val MISSED_NOTIFICATION_ID = 0x0D15 // "MISS"

  /** How long the call rings before it is treated as missed. Mirrors callLifecycle.RING_TIMEOUT_MS. */
  const val RING_TIMEOUT_MS = 60_000L

  /** How long "Snooze" on a missed call waits before ringing again. */
  const val SNOOZE_DELAY_MS = 10 * 60 * 1000L

  // Broadcast / intent actions.
  const val ACTION_DECLINE = "com.nutritiontrackerzero.incomingcall.ACTION_DECLINE"
  const val ACTION_DISMISS_UI = "com.nutritiontrackerzero.incomingcall.ACTION_DISMISS_UI"
  /** Missed-call "Snooze" tapped → schedule a re-ring. */
  const val ACTION_SNOOZE = "com.nutritiontrackerzero.incomingcall.ACTION_SNOOZE"
  /** The snooze alarm fired → re-present the call. */
  const val ACTION_SNOOZE_FIRE = "com.nutritiontrackerzero.incomingcall.ACTION_SNOOZE_FIRE"
  // Foreground-service control actions.
  const val ACTION_START_CALL = "com.nutritiontrackerzero.incomingcall.ACTION_START_CALL"
  const val ACTION_STOP_CALL = "com.nutritiontrackerzero.incomingcall.ACTION_STOP_CALL"

  // Intent extras.
  /** Full call payload JSON — carried on the present/decline/full-screen intents. */
  const val EXTRA_PAYLOAD = "incoming_call_payload"
  /** Answer payload JSON — carried to MainActivity when the user accepts. */
  const val EXTRA_ANSWERED_CALL = "answered_call_payload"
  /** Missed-call follow-up action JSON — carried to MainActivity when "Log now"/tap is used. */
  const val EXTRA_MISSED_ACTION = "missed_action_payload"

  // Marker result values written to IncomingCallStore for JS to drain.
  const val RESULT_DECLINED = "declined"
  /** A call that rang out unanswered (60s timeout). JS records it + reports MISSED to the server. */
  const val RESULT_MISSED = "missed"
}
