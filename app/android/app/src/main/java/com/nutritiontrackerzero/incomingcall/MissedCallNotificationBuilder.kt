package com.nutritiontrackerzero.incomingcall

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import com.nutritiontrackerzero.MainActivity
import com.nutritiontrackerzero.R

/**
 * Posts the audible "you missed your call" follow-up the instant a call rings out unanswered —
 * from IncomingCallService, which is alive through the whole ring even when the app process is
 * dead. (The JS reconciliation pass only surfaces misses on next app open, so without this a
 * killed-app miss produced no notification at all.)
 *
 * Two actions, so the user can take action straight from the notification:
 *  - "Log now" (and tapping the body) opens the app to log via voice (routed by JS from the
 *    EXTRA_MISSED_ACTION payload).
 *  - "Snooze" schedules a re-ring ~10 min later (CallActionReceiver → AlarmManager), fully native
 *    so it works even if the app is never opened.
 */
object MissedCallNotificationBuilder {

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    // Channel settings are immutable once created; if JS (channels.ts) already created it with the
    // same id + settings this is a no-op, keeping the two in sync.
    if (nm.getNotificationChannel(CallConstants.MISSED_CHANNEL_ID) != null) return
    val channel =
      NotificationChannel(
        CallConstants.MISSED_CHANNEL_ID,
        CallConstants.MISSED_CHANNEL_NAME,
        NotificationManager.IMPORTANCE_HIGH,
      ).apply {
        description = "Audible follow-up when a reminder call was missed"
        enableVibration(true)
        val attrs =
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        setSound(
          RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
          attrs,
        )
      }
    nm.createNotificationChannel(channel)
  }

  fun post(context: Context, payload: IncomingCallPayload) {
    ensureChannel(context)
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.notify(CallConstants.MISSED_NOTIFICATION_ID, build(context, payload))
  }

  fun cancel(context: Context) {
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.cancel(CallConstants.MISSED_NOTIFICATION_ID)
  }

  private fun build(context: Context, payload: IncomingCallPayload): Notification {
    val title =
      if (payload.isMeal) "You missed your food logging call"
      else "You missed your habit call"

    // "Log now" / tap → open the app with the missed payload so JS routes into the voice log.
    val logIntent =
      PendingIntent.getActivity(
        context,
        11,
        Intent(context, MainActivity::class.java).apply {
          addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK or
              Intent.FLAG_ACTIVITY_SINGLE_TOP or
              Intent.FLAG_ACTIVITY_CLEAR_TOP,
          )
          putExtra(CallConstants.EXTRA_MISSED_ACTION, payload.raw)
        },
        piFlags(),
      )

    // "Snooze" → broadcast (works from the background, no UI) → schedule a re-ring.
    val snoozeIntent =
      PendingIntent.getBroadcast(
        context,
        12,
        Intent(context, CallActionReceiver::class.java).apply {
          action = CallConstants.ACTION_SNOOZE
          putExtra(CallConstants.EXTRA_PAYLOAD, payload.raw)
        },
        piFlags(),
      )

    return NotificationCompat.Builder(context, CallConstants.MISSED_CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_call_small)
      .setContentTitle(title)
      .setContentText("Tap to log now, or snooze.")
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setAutoCancel(true)
      .setContentIntent(logIntent)
      .addAction(R.drawable.ic_call_answer, "Log now", logIntent)
      .addAction(R.drawable.ic_call_small, "Snooze", snoozeIntent)
      .build()
  }

  private fun piFlags(): Int {
    var flags = PendingIntent.FLAG_UPDATE_CURRENT
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      flags = flags or PendingIntent.FLAG_IMMUTABLE
    }
    return flags
  }
}
