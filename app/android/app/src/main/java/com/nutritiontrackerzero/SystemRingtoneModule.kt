package com.nutritiontrackerzero

import android.content.Context
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SystemRingtoneModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  private var ringtone: Ringtone? = null

  override fun getName(): String = "SystemRingtone"

  @ReactMethod
  fun startRingtone() {
    if (ringtone?.isPlaying == true) {
      return
    }

    val nextRingtone =
      RingtoneManager.getRingtone(reactApplicationContext, resolveRingtoneUri(reactApplicationContext))
        ?: return

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      nextRingtone.isLooping = true
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      nextRingtone.audioAttributes =
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
    }

    ringtone = nextRingtone
    nextRingtone.play()
  }

  @ReactMethod
  fun stopRingtone() {
    ringtone?.stop()
    ringtone = null
  }

  override fun invalidate() {
    stopRingtone()
    super.invalidate()
  }

  private fun resolveRingtoneUri(context: Context): Uri {
    return (
      RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_RINGTONE)
        ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        ?: Settings.System.DEFAULT_RINGTONE_URI
      )
  }
}