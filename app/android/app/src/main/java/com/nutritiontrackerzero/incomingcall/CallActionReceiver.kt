package com.nutritiontrackerzero.incomingcall

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import org.json.JSONObject

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
        scheduleSnooze(context.applicationContext, payloadJson)
        MissedCallNotificationBuilder.cancel(context.applicationContext)
      }
      CallConstants.ACTION_SNOOZE_FIRE -> {
        val payloadJson = intent.getStringExtra(CallConstants.EXTRA_PAYLOAD) ?: return
        IncomingCallService.start(context.applicationContext, payloadJson)
      }
    }
  }

  /** Re-arm the call for SNOOZE_DELAY_MS from now, stamping the new intended fire time on the payload. */
  private fun scheduleSnooze(context: Context, payloadJson: String) {
    val fireAt = System.currentTimeMillis() + CallConstants.SNOOZE_DELAY_MS
    val updatedJson =
      try {
        JSONObject(payloadJson).apply {
          put("intendedFireAt", fireAt)
          put("isRescheduled", true)
        }.toString()
      } catch (_: Exception) {
        payloadJson
      }

    val operation =
      PendingIntent.getBroadcast(
        context,
        21,
        Intent(context, CallActionReceiver::class.java).apply {
          action = CallConstants.ACTION_SNOOZE_FIRE
          putExtra(CallConstants.EXTRA_PAYLOAD, updatedJson)
        },
        piFlags(),
      )

    val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
    try {
      val canExact =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) am.canScheduleExactAlarms() else true
      if (canExact) {
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAt, operation)
      } else {
        // Exact alarms not granted — inexact (a few minutes' slack) rather than nothing.
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAt, operation)
      }
    } catch (e: SecurityException) {
      Log.w("CallActionReceiver", "Exact snooze alarm denied; using inexact", e)
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAt, operation)
    }
  }

  private fun piFlags(): Int {
    var flags = PendingIntent.FLAG_UPDATE_CURRENT
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      flags = flags or PendingIntent.FLAG_IMMUTABLE
    }
    return flags
  }
}
