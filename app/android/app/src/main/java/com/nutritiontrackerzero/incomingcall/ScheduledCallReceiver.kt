package com.nutritiontrackerzero.incomingcall

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/** Alarm delivery and recovery run without React Native, Metro, network, or an Activity. */
class ScheduledCallReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    try {
      if (intent.action == NativeCallScheduler.ACTION_FIRE) {
        NativeCallScheduler.fire(context.applicationContext, intent)
      } else {
        NativeCallScheduler.restore(context.applicationContext)
      }
    } catch (e: Exception) {
      ReminderDiagnostics.record(context, "receiver_failed", error = e)
      Log.e("ScheduledCallReceiver", "Could not deliver/restore reminder", e)
    }
  }
}
