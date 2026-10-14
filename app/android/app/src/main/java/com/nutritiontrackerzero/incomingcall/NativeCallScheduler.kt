package com.nutritiontrackerzero.incomingcall

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.nutritiontrackerzero.MainActivity
import org.json.JSONObject
import org.json.JSONArray

/** Persisted one-shot alarms: the receiver arms tomorrow BEFORE starting today's ring service.
 * Repeating AlarmManager alarms are inexact; chaining one-shots retains exactness in Doze.
 * SharedPreferences commit + synchronized methods prevent save/disable/delivery races. */
object NativeCallScheduler {
  const val ACTION_FIRE = "com.nutritiontrackerzero.SCHEDULED_CALL"
  private const val PREFS = "native_call_schedule_v1"
  private const val EXTRA_ID = "scheduleId"
  private const val EXTRA_FIRE_AT = "scheduledFireAt"
  private val IDS = listOf("call-daily", "call-test")
  private const val STALE_MS = 5 * 60 * 1000L

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  private fun manager(context: Context) = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  fun canScheduleExact(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.S || manager(context).canScheduleExactAlarms()

  @Synchronized
  fun scheduleSnapshot(context: Context): JSONArray = JSONArray().apply {
    for (id in IDS) {
      val options = prefs(context).getString(id, null)?.let(::JSONObject) ?: continue
      put(JSONObject().apply {
        put("id", id)
        put("fireAt", options.getLong("fireAt"))
        put("repeatDaily", options.getBoolean("repeatDaily"))
        if (options.has("callTime")) put("callTime", options.getString("callTime"))
        if (options.has("timezone")) put("timezone", options.getString("timezone"))
      })
    }
  }

  @Synchronized
  fun schedule(context: Context, optionsJson: String): Long {
    val options = JSONObject(optionsJson)
    val id = options.getString("id")
    require(id in IDS) { "Unknown reminder id" }
    require(IncomingCallPayload.fromJson(options.getJSONObject("payload").toString()) != null)
    val now = System.currentTimeMillis()
    val old = prefs(context).getString(id, null)
    val previous = old?.let(::JSONObject)
    val fireAt = if (options.getBoolean("repeatDaily")) {
      require(id == "call-daily")
      val sameTime = previous?.optBoolean("repeatDaily") == true &&
        previous.optString("callTime") == options.getString("callTime") &&
        previous.optString("timezone") == options.getString("timezone")
      // Resume/save can race the receiver at the scheduled minute. Keep that occurrence
      // (and re-arm it if the OS lost it) instead of advancing it to tomorrow before it rings.
      if (sameTime && previous!!.getLong("fireAt") >= now - STALE_MS) previous.getLong("fireAt")
      else DailyCallTime.nextOccurrence(options.getString("callTime"), options.getString("timezone"), now)
    } else {
      options.getLong("fireAt").also { require(it > now) { "Reminder time must be in the future" } }
    }
    options.put("fireAt", fireAt)
    check(prefs(context).edit().putString(id, options.toString()).commit()) { "Could not save reminder" }
    try {
      arm(context, id, fireAt)
      ReminderDiagnostics.record(context, if (canScheduleExact(context)) "armed_exact" else "armed_inexact", id, fireAt)
    } catch (e: Exception) {
      prefs(context).edit().putString(id, old).commit()
      throw e
    }
    return fireAt
  }

  @Synchronized
  fun cancel(context: Context, id: String) {
    require(id in IDS) { "Unknown reminder id" }
    check(prefs(context).edit().remove(id).commit()) { "Could not cancel reminder" }
    operation(context, id, 0, PendingIntent.FLAG_NO_CREATE)?.let {
      manager(context).cancel(it)
      it.cancel()
    }
    if (id == "call-daily") CallAlarms.cancelAll(context)
    ReminderDiagnostics.record(context, "cancelled", id)
  }

  @Synchronized
  fun restore(context: Context) {
    val now = System.currentTimeMillis()
    for (id in IDS) {
      val options = prefs(context).getString(id, null)?.let(::JSONObject) ?: continue
      if (options.getBoolean("repeatDaily")) {
        val fireAt = DailyCallTime.nextOccurrence(options.getString("callTime"), options.getString("timezone"), now)
        options.put("fireAt", fireAt)
        check(prefs(context).edit().putString(id, options.toString()).commit())
        arm(context, id, fireAt)
      } else if (options.getLong("fireAt") > now) {
        arm(context, id, options.getLong("fireAt"))
      } else {
        cancel(context, id) // Do not replay an expired test call after reboot.
      }
    }
  }

  @Synchronized
  fun fire(context: Context, intent: Intent) {
    val id = intent.getStringExtra(EXTRA_ID) ?: return
    if (id !in IDS) return
    val options = prefs(context).getString(id, null)?.let(::JSONObject) ?: return
    val intended = intent.getLongExtra(EXTRA_FIRE_AT, 0)
    // A queued alarm from before an edit/disable, or duplicate delivery, is obsolete.
    if (intended <= 0 || intended != options.getLong("fireAt")) {
      ReminderDiagnostics.record(context, "obsolete_delivery", id, intended)
      return
    }
    val now = System.currentTimeMillis()
    ReminderDiagnostics.record(context, "alarm_received", id, intended)
    val payload = options.getJSONObject("payload").put("intendedFireAt", intended).toString()
    if (options.getBoolean("repeatDaily")) {
      val next = DailyCallTime.nextOccurrence(options.getString("callTime"), options.getString("timezone"), maxOf(now, intended))
      options.put("fireAt", next)
      check(prefs(context).edit().putString(id, options.toString()).commit())
      try {
        arm(context, id, next)
      } catch (e: Exception) {
        // A failure to arm tomorrow must not suppress the call already due today.
        Log.e("NativeCallScheduler", "Could not arm the next daily reminder", e)
      }
    } else {
      check(prefs(context).edit().remove(id).commit())
    }
    if (now - intended > STALE_MS) {
      ReminderDiagnostics.record(context, "stale_delivery", id, intended)
      IncomingCallStore.addMarker(context, payload, CallConstants.RESULT_MISSED)
      IncomingCallPayload.fromJson(payload)?.let { MissedCallNotificationBuilder.post(context, it) }
      return
    }
    Log.i("NativeCallScheduler", "Delivering $id; latenessMs=${now - intended}")
    IncomingCallService.start(context, payload)
  }

  private fun arm(context: Context, id: String, fireAt: Long) {
    val am = manager(context)
    val operation = operation(context, id, fireAt, PendingIntent.FLAG_UPDATE_CURRENT)!!
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()) {
      val show = PendingIntent.getActivity(context, 43, Intent(context, MainActivity::class.java),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      try {
        am.setAlarmClock(AlarmManager.AlarmClockInfo(fireAt, show), operation)
        return
      } catch (e: SecurityException) {
        Log.w("NativeCallScheduler", "Exact permission revoked; scheduling inexact reminder", e)
      }
    }
    // The health screen identifies this degraded mode; it cannot promise exact delivery.
    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAt, operation)
  }

  private fun operation(context: Context, id: String, fireAt: Long, flags: Int): PendingIntent? =
    PendingIntent.getBroadcast(context, if (id == "call-daily") 41 else 42,
      Intent(context, ScheduledCallReceiver::class.java).apply {
        action = ACTION_FIRE
        putExtra(EXTRA_ID, id)
        putExtra(EXTRA_FIRE_AT, fireAt)
      }, flags or PendingIntent.FLAG_IMMUTABLE)
}
