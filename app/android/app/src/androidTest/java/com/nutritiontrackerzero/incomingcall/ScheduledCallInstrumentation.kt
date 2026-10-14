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
        check(NativeCallScheduler.scheduleSnapshot(targetContext).length() == 0)
        finish(0, Bundle())
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
