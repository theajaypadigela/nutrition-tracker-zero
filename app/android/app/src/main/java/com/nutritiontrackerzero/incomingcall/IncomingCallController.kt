package com.nutritiontrackerzero.incomingcall

import android.content.Context
import android.content.Intent

/**
 * Single place the call's terminal transitions are handled, so the Activity buttons, the
 * notification actions, MainActivity (answer), and the JS bridge all behave identically.
 */
object IncomingCallController {

  /**
   * The user accepted. Persist the payload for JS to consume on resume, then tear the call down.
   * Bringing MainActivity (React Native) to the front is the caller's job — for the notification
   * "Answer" action that is the PendingIntent target; for the Activity button it startActivity()s.
   */
  fun handleAnswer(context: Context, payloadJson: String) {
    IncomingCallStore.setPendingAnswer(context, payloadJson)
    endCall(context)
  }

  /** The user declined (or rejected from the notification). Record it and tear the call down. */
  fun handleDecline(context: Context, payloadJson: String) {
    IncomingCallStore.addMarker(context, payloadJson, CallConstants.RESULT_DECLINED)
    endCall(context)
  }

  /** Stop ringing, remove the call notification, and dismiss the full-screen UI if shown. */
  fun endCall(context: Context) {
    // Stopping the service tears down the ringer + the foreground call notification. The extra
    // Ringer.stop()/cancel() are harmless belt-and-suspenders for the rare notification-only
    // fallback path where the service never started.
    IncomingCallService.stop(context)
    Ringer.stop()
    CallNotificationBuilder.cancel(context)
    context.sendBroadcast(
      Intent(CallConstants.ACTION_DISMISS_UI).setPackage(context.packageName),
    )
  }
}
