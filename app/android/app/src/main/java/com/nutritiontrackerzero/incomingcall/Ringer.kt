package com.nutritiontrackerzero.incomingcall

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings

/**
 * Plays the device's default ringtone (looping) + a call vibration pattern while an incoming call
 * is active, behaving like a real phone / WhatsApp / Slack call:
 *  - resolves the system DEFAULT ringtone (TYPE_RINGTONE), not a bundled or notification sound;
 *  - requests transient-exclusive audio focus so it rings over / ducks other audio and owns the
 *    audio stream until the call ends;
 *  - loops continuously on every supported Android version (Ringtone.isLooping on API 28+, a
 *    looping MediaPlayer fallback below that, where Ringtone looping is unavailable);
 *  - respects the device ringer mode: audio+vibrate in NORMAL, vibrate-only in VIBRATE, and silent
 *    in SILENT — exactly as the platform dialer does.
 *
 * Singleton + idempotent so start/stop can be called from the foreground service, the Activity, or
 * the JS bridge without double-playing. Owned by IncomingCallService (kept alive for the whole
 * ring), so it no longer depends on the full-screen Activity having launched.
 */
object Ringer {
  private var ringtone: Ringtone? = null
  private var mediaPlayer: MediaPlayer? = null
  private var vibrator: Vibrator? = null
  private var audioManager: AudioManager? = null
  private var focusRequest: AudioFocusRequest? = null
  private var hasLegacyFocus = false

  private val VIBRATION_PATTERN = longArrayOf(0, 1000, 500, 1000, 500, 1000, 2000)

  @Synchronized
  fun start(context: Context) {
    val am = context.applicationContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    audioManager = am
    val mode = am?.ringerMode ?: AudioManager.RINGER_MODE_NORMAL

    // Vibrate in NORMAL and VIBRATE modes (a real call vibrates alongside the ring); never in SILENT.
    if (mode != AudioManager.RINGER_MODE_SILENT) {
      startVibration(context)
    }
    // Only make sound in NORMAL mode; VIBRATE/SILENT suppress the ringtone like the dialer.
    if (mode == AudioManager.RINGER_MODE_NORMAL) {
      requestAudioFocus(am)
      startRingtone(context)
    }
  }

  @Synchronized
  fun stop() {
    try {
      ringtone?.stop()
    } catch (_: Exception) {
    }
    ringtone = null
    try {
      mediaPlayer?.stop()
      mediaPlayer?.release()
    } catch (_: Exception) {
    }
    mediaPlayer = null
    try {
      vibrator?.cancel()
    } catch (_: Exception) {
    }
    vibrator = null
    abandonAudioFocus()
  }

  private val audioAttributes: AudioAttributes =
    AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()

  private fun requestAudioFocus(am: AudioManager?) {
    am ?: return
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val req =
          AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
            .setAudioAttributes(audioAttributes)
            .build()
        focusRequest = req
        am.requestAudioFocus(req)
      } else {
        @Suppress("DEPRECATION")
        am.requestAudioFocus(
          null,
          AudioManager.STREAM_RING,
          AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE,
        )
        hasLegacyFocus = true
      }
    } catch (_: Exception) {
    }
  }

  private fun abandonAudioFocus() {
    val am = audioManager ?: return
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        focusRequest?.let { am.abandonAudioFocusRequest(it) }
      } else if (hasLegacyFocus) {
        @Suppress("DEPRECATION")
        am.abandonAudioFocus(null)
      }
    } catch (_: Exception) {
    }
    focusRequest = null
    hasLegacyFocus = false
    audioManager = null
  }

  private fun startRingtone(context: Context) {
    val uri = resolveUri(context)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      // API 28+: Ringtone supports native looping — preferred (system-managed, low overhead).
      if (ringtone?.isPlaying == true) return
      val rt = RingtoneManager.getRingtone(context.applicationContext, uri) ?: return
      rt.isLooping = true
      rt.audioAttributes = audioAttributes
      ringtone = rt
      rt.play()
    } else {
      // API 24-27: Ringtone has no looping flag, so a MediaPlayer keeps the ring continuous
      // (a non-looping Ringtone would play once and fall silent — not call-like).
      if (mediaPlayer?.isPlaying == true) return
      try {
        val mp = MediaPlayer()
        mp.setAudioAttributes(audioAttributes)
        mp.setDataSource(context.applicationContext, uri)
        mp.isLooping = true
        mp.prepare()
        mp.start()
        mediaPlayer = mp
      } catch (_: Exception) {
        // Fall back to a one-shot Ringtone rather than silence if MediaPlayer can't open the uri.
        val rt = RingtoneManager.getRingtone(context.applicationContext, uri) ?: return
        rt.audioAttributes = audioAttributes
        ringtone = rt
        rt.play()
      }
    }
  }

  private fun startVibration(context: Context) {
    val vib = resolveVibrator(context) ?: return
    vibrator = vib
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      vib.vibrate(VibrationEffect.createWaveform(VIBRATION_PATTERN, 0))
    } else {
      @Suppress("DEPRECATION")
      vib.vibrate(VIBRATION_PATTERN, 0)
    }
  }

  private fun resolveVibrator(context: Context): Vibrator? {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
      vm?.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }
  }

  private fun resolveUri(context: Context): Uri {
    return RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_RINGTONE)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
      ?: Settings.System.DEFAULT_RINGTONE_URI
  }
}
