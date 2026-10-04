package com.nutritiontrackerzero.incomingcall

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import org.json.JSONObject

/**
 * Native one-shot re-rings (Snooze and the automatic +60 min retry). They fire
 * CallActionReceiver.ACTION_SNOOZE_FIRE, which starts IncomingCallService directly, so they work
 * with the app process killed and need no JS. Each kind has its own request code, so a snooze
 * never overwrites the retry PendingIntent (and vice versa).
 */
object CallAlarms {
  private const val TAG = "CallAlarms"
  private const val REQUEST_SNOOZE = 21
  private const val REQUEST_RETRY = 22

  /** Re-ring in 10 minutes ("Snooze" on the missed-call notification). Replaces the auto-retry. */
  fun scheduleSnooze(context: Context, payloadJson: String) {
    cancelRetry(context)
    schedule(context, payloadJson, System.currentTimeMillis() + CallConstants.SNOOZE_DELAY_MS, REQUEST_SNOOZE)
  }

  /**
   * After a SCHEDULED ring times out, re-ring once 60 minutes later. The re-ring carries
   * callKind "retry", so it never schedules another one: at most 2 automatic rings per day.
   */
  fun maybeScheduleRetry(context: Context, payloadJson: String) {
    val kind = try { JSONObject(payloadJson).optString("callKind") } catch (_: Exception) { "" }
    if (kind != "scheduled") return
    schedule(context, payloadJson, System.currentTimeMillis() + CallConstants.RETRY_DELAY_MS, REQUEST_RETRY)
  }

  /** Called when the user handles the day's call some other way (Log now, Talk now, a started call). */
  fun cancelRetry(context: Context) {
    val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
    val existing =
      PendingIntent.getBroadcast(context, REQUEST_RETRY, fireIntent(context, null), flags() or PendingIntent.FLAG_NO_CREATE)
    if (existing != null) {
      am.cancel(existing)
      existing.cancel()
    }
  }

  private fun schedule(context: Context, payloadJson: String, fireAt: Long, requestCode: Int) {
    val updatedJson =
      try {
        JSONObject(payloadJson).apply {
          put("intendedFireAt", fireAt)
          put("isRescheduled", true)
          put("callKind", "retry")
        }.toString()
      } catch (_: Exception) {
        payloadJson
      }
    val operation = PendingIntent.getBroadcast(context, requestCode, fireIntent(context, updatedJson), flags())
    val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
    try {
      val canExact = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) am.canScheduleExactAlarms() else true
      if (canExact) {
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAt, operation)
      } else {
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAt, operation)
      }
    } catch (e: SecurityException) {
      Log.w(TAG, "Exact alarm denied; using inexact", e)
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAt, operation)
    }
  }

  private fun fireIntent(context: Context, payloadJson: String?) =
    Intent(context, CallActionReceiver::class.java).apply {
      action = CallConstants.ACTION_SNOOZE_FIRE
      if (payloadJson != null) putExtra(CallConstants.EXTRA_PAYLOAD, payloadJson)
    }

  private fun flags(): Int {
    var flags = PendingIntent.FLAG_UPDATE_CURRENT
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags = flags or PendingIntent.FLAG_IMMUTABLE
    return flags
  }
}
