package com.nutritiontrackerzero.incomingcall

import android.app.ActivityManager
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.os.PowerManager
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject
import com.nutritiontrackerzero.BuildConfig

/** Persist only reminder delivery stages/settings, never profile data or voice credentials. */
object ReminderDiagnostics {
  private const val PREFS = "reminder_diagnostics_v1"

  @Synchronized
  fun record(context: Context, stage: String, id: String? = null, intendedFireAt: Long? = null,
    error: Exception? = null) {
    try {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val prior = JSONArray(prefs.getString("events", "[]"))
      val events = JSONArray()
      for (i in maxOf(0, prior.length() - 29) until prior.length()) events.put(prior.get(i))
      events.put(JSONObject().apply {
        put("stage", stage)
        put("at", System.currentTimeMillis())
        if (id != null) put("id", id)
        if (intendedFireAt != null) put("intendedFireAt", intendedFireAt)
        if (error != null) put("error", error.javaClass.simpleName)
      })
      prefs.edit().putString("events", events.toString()).commit()
    } catch (_: Exception) { /* Diagnostics must never interrupt delivery. */ }
  }

  fun snapshot(context: Context): String = JSONObject().apply {
    put("schedulerVersion", 2)
    put("appVersion", BuildConfig.VERSION_NAME)
    put("manufacturer", Build.MANUFACTURER)
    put("brand", Build.BRAND)
    put("model", Build.MODEL)
    put("androidVersion", Build.VERSION.RELEASE)
    put("androidSdk", Build.VERSION.SDK_INT)
    put("exactAlarmAllowed", NativeCallScheduler.canScheduleExact(context))
    put("notificationsEnabled", NotificationManagerCompat.from(context).areNotificationsEnabled())
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    put("fullScreenAllowed", Build.VERSION.SDK_INT < 34 || nm.canUseFullScreenIntent())
    val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    put("batteryOptimizationExcluded", power.isIgnoringBatteryOptimizations(context.packageName))
    val activity = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    put("backgroundRestricted", Build.VERSION.SDK_INT >= 28 && activity.isBackgroundRestricted)
    put("schedules", NativeCallScheduler.scheduleSnapshot(context))
    put("events", JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("events", "[]")))
  }.toString()
}
