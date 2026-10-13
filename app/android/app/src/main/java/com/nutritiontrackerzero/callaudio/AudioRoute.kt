package com.nutritiontrackerzero.callaudio

import android.media.AudioDeviceInfo

/**
 * Where the call's voice plays. The ids are what JS sees (src/services/calls/audioRoute.ts).
 *
 * The phone's earpiece and wired headphones are never offered together: with headphones plugged in, Android plays a call
 * through them and the earpiece cannot be chosen (the phone's own call screen shows "Wired headset" in place of "Phone").
 */
internal enum class AudioRoute(val id: String) {
  EARPIECE("earpiece"),
  SPEAKER("speaker"),
  WIRED("wired"),
  BLUETOOTH("bluetooth");

  val isHeadset: Boolean get() = this == WIRED || this == BLUETOOTH

  companion object {
    fun fromId(id: String?): AudioRoute? = entries.firstOrNull { it.id == id }

    /** The route an output device belongs to, or null for one a call cannot use (A2DP-only music, HDMI, ...). */
    fun of(type: Int): AudioRoute? =
      when (type) {
        AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> EARPIECE
        AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> SPEAKER
        AudioDeviceInfo.TYPE_WIRED_HEADSET,
        AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
        AudioDeviceInfo.TYPE_USB_HEADSET -> WIRED
        AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
        AudioDeviceInfo.TYPE_BLE_HEADSET,
        AudioDeviceInfo.TYPE_HEARING_AID -> BLUETOOTH
        else -> null
      }

    /** The routes on offer, from the device types the phone reports, in a fixed order. */
    fun available(types: Iterable<Int>): List<AudioRoute> {
      val found = types.mapNotNull { of(it) }.toSet()
      return entries.filter { it in found && !(it == EARPIECE && WIRED in found) }
    }

    /** A private route, as a phone call starts: a headset when one is connected, else the earpiece. */
    fun private(available: List<AudioRoute>): AudioRoute? =
      listOf(BLUETOOTH, WIRED, EARPIECE).firstOrNull { it in available } ?: available.firstOrNull()
  }
}
