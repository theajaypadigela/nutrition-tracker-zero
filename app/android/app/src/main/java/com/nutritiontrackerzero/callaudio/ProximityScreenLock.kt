package com.nutritiontrackerzero.callaudio

import android.app.Activity
import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.PowerManager
import android.view.WindowManager
import kotlin.math.min

/**
 * Turns the screen off while the phone is against the ear, as the phone's own call screen does.
 *
 * The screen itself is switched by Android: a PROXIMITY_SCREEN_OFF_WAKE_LOCK makes the system turn the display (and with it
 * the touchscreen) off when the proximity sensor reports something near, and back on when it moves away. This is what
 * dialers and calling apps use, and it is the only way an app can switch the screen off. The sensor is also read here, so
 * the call screen can ignore touches while something is near, and so a phone whose screen cannot be switched this way
 * (no wake-lock support, but a sensor) at least goes to its lowest brightness.
 *
 * All calls on [handler]'s thread.
 */
internal class ProximityScreenLock(
  context: Context,
  private val handler: Handler,
  private val currentActivity: () -> Activity?,
  private val onNearChanged: (Boolean) -> Unit,
) {
  private val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
  private val sensors = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
  private val sensor: Sensor? = sensors.getDefaultSensor(Sensor.TYPE_PROXIMITY)
  private val screenOffSupported = power.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)
  private var wakeLock: PowerManager.WakeLock? = null
  private var listening = false
  private var dimmed = false

  var near = false
    private set

  /** Whether this phone can react to being held to the ear at all. */
  val supported: Boolean get() = screenOffSupported || sensor != null

  val held: Boolean get() = wakeLock?.isHeld == true || listening

  private val listener =
    object : SensorEventListener {
      override fun onSensorChanged(event: SensorEvent) {
        val distance = event.values.firstOrNull() ?: return
        // Android's own rule: near is closer than the sensor's range, capped at 5 cm (some sensors only report 0 or their maximum).
        val threshold = min(event.sensor.maximumRange, NEAR_THRESHOLD_CM)
        setNear(distance >= 0f && distance < threshold)
      }

      override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) = Unit
    }

  fun hold() {
    if (screenOffSupported) {
      val lock =
        wakeLock
          ?: power.newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, WAKE_LOCK_TAG).apply { setReferenceCounted(false) }
      wakeLock = lock
      // Timed, so a call that never reports its end cannot keep the lock: longer than any call (Vapi stops one at 10 minutes).
      if (!lock.isHeld) lock.acquire(MAX_HOLD_MS)
    }
    val s = sensor
    if (s != null && !listening) {
      listening = sensors.registerListener(listener, s, SensorManager.SENSOR_DELAY_NORMAL, handler)
    }
  }

  /** Lets go. If the phone is still at the ear, Android keeps the screen off until it moves away, as after a phone call. */
  fun release() {
    wakeLock?.let { if (it.isHeld) it.release(PowerManager.RELEASE_FLAG_WAIT_FOR_NO_PROXIMITY) }
    if (listening) {
      sensors.unregisterListener(listener)
      listening = false
    }
    setNear(false)
  }

  private fun setNear(value: Boolean) {
    if (value == near) return
    near = value
    if (!screenOffSupported) dim(value)
    onNearChanged(value)
  }

  /** Lowest brightness while near, for a phone whose screen cannot be switched off by the system. */
  private fun dim(dark: Boolean) {
    if (dark == dimmed) return
    val activity = currentActivity() ?: return
    dimmed = dark
    activity.runOnUiThread {
      val attrs = activity.window.attributes
      attrs.screenBrightness =
        if (dark) WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_OFF else WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
      activity.window.attributes = attrs
    }
  }

  private companion object {
    const val WAKE_LOCK_TAG = "NutritionZero:call-proximity"
    const val NEAR_THRESHOLD_CM = 5f
    const val MAX_HOLD_MS = 30 * 60 * 1000L
  }
}
