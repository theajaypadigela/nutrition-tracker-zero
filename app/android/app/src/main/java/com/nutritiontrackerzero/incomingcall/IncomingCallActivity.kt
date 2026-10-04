package com.nutritiontrackerzero.incomingcall

import android.app.Activity
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import com.nutritiontrackerzero.MainActivity
import com.nutritiontrackerzero.R

/**
 * The native full-screen incoming-call screen. Rendered entirely in Kotlin (no React bridge) so it
 * appears instantly over the lockscreen even from a killed process. It draws the branded UI and
 * keeps the screen on; the ringtone, vibration, and 60s ring timeout are owned by
 * IncomingCallService, so the call still rings even when this Activity can't launch. Accept
 * launches React Native (MainActivity) with the answer payload; Decline records a marker and ends
 * the call; the service handles timeout as "missed". This Activity finishes when the service
 * broadcasts ACTION_DISMISS_UI (call answered / declined / timed out / dismissed).
 */
class IncomingCallActivity : Activity() {

  private var ended = false

  // The service ended the call (answered, declined, timed out, or dismissed) — close the screen.
  private val dismissReceiver =
    object : BroadcastReceiver() {
      override fun onReceive(context: Context?, intent: Intent?) {
        if (!ended) {
          ended = true
          finish()
        }
      }
    }

  companion object {
    fun createIntent(context: Context, payloadJson: String): Intent {
      return Intent(context, IncomingCallActivity::class.java).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION)
        putExtra(CallConstants.EXTRA_PAYLOAD, payloadJson)
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    applyLockscreenFlags()
    setContentView(R.layout.activity_incoming_call)

    bindPayload(intent)

    findViewById<View>(R.id.accept_button).setOnClickListener { onAnswer() }
    findViewById<View>(R.id.decline_button).setOnClickListener { onDecline() }

    val filter = IntentFilter(CallConstants.ACTION_DISMISS_UI)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(dismissReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      registerReceiver(dismissReceiver, filter)
    }
    // Ring + timeout are owned by IncomingCallService (started alongside this Activity), so it
    // keeps ringing even if this screen is never shown.
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    bindPayload(intent)
  }

  private fun bindPayload(intent: Intent) {
    val payload = IncomingCallPayload.fromJson(intent.getStringExtra(CallConstants.EXTRA_PAYLOAD))
    if (payload == null) {
      // Nothing to show — end the whole call rather than ring on an empty screen.
      ended = true
      IncomingCallController.endCall(applicationContext)
      finish()
      return
    }
    findViewById<TextView>(R.id.agent_name).text = payload.assistantName
    findViewById<TextView>(R.id.subtitle).text = payload.subtitle
    findViewById<TextView>(R.id.verified_text).text = payload.verifiedLabel
  }

  private fun currentPayloadJson(): String =
    intent.getStringExtra(CallConstants.EXTRA_PAYLOAD) ?: "{}"

  private fun onAnswer() {
    if (ended) return
    ended = true
    // Bring React Native to the front with the answer payload; MainActivity persists it and ends
    // the call (stops the service / ring / notification) via IncomingCallController.
    val mainIntent =
      Intent(this, MainActivity::class.java).apply {
        addFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK or
            Intent.FLAG_ACTIVITY_SINGLE_TOP or
            Intent.FLAG_ACTIVITY_CLEAR_TOP,
        )
        putExtra(CallConstants.EXTRA_ANSWERED_CALL, currentPayloadJson())
      }
    startActivity(mainIntent)
    finish()
  }

  private fun onDecline() {
    if (ended) return
    ended = true
    // Records the declined marker and ends the call (stops the service / ring / notification).
    IncomingCallController.handleDecline(applicationContext, currentPayloadJson())
    finish()
  }

  private fun applyLockscreenFlags() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
      val km = getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
      km?.requestDismissKeyguard(this, null)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
          WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD,
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }

  @Deprecated("Back must not dismiss a ringing call", ReplaceWith(""))
  override fun onBackPressed() {
    // Intentionally ignored — a ringing call cannot be dismissed with Back, like a real call.
  }

  override fun onDestroy() {
    try {
      unregisterReceiver(dismissReceiver)
    } catch (_: Exception) {
    }
    super.onDestroy()
  }
}
