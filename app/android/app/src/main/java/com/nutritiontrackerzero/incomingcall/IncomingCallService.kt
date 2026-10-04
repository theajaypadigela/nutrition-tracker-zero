package com.nutritiontrackerzero.incomingcall

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * Foreground service that owns a ringing call for its whole lifetime: it posts the CallStyle +
 * full-screen-intent notification (as its foreground notification), plays the looping ringtone
 * (Ringer), and runs the 60s ring timeout. Because a foreground service keeps the process alive,
 * the ring no longer depends on the full-screen Activity launching — so a call rings reliably even
 * when the Activity is blocked (Android 14+ full-screen-intent denied, or a background launch).
 *
 * Started as a phoneCall foreground service, which is permitted because the app holds
 * MANAGE_OWN_CALLS. When fired from an exact alarm (the reminder path) or a snooze alarm, the OS
 * grants the temporary background-FGS-start allowance these alarms carry.
 *
 * Terminal transitions:
 *  - Answer / Decline → IncomingCallController.endCall → stop().
 *  - 60s timeout (here) → write a "missed" marker + post the audible missed-call follow-up, then stop.
 */
class IncomingCallService : Service() {

  private val handler = Handler(Looper.getMainLooper())
  private var timeoutRunnable: Runnable? = null
  private var currentPayloadJson: String? = null

  companion object {
    private const val TAG = "IncomingCallService"

    /** Start (or replace) the ringing call. Falls back to a plain notification if the OS blocks the FGS. */
    fun start(context: Context, payloadJson: String) {
      val intent =
        Intent(context, IncomingCallService::class.java).apply {
          action = CallConstants.ACTION_START_CALL
          putExtra(CallConstants.EXTRA_PAYLOAD, payloadJson)
        }
      try {
        ContextCompat.startForegroundService(context, intent)
      } catch (e: Exception) {
        // e.g. ForegroundServiceStartNotAllowedException when not in an exempt window. Still show
        // the call notification (its full-screen intent can ring via the Activity) so the call
        // isn't lost — it just won't have the service-owned ringer.
        Log.w(TAG, "FGS start blocked; falling back to notification only", e)
        IncomingCallPayload.fromJson(payloadJson)?.let {
          CallNotificationBuilder.post(context.applicationContext, it)
        }
      }
    }

    fun stop(context: Context) {
      // stopService (not a startForegroundService STOP command): the latter would require us to
      // call startForeground within 5s and crash. Destroying the service runs onDestroy, which
      // stops the ringer and removes the foreground notification.
      context.stopService(Intent(context, IncomingCallService::class.java))
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val payloadJson = intent?.getStringExtra(CallConstants.EXTRA_PAYLOAD)
    val payload = IncomingCallPayload.fromJson(payloadJson)
    if (payload == null) {
      // No payload to ring (shouldn't happen — start() always passes one). Bail without entering
      // the foreground; nothing to tear down.
      stopSelf()
      return START_NOT_STICKY
    }
    currentPayloadJson = payloadJson

    val notification = CallNotificationBuilder.buildCallNotification(this, payload)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        ServiceCompat.startForeground(
          this,
          CallConstants.NOTIFICATION_ID,
          notification,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL,
        )
      } else {
        startForeground(CallConstants.NOTIFICATION_ID, notification)
      }
    } catch (e: Exception) {
      // Could not enter the foreground (rare: type/permission mismatch). Post the notification so
      // the full-screen intent still rings via the Activity, then bail.
      Log.w(TAG, "startForeground failed; posting notification only", e)
      CallNotificationBuilder.post(applicationContext, payload)
      stopSelf()
      return START_NOT_STICKY
    }

    Ringer.start(this)
    scheduleTimeout()
    return START_NOT_STICKY
  }

  private fun scheduleTimeout() {
    timeoutRunnable?.let { handler.removeCallbacks(it) }
    val r = Runnable { onTimeout() }
    timeoutRunnable = r
    handler.postDelayed(r, CallConstants.RING_TIMEOUT_MS)
  }

  /** The call rang out unanswered: record the miss for JS, show the audible follow-up, tear down. */
  private fun onTimeout() {
    val payloadJson = currentPayloadJson ?: "{}"
    IncomingCallStore.addMarker(applicationContext, payloadJson, CallConstants.RESULT_MISSED)
    CallAlarms.maybeScheduleRetry(applicationContext, payloadJson)
    IncomingCallPayload.fromJson(payloadJson)?.let {
      MissedCallNotificationBuilder.post(applicationContext, it)
    }
    // Dismiss the full-screen Activity if it is showing.
    sendBroadcast(Intent(CallConstants.ACTION_DISMISS_UI).setPackage(packageName))
    teardown(removeNotification = true)
  }

  private fun teardown(removeNotification: Boolean) {
    timeoutRunnable?.let { handler.removeCallbacks(it) }
    timeoutRunnable = null
    Ringer.stop()
    val flag = if (removeNotification) ServiceCompat.STOP_FOREGROUND_REMOVE else ServiceCompat.STOP_FOREGROUND_DETACH
    ServiceCompat.stopForeground(this, flag)
    stopSelf()
  }

  override fun onDestroy() {
    timeoutRunnable?.let { handler.removeCallbacks(it) }
    timeoutRunnable = null
    Ringer.stop()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null
}
