package com.nutritiontrackerzero.incomingcall

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Background handler (no Activity) for notification actions:
 *  - Decline (CallStyle notification) → record the declined marker and end the call.
 *  - Snooze (missed-call follow-up) → schedule an exact alarm that re-rings the call ~10 min later
 *    and dismiss the missed notification. Fully native, so it works even if the app is never opened.
 *  - Snooze fire (the alarm) → re-present the call via IncomingCallService.
 *
 * Answer is a getActivity PendingIntent straight to MainActivity, so it does not pass through here.
 */
class CallActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      CallConstants.ACTION_DECLINE -> {
        val payloadJson = intent.getStringExtra(CallConstants.EXTRA_PAYLOAD) ?: "{}"
        IncomingCallController.handleDecline(context.applicationContext, payloadJson)
      }
      CallConstants.ACTION_SNOOZE -> {
        val payloadJson = intent.getStringExtra(CallConstants.EXTRA_PAYLOAD) ?: return
        CallAlarms.scheduleSnooze(context.applicationContext, payloadJson)
        MissedCallNotificationBuilder.cancel(context.applicationContext)
      }
      CallConstants.ACTION_SNOOZE_FIRE -> {
        val payloadJson = intent.getStringExtra(CallConstants.EXTRA_PAYLOAD) ?: return
        IncomingCallService.start(context.applicationContext, payloadJson)
      }
    }
  }

  /** Re-arm the call for SNOOZE_DELAY_MS from now, stamping the new intended fire time on the payload. */
}
