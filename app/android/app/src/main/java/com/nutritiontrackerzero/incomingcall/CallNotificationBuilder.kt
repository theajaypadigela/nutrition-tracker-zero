package com.nutritiontrackerzero.incomingcall

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import androidx.core.graphics.drawable.IconCompat
import com.nutritiontrackerzero.MainActivity
import com.nutritiontrackerzero.R

/**
 * Builds and posts the incoming-call notification:
 *  - API 31+: a real Notification.CallStyle (native call chrome with Answer/Decline pills).
 *  - API 26-30: a high-priority notification with two actions.
 * Always carries a full-screen intent at IncomingCallActivity (the branded ring screen) so the
 * OS launches it over the lockscreen even when the app process was killed. The channel is SILENT
 * — the looping ringtone is played by IncomingCallService (Ringer) so we never double-ring.
 *
 * This notification is used as the foreground-service notification (IncomingCallService), so the
 * ring is owned by the service and no longer depends on the full-screen Activity launching.
 */
object CallNotificationBuilder {

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CallConstants.NOTIFICATION_CHANNEL_ID) != null) return
    val channel =
      NotificationChannel(
        CallConstants.NOTIFICATION_CHANNEL_ID,
        CallConstants.NOTIFICATION_CHANNEL_NAME,
        NotificationManager.IMPORTANCE_HIGH,
      ).apply {
        description = "Full-screen incoming voice-assistant calls"
        setSound(null, null) // silent — the ring screen owns the looping ringtone
        enableVibration(false) // Ringer owns vibration
        setBypassDnd(false)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      }
    nm.createNotificationChannel(channel)
  }

  fun post(context: Context, payload: IncomingCallPayload) {
    ensureChannel(context)
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.notify(CallConstants.NOTIFICATION_ID, build(context, payload))
  }

  fun cancel(context: Context) {
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.cancel(CallConstants.NOTIFICATION_ID)
  }

  /** Public so IncomingCallService can use it as its startForeground notification. */
  fun buildCallNotification(context: Context, payload: IncomingCallPayload): Notification {
    ensureChannel(context)
    return build(context, payload)
  }

  private fun build(context: Context, payload: IncomingCallPayload): Notification {
    val person =
      Person.Builder()
        .setName(payload.assistantName)
        .setIcon(IconCompat.createWithResource(context, R.drawable.ic_assistant_bot))
        .setImportant(true)
        .build()

    // Answer → launch MainActivity (React Native) with the answer payload. getActivity is the
    // sanctioned way to launch an Activity from a notification action in the background.
    val answerIntent =
      PendingIntent.getActivity(
        context,
        1,
        Intent(context, MainActivity::class.java).apply {
          addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK or
              Intent.FLAG_ACTIVITY_SINGLE_TOP or
              Intent.FLAG_ACTIVITY_CLEAR_TOP,
          )
          putExtra(CallConstants.EXTRA_ANSWERED_CALL, payload.raw)
        },
        piFlags(),
      )

    // Decline → broadcast to CallActionReceiver (works from background without launching the UI).
    val declineIntent =
      PendingIntent.getBroadcast(
        context,
        2,
        Intent(context, CallActionReceiver::class.java).apply {
          action = CallConstants.ACTION_DECLINE
          putExtra(CallConstants.EXTRA_PAYLOAD, payload.raw)
        },
        piFlags(),
      )

    val fullScreenIntent =
      PendingIntent.getActivity(
        context,
        3,
        IncomingCallActivity.createIntent(context, payload.raw),
        piFlags(),
      )

    val builder =
      NotificationCompat.Builder(context, CallConstants.NOTIFICATION_CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_call_small)
        .setContentTitle(payload.assistantName)
        .setContentText(payload.subtitle)
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setOngoing(true)
        .setAutoCancel(false)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setFullScreenIntent(fullScreenIntent, true)
        .setContentIntent(fullScreenIntent)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      builder.setStyle(
        NotificationCompat.CallStyle.forIncomingCall(person, declineIntent, answerIntent),
      )
    } else {
      builder
        .addAction(R.drawable.ic_call_decline, "Decline", declineIntent)
        .addAction(R.drawable.ic_call_answer, "Answer", answerIntent)
    }

    return builder.build()
  }

  private fun piFlags(): Int {
    var flags = PendingIntent.FLAG_UPDATE_CURRENT
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      flags = flags or PendingIntent.FLAG_IMMUTABLE
    }
    return flags
  }
}
