package com.nutritiontrackerzero.incomingcall

import android.app.Instrumentation
import android.os.Bundle
import org.json.JSONObject
import java.util.Calendar
import java.util.TimeZone

/** Device-only regression harness. It never starts React Native or the voice provider.
 * Run on the isolated .remindertest build, then kill its process before the reported epoch.
 * A ring service and next-day persisted alarm prove native delivery/recurrence without JS. */
class ScheduledCallInstrumentation : Instrumentation() {
  private var scenario = "test"

  override fun onCreate(arguments: Bundle?) {
    super.onCreate(arguments)
    scenario = arguments?.getString("scenario") ?: "test"
    start()
  }

  override fun onStart() {
    try {
      check(targetContext.packageName.endsWith(".remindertest")) { "Use -PreminderTestApp to isolate device tests" }
      if (scenario == "diagnostics") {
        finish(0, Bundle().apply { putString("diagnostics", ReminderDiagnostics.snapshot(targetContext)) })
        return
      }
      if (scenario == "cancel") {
        NativeCallScheduler.cancel(targetContext, "call-daily")
        NativeCallScheduler.cancel(targetContext, "call-test")
        NativeCallScheduler.cancel(targetContext, "call-later")
        check(NativeCallScheduler.scheduleSnapshot(targetContext).length() == 0)
        finish(0, Bundle())
        return
      }
      // "Call me again in 20 minutes": the call back the person asked for during a call. `later` is a food-logging call back (a meal payload),
      // `later-habit` a habit reminder called back the same way, `later-replace` asks twice (the second replaces the first), `later-cancel`
      // takes it back. Each rings ten seconds from now, with the app process dead, and is not repeated.
      if (scenario.startsWith("later")) {
        val habit = scenario == "later-habit"
        fun callback(afterMs: Long, subtitle: String): Long {
          val at = System.currentTimeMillis() + afterMs
          val options = JSONObject().apply {
            put("id", "call-later")
            put("repeatDaily", false)
            put("fireAt", at)
            put("payload", JSONObject().apply {
              put("callKind", "retry")
              put("reason", "callback")
              put("notificationId", "call-later")
              put("type", if (habit) "habit" else "meal")
              put("kind", if (habit) "habit-call" else "meal-call")
              put("callId", "call-later")
              put("assistantName", "Food check-in test")
              put("subtitle", subtitle)
              if (habit) put("habitName", "Evening walk")
            })
          }
          return NativeCallScheduler.schedule(targetContext, options.toString())
        }
        if (scenario == "later-cancel") {
          callback(60_000, "Calling back as you asked")
          NativeCallScheduler.cancel(targetContext, "call-later")
          check(NativeCallScheduler.scheduleSnapshot(targetContext).length() == 0) { "A cancelled call back is still saved" }
          finish(0, Bundle().apply { putString("scenario", scenario) })
          return
        }
        var fireAt = callback(if (scenario == "later-replace") 120_000 else 10_000, "Calling back as you asked")
        if (scenario == "later-replace") {
          fireAt = callback(10_000, "Calling back as you asked")
          val saved = NativeCallScheduler.scheduleSnapshot(targetContext)
          check(saved.length() == 1 && saved.getJSONObject(0).getLong("fireAt") == fireAt) { "The second ask did not replace the first" }
        }
        val saved = NativeCallScheduler.scheduleSnapshot(targetContext)
        check(saved.length() == 1 && saved.getJSONObject(0).getString("id") == "call-later" && !saved.getJSONObject(0).getBoolean("repeatDaily"))
        finish(0, Bundle().apply { putLong("scheduledAt", fireAt); putString("scenario", scenario) })
        return
      }
      val repeating = scenario == "daily" || scenario == "race"
      val now = System.currentTimeMillis()
      var at = if (repeating) (now / 60_000 + 1) * 60_000 else now + 10_000
      if (repeating && at - now < 10_000) at += 60_000
      if (scenario == "race") at = now / 60_000 * 60_000
      val calendar = Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply { timeInMillis = at }
      val options = JSONObject().apply {
        put("id", if (repeating) "call-daily" else "call-test")
        put("repeatDaily", repeating)
        put("fireAt", at)
        put("callTime", "%02d:%02d".format(calendar.get(Calendar.HOUR_OF_DAY), calendar.get(Calendar.MINUTE)))
        put("timezone", "UTC")
        put("payload", JSONObject().apply {
          put("callKind", if (repeating) "scheduled" else "test")
          put("type", "meal")
          put("kind", "meal-call")
          put("assistantName", "Food check-in test")
          put("subtitle", "Native scheduling regression")
        })
      }
      var fireAt = NativeCallScheduler.schedule(targetContext, options.toString())
      if (scenario == "race") {
        // Simulate a saved occurrence that is due while a resume/save races its receiver.
        targetContext.getSharedPreferences("native_call_schedule_v1", 0).edit()
          .putString("call-daily", options.put("fireAt", at).toString()).commit()
        fireAt = NativeCallScheduler.schedule(targetContext, options.toString())
        check(fireAt == at) { "Resume skipped today's pending alarm" }
      }
      finish(0, Bundle().apply { putLong("scheduledAt", fireAt); putString("scenario", scenario) })
    } catch (e: Exception) {
      finish(1, Bundle().apply { putString("error", e.toString()) })
    }
  }
}
