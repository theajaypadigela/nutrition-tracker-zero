package com.nutritiontrackerzero

import android.content.Intent
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.nutritiontrackerzero.incomingcall.CallConstants
import com.nutritiontrackerzero.incomingcall.IncomingCallController
import com.nutritiontrackerzero.incomingcall.IncomingCallStore

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "NutritionZero"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    handleAnsweredCall(intent)
    handleMissedAction(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleAnsweredCall(intent)
    handleMissedAction(intent)
  }

  /**
   * When the user accepts an incoming call (from the native call screen or the notification's
   * Answer action), the call payload arrives as an intent extra. Persist it for the JS layer to
   * consume on resume (IncomingCallModule.consumePendingAnswer → navigate to the voice session)
   * and tear down the ringing call. The extra is removed so it is processed exactly once.
   */
  private fun handleAnsweredCall(intent: Intent?) {
    val json = intent?.getStringExtra(CallConstants.EXTRA_ANSWERED_CALL) ?: return
    IncomingCallController.handleAnswer(applicationContext, json)
    intent.removeExtra(CallConstants.EXTRA_ANSWERED_CALL)
  }

  /**
   * "Log now" (or tapping) a missed-call follow-up opens the app with the missed payload. Persist
   * it for JS to consume on resume (IncomingCallModule.consumePendingMissedAction → navigate into
   * the voice log for that occurrence). The extra is removed so it is processed exactly once.
   */
  private fun handleMissedAction(intent: Intent?) {
    val json = intent?.getStringExtra(CallConstants.EXTRA_MISSED_ACTION) ?: return
    IncomingCallStore.setPendingMissedAction(applicationContext, json)
    intent.removeExtra(CallConstants.EXTRA_MISSED_ACTION)
  }
}
