package com.nutritiontrackerzero.callaudio

import android.content.Context
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.annotation.RequiresApi
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import java.util.concurrent.Executor

/**
 * The voice check-in's audio, handled like a phone call: it plays through the earpiece (or a connected headset), the
 * speaker on request, and the screen goes dark against the ear while the earpiece is in use (ProximityScreenLock).
 *
 * Daily, the WebRTC layer under Vapi, puts the phone in MODE_IN_COMMUNICATION when the call joins. JS opens the call in
 * Daily's "voice" mode (earpiece, not loudspeaker) and then picks a route through Daily once, which makes Daily stop routing
 * by itself (its USER_SPECIFIED_ROUTE mode). From then on this module routes: setCommunicationDevice on Android 12 and
 * later, where setSpeakerphoneOn is deprecated; the speakerphone and Bluetooth SCO switches before that.
 *
 * Phone behaviour kept on purpose: a headset that connects mid-call takes the call; when the device playing the call goes
 * away, the call moves to the private route (a remaining headset, else the earpiece).
 *
 * Every piece of state is touched on the main thread only.
 */
class CallAudioModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private val audio = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private val main = Handler(Looper.getMainLooper())
  private val proximity =
    ProximityScreenLock(reactContext, main, { reactApplicationContext.currentActivity }) { emit() }

  private var active = false

  /** The route asked for: by the person, or the private default at the start. */
  private var wanted: AudioRoute? = null

  /** A headset that just connected and should take the call once Android lists it for calls. */
  private var arriving: AudioRoute? = null
  private var arrivingTries = 0

  /** Output devices already present, so the callback's first report (everything connected) is not taken as new. */
  private val known = mutableSetOf<Int>()

  /** When the route was last put back after something else moved it, to give up rather than fight forever. */
  private val putBack = ArrayDeque<Long>()
  private var scoStarted = false

  /** This module switched the phone to MODE_IN_COMMUNICATION (Daily had not), so it switches it back. */
  private var setMode = false

  /**
   * Android 12+ applies a communication device a moment after it is asked for. Until it reports the change, the route
   * asked for is reported as the current one, so the call screen does not flick back to the old route.
   */
  private var settling: AudioRoute? = null
  private val settled = Runnable { settling = null }
  private val communicationWatcher: CommunicationWatcher? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) CommunicationWatcher() else null

  override fun getName(): String = NAME

  private val deviceCallback =
    object : AudioDeviceCallback() {
      override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) {
        if (!active) return
        val fresh = addedDevices.filter { it.isSink && known.add(it.id) }
        fresh.mapNotNull { AudioRoute.of(it.type) }.firstOrNull { it.isHeadset }?.let {
          arriving = it
          arrivingTries = 0
        }
        if (fresh.isNotEmpty()) recheckSoon()
      }

      override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) {
        if (!active) return
        removedDevices.forEach { known.remove(it.id) }
        recheckSoon()
      }
    }

  /** After a device came or went (they arrive in bursts, and Bluetooth is listed for calls a moment later). */
  private val recheck = Runnable { recheckNow() }

  private fun recheckNow() {
    if (!active) return
    val available = availableRoutes()
    val headset = arriving
    if (headset != null && headset !in available && ++arrivingTries < ARRIVAL_TRIES) {
      main.postDelayed(recheck, DEVICE_SETTLE_MS)
      return
    }
    arriving = null
    val keep = wanted?.takeIf { it in available }
    wanted = if (headset != null && headset in available) headset else keep ?: AudioRoute.private(available)
    applyWanted()
  }

  private fun recheckSoon() {
    main.removeCallbacks(recheck)
    main.postDelayed(recheck, DEVICE_SETTLE_MS)
  }

  private val putBackWanted = Runnable { if (active) applyWanted() }

  /** The current route, the routes on offer, and the proximity state. Works before a call too. */
  @ReactMethod
  fun getState(promise: Promise) {
    main.post { promise.resolve(stateMap()) }
  }

  /**
   * The call joined: take over its route. [route] is where to start (null for the private default); a route that is not
   * available falls back to the private one.
   */
  @ReactMethod
  fun start(
    route: String?,
    promise: Promise,
  ) {
    main.post {
      if (!active) {
        active = true
        known.clear()
        audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS).forEach { known.add(it.id) }
        audio.registerAudioDeviceCallback(deviceCallback, main)
        communicationWatcher?.register()
      }
      val available = availableRoutes()
      wanted = AudioRoute.fromId(route)?.takeIf { it in available } ?: AudioRoute.private(available)
      putBack.clear()
      applyWanted()
      promise.resolve(stateMap())
    }
  }

  /** The person chose a route. Ignored when no call is on, or the route is not available. */
  @ReactMethod
  fun setRoute(
    route: String,
    promise: Promise,
  ) {
    main.post {
      val next = AudioRoute.fromId(route)
      if (active && next != null && next in availableRoutes()) {
        wanted = next
        arriving = null
        putBack.clear()
        applyWanted()
      }
      promise.resolve(stateMap())
    }
  }

  /** The call ended: let go of the route and the proximity lock. */
  @ReactMethod
  fun stop() {
    main.post { stopNow() }
  }

  // NativeEventEmitter's bookkeeping; the events are sent whatever the listener count.
  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Double) = Unit

  override fun invalidate() {
    main.post { stopNow() }
    super.invalidate()
  }

  private fun stopNow() {
    if (!active) return
    active = false
    wanted = null
    arriving = null
    settling = null
    main.removeCallbacks(recheck)
    main.removeCallbacks(putBackWanted)
    main.removeCallbacks(settled)
    audio.unregisterAudioDeviceCallback(deviceCallback)
    communicationWatcher?.unregister()
    proximity.release()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      audio.clearCommunicationDevice()
    } else {
      @Suppress("DEPRECATION")
      audio.isSpeakerphoneOn = false
      stopSco()
    }
    if (setMode && audio.mode == AudioManager.MODE_IN_COMMUNICATION) audio.mode = AudioManager.MODE_NORMAL
    setMode = false
    emit()
  }

  private fun applyWanted() {
    val route = wanted ?: return
    // Daily sets this when the call joins; a call cannot be routed in MODE_NORMAL. A real phone call (MODE_IN_CALL) is left alone.
    if (audio.mode == AudioManager.MODE_NORMAL) {
      audio.mode = AudioManager.MODE_IN_COMMUNICATION
      setMode = true
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) routeModern(route) else routeLegacy(route)
    updateProximity()
    emit()
  }

  @RequiresApi(Build.VERSION_CODES.S)
  private fun routeModern(route: AudioRoute) {
    val device = audio.availableCommunicationDevices.firstOrNull { AudioRoute.of(it.type) == route } ?: return
    if (audio.communicationDevice?.id == device.id) return
    if (audio.setCommunicationDevice(device)) {
      settling = route
      main.removeCallbacks(settled)
      main.postDelayed(settled, SETTLE_REPORT_MS)
    }
  }

  @Suppress("DEPRECATION")
  private fun routeLegacy(route: AudioRoute) {
    when (route) {
      AudioRoute.SPEAKER -> {
        stopSco()
        audio.isSpeakerphoneOn = true
      }
      AudioRoute.EARPIECE, AudioRoute.WIRED -> {
        stopSco()
        audio.isSpeakerphoneOn = false
      }
      AudioRoute.BLUETOOTH -> {
        audio.isSpeakerphoneOn = false
        if (!scoStarted) {
          audio.startBluetoothSco()
          scoStarted = true
        }
        audio.isBluetoothScoOn = true
      }
    }
  }

  @Suppress("DEPRECATION")
  private fun stopSco() {
    if (!scoStarted && !audio.isBluetoothScoOn) return
    audio.isBluetoothScoOn = false
    audio.stopBluetoothSco()
    scoStarted = false
  }

  private fun availableRoutes(): List<AudioRoute> =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      AudioRoute.available(audio.availableCommunicationDevices.map { it.type })
    } else {
      AudioRoute.available(audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS).map { it.type })
    }

  /** Where the call plays now, as Android reports it. */
  private fun currentRoute(available: List<AudioRoute>): AudioRoute? {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      settling?.let { return it }
      audio.communicationDevice?.let { device -> AudioRoute.of(device.type)?.let { return it } }
    }
    @Suppress("DEPRECATION")
    return when {
      audio.isBluetoothScoOn -> AudioRoute.BLUETOOTH
      audio.isSpeakerphoneOn -> AudioRoute.SPEAKER
      AudioRoute.WIRED in available -> AudioRoute.WIRED
      AudioRoute.EARPIECE in available -> AudioRoute.EARPIECE
      else -> available.firstOrNull()
    }
  }

  /** The screen goes dark at the ear only while the call plays through the earpiece. */
  private fun updateProximity() {
    if (active && currentRoute(availableRoutes()) == AudioRoute.EARPIECE) proximity.hold() else proximity.release()
  }

  /** Something other than this module moved the call (Daily, another app): put the chosen route back, within reason. */
  private fun onCommunicationDeviceChanged() {
    if (!active) return
    settling = null
    main.removeCallbacks(settled)
    val want = wanted
    val available = availableRoutes()
    if (want != null && want in available && currentRoute(available) != want) {
      val now = SystemClock.elapsedRealtime()
      while (putBack.isNotEmpty() && now - putBack.first() > PUT_BACK_WINDOW_MS) putBack.removeFirst()
      if (putBack.size < MAX_PUT_BACKS) {
        putBack.addLast(now)
        main.removeCallbacks(putBackWanted)
        main.postDelayed(putBackWanted, PUT_BACK_DELAY_MS)
      }
    }
    updateProximity()
    emit()
  }

  private fun stateMap(): WritableMap {
    val available = availableRoutes()
    return Arguments.createMap().apply {
      putBoolean("active", active)
      putString("route", currentRoute(available)?.id)
      putArray("available", Arguments.createArray().apply { available.forEach { pushString(it.id) } })
      putBoolean("proximity", proximity.supported)
      putBoolean("near", proximity.near)
    }
  }

  private fun emit() {
    val context = reactApplicationContext
    if (!context.hasActiveReactInstance()) return
    context.emitDeviceEvent(EVENT, stateMap())
  }

  @RequiresApi(Build.VERSION_CODES.S)
  private inner class CommunicationWatcher {
    private val executor = Executor { main.post(it) }
    private val listener = AudioManager.OnCommunicationDeviceChangedListener { onCommunicationDeviceChanged() }
    private var registered = false

    fun register() {
      if (registered) return
      audio.addOnCommunicationDeviceChangedListener(executor, listener)
      registered = true
    }

    fun unregister() {
      if (!registered) return
      audio.removeOnCommunicationDeviceChangedListener(listener)
      registered = false
    }
  }

  companion object {
    const val NAME = "CallAudio"
    const val EVENT = "CallAudioChanged"
    private const val DEVICE_SETTLE_MS = 400L
    private const val SETTLE_REPORT_MS = 1_000L
    private const val ARRIVAL_TRIES = 5
    private const val PUT_BACK_DELAY_MS = 250L
    private const val PUT_BACK_WINDOW_MS = 5_000L
    private const val MAX_PUT_BACKS = 3
  }
}
