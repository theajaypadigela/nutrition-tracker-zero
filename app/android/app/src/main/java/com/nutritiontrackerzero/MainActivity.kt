package com.nutritiontrackerzero

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.nutritiontrackerzero.incomingcall.CallConstants
import com.nutritiontrackerzero.incomingcall.IncomingCallController
import com.nutritiontrackerzero.incomingcall.IncomingCallStore

class MainActivity : ReactActivity() {

  /** Whether this activity may currently show over the lock screen: only while the call screen is open. */
  private var overLockScreen = false

  /** Hides whatever page was open while an answered call waits for the call screen over the lock screen. */
  private var lockCover: View? = null
  private val handler = Handler(Looper.getMainLooper())

  // The call screen never came up (signed out, or the JS failed): give up the lock screen rather than show the app.
  private val coverTimeout = Runnable {
    removeLockCover()
    if (isKeyguardLocked()) showOverLockScreen(false)
  }

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
    // react-native-screens cannot restore its fragments from saved state; Android would try to
    // after process death, a font-size or display-size change, or a fold. Passing null starts
    // clean instead of crashing with "Screen fragments should never be restored".
    super.onCreate(null)
    handleAnsweredCall(intent)
    handleMissedAction(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleAnsweredCall(intent)
    handleMissedAction(intent)
  }

  override fun onDestroy() {
    handler.removeCallbacks(coverTimeout)
    super.onDestroy()
  }

  /**
   * When the user accepts an incoming call (from the native call screen or the notification's
   * Answer action), the call payload arrives as an intent extra. Persist it for the JS layer to
   * consume on resume (IncomingCallModule.consumePendingAnswer → navigate to the voice session)
   * and tear down the ringing call. The extra is removed so it is processed exactly once.
   *
   * The answered call may open over the lock screen, and nothing else may: until the JS call
   * screen is up, a plain cover hides whatever page the app was on.
   */
  private fun handleAnsweredCall(intent: Intent?) {
    val json = intent?.getStringExtra(CallConstants.EXTRA_ANSWERED_CALL) ?: return
    IncomingCallController.handleAnswer(applicationContext, json)
    intent.removeExtra(CallConstants.EXTRA_ANSWERED_CALL)
    showOverLockScreen(true, wakeScreen = true)
    if (isKeyguardLocked()) coverUntilCallScreen()
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

  /** The JS call screen is open: it may show over the lock screen (IncomingCallModule.setCallScreenShown). */
  fun onCallScreenShown() {
    showOverLockScreen(true)
    // A moment for the call screen to draw before the cover comes off.
    handler.removeCallbacks(coverTimeout)
    handler.postDelayed({ removeLockCover() }, COVER_FADE_DELAY_MS)
  }

  /**
   * The call screen closed: every other page needs the phone unlocked, so the app goes back behind
   * the lock screen, and the person is asked to unlock to carry on.
   */
  fun onCallScreenLeft() {
    handler.removeCallbacks(coverTimeout)
    removeLockCover()
    if (!overLockScreen) return
    showOverLockScreen(false)
    if (isKeyguardLocked() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      (getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager)?.requestDismissKeyguard(this, null)
    }
  }

  @Suppress("DEPRECATION") // the window flags, for Android 7 and 8.0
  private fun showOverLockScreen(show: Boolean, wakeScreen: Boolean = false) {
    overLockScreen = show
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(show)
      setTurnScreenOn(show && wakeScreen)
    } else {
      val showWhenLocked = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
      val turnScreenOn = WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      if (show) window.addFlags(if (wakeScreen) showWhenLocked or turnScreenOn else showWhenLocked)
      else window.clearFlags(showWhenLocked or turnScreenOn)
    }
  }

  private fun isKeyguardLocked(): Boolean =
    (getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager)?.isKeyguardLocked == true

  private fun coverUntilCallScreen() {
    if (lockCover == null) {
      val cover =
        View(this).apply {
          setBackgroundColor(getColor(R.color.app_background))
          // Swallows touches, so nothing under it can be used either.
          isClickable = true
        }
      (window.decorView as ViewGroup).addView(
        cover,
        ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
      )
      lockCover = cover
    }
    handler.removeCallbacks(coverTimeout)
    handler.postDelayed(coverTimeout, COVER_TIMEOUT_MS)
  }

  private fun removeLockCover() {
    val cover = lockCover ?: return
    lockCover = null
    (cover.parent as? ViewGroup)?.removeView(cover)
  }

  private companion object {
    const val COVER_FADE_DELAY_MS = 300L
    const val COVER_TIMEOUT_MS = 20_000L
  }
}
