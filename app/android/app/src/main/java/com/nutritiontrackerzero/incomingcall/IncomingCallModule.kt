package com.nutritiontrackerzero.incomingcall

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * JS bridge for the native incoming-call surface. Legacy module (works under the New
 * Architecture interop layer, same as SystemRingtoneModule).
 */
class IncomingCallModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "IncomingCall"

  /**
   * Show the incoming call. Starts IncomingCallService (a phoneCall foreground service) which owns
   * the CallStyle + full-screen-intent notification, the looping ringtone, and the 60s timeout —
   * so the call rings reliably even when the full-screen Activity can't launch. Additionally tries
   * to launch the Activity directly so the call fully takes over when the app is already in the
   * foreground; the direct launch is silently dropped in the background, where the full-screen
   * intent does the job.
   */
  @ReactMethod
  fun presentIncomingCall(payloadJson: String) {
    val payload = IncomingCallPayload.fromJson(payloadJson) ?: return
    val context = reactApplicationContext
    IncomingCallService.start(context, payloadJson)
    try {
      context.startActivity(IncomingCallActivity.createIntent(context, payloadJson))
    } catch (_: Exception) {
      // Background activity launch is blocked by the OS — the service's full-screen intent covers it.
    }
  }

  /** Tear down the current call UI (e.g. it was handled elsewhere / superseded). */
  @ReactMethod
  fun dismissIncomingCall() {
    IncomingCallController.endCall(reactApplicationContext)
  }

  /** Returns the accepted-call payload JSON (and clears it), or null if none. */
  @ReactMethod
  fun cancelAutoRetry() {
    CallAlarms.cancelRetry(reactApplicationContext)
  }

  @ReactMethod
  fun consumePendingAnswer(promise: Promise) {
    promise.resolve(IncomingCallStore.consumePendingAnswer(reactApplicationContext))
  }

  /** Returns a JSON-array string of pending terminal markers (declined / missed) and clears them. */
  @ReactMethod
  fun drainCallMarkers(promise: Promise) {
    promise.resolve(IncomingCallStore.drainMarkers(reactApplicationContext))
  }

  /**
   * Returns the payload JSON of a "Log now"/tapped missed-call follow-up (and clears it), or null.
   * JS routes the user into the voice log for that occurrence.
   */
  @ReactMethod
  fun consumePendingMissedAction(promise: Promise) {
    promise.resolve(IncomingCallStore.consumePendingMissedAction(reactApplicationContext))
  }

  /** Android 14+ full-screen-intent special access: whether we may show a full-screen call. */
  @ReactMethod
  fun canUseFullScreenIntent(promise: Promise) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      val nm =
        reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      promise.resolve(nm.canUseFullScreenIntent())
    } else {
      promise.resolve(true)
    }
  }

  /** Opens the per-app "Manage full screen intents" settings page (Android 14+). */
  @ReactMethod
  fun openFullScreenIntentSettings() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return
    val intent =
      Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
        data = Uri.parse("package:" + reactApplicationContext.packageName)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
    try {
      reactApplicationContext.startActivity(intent)
    } catch (_: Exception) {
    }
  }
}
