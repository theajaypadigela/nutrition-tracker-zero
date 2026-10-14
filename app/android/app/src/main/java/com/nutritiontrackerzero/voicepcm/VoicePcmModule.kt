package com.nutritiontrackerzero.voicepcm

import android.content.Context
import android.content.Intent
import android.os.Build
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor
import android.util.Base64
import com.facebook.react.bridge.*
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

/** Provider-independent mono PCM capture/playback. Audio routing is owned by the existing CallAudio module. */
class VoicePcmModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  @Volatile private var running = false
  @Volatile private var muted = false
  private var recorder: AudioRecord? = null
  private var player: AudioTrack? = null
  private var capture: Thread? = null
  private var echo: AcousticEchoCanceler? = null
  private var noise: NoiseSuppressor? = null
  private val output = Executors.newSingleThreadExecutor()
  private val generation = AtomicInteger(0)
  private val playbackGeneration = AtomicInteger(0)
  private var framesWritten = 0L
  private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private var audioFocus: AudioFocusRequest? = null
  private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
    if (change < 0 && running) emit("VoicePcmError", "Another audio session interrupted the voice call")
  }

  override fun getName() = "VoicePcm"
  private fun emit(event: String, value: Any) {
    if (reactApplicationContext.hasActiveReactInstance()) reactApplicationContext.emitDeviceEvent(event, value)
  }

  @ReactMethod
  @Synchronized
  fun start(inputRate: Int, outputRate: Int, promise: Promise) {
    try {
      stop()
      val size = maxOf(AudioRecord.getMinBufferSize(inputRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT), inputRate / 5)
      val service = Intent(reactApplicationContext, VoicePcmService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) reactApplicationContext.startForegroundService(service)
      else reactApplicationContext.startService(service)
      val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
      val focusResult = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(attributes)
          .setOnAudioFocusChangeListener(focusListener).setWillPauseWhenDucked(true).build()
        audioFocus = request
        audioManager.requestAudioFocus(request)
      } else {
        @Suppress("DEPRECATION")
        audioManager.requestAudioFocus(focusListener, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
      }
      check(focusResult == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) { "Call audio is in use by another app" }
      val input = AudioRecord(MediaRecorder.AudioSource.VOICE_COMMUNICATION, inputRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, size)
      recorder = input
      check(input.state == AudioRecord.STATE_INITIALIZED) { "Microphone could not be initialized" }
      val track = AudioTrack.Builder()
        .setAudioAttributes(attributes)
        .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(outputRate).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
        .setBufferSizeInBytes(maxOf(AudioTrack.getMinBufferSize(outputRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT), outputRate / 5))
        .setTransferMode(AudioTrack.MODE_STREAM).build()
      player = track
      check(track.state == AudioTrack.STATE_INITIALIZED) { "Speaker could not be initialized" }
      if (AcousticEchoCanceler.isAvailable()) echo = AcousticEchoCanceler.create(input.audioSessionId)?.apply { enabled = true }
      if (NoiseSuppressor.isAvailable()) noise = NoiseSuppressor.create(input.audioSessionId)?.apply { enabled = true }
      framesWritten = 0
      muted = false
      running = true
      val run = generation.get()
      input.startRecording()
      track.play()
      capture = Thread({
        android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_AUDIO)
        val buffer = ByteArray(inputRate / 25 * 2) // 40 ms, linear16 little endian.
        try {
          while (running && generation.get() == run) {
            val n = input.read(buffer, 0, buffer.size)
            if (n > 0 && running && !muted && generation.get() == run) emit("VoicePcmInput", Base64.encodeToString(buffer, 0, n, Base64.NO_WRAP))
            if (n < 0 && running) { emit("VoicePcmError", "The microphone stopped unexpectedly"); break }
          }
        } catch (_: Exception) { if (running && generation.get() == run) emit("VoicePcmError", "The microphone could not continue") }
      }, "VoicePcmCapture").apply { start() }
      promise.resolve(null)
    } catch (e: Exception) { stop(); promise.reject("voice_audio", e.message, e) }
  }

  @ReactMethod
  fun play(base64: String) {
    val run = generation.get()
    val track = player ?: return
    val playback = playbackGeneration.get()
    val bytes = try { Base64.decode(base64, Base64.DEFAULT) } catch (_: Exception) { return }
    output.execute {
      if (!running || generation.get() != run || playbackGeneration.get() != playback) return@execute
      try {
        var at = 0
        while (at < bytes.size && running && generation.get() == run && playbackGeneration.get() == playback) {
          val n = track.write(bytes, at, bytes.size - at, AudioTrack.WRITE_NON_BLOCKING)
          if (n == 0) { Thread.sleep(10); continue }
          if (n <= 0) { if (running) emit("VoicePcmError", "Voice playback stopped unexpectedly"); break }
          at += n
          framesWritten += n / 2
        }
      } catch (_: Exception) { if (running && generation.get() == run) emit("VoicePcmError", "Voice playback could not continue") }
    }
  }

  @ReactMethod
  fun clear() {
    // Invalidate queued playback without invalidating the microphone's session generation.
    val track = player ?: return
    playbackGeneration.incrementAndGet()
    track.pause()
    output.execute {
      if (running && player === track) { track.flush(); framesWritten = 0; track.play() }
    }
  }

  @ReactMethod
  fun drain(promise: Promise) {
    val run = generation.get()
    val playback = playbackGeneration.get()
    output.execute {
      val deadline = System.nanoTime() + 8_000_000_000L
      while (running && generation.get() == run && playbackGeneration.get() == playback && System.nanoTime() < deadline) {
        val played = (player?.playbackHeadPosition ?: 0).toLong() and 0xffffffffL
        if (played >= framesWritten) break
        Thread.sleep(20)
      }
      promise.resolve(null)
    }
  }

  @ReactMethod fun setMuted(value: Boolean) { muted = value }
  @ReactMethod fun addListener(eventName: String) = Unit
  @ReactMethod fun removeListeners(count: Double) = Unit

  @ReactMethod
  @Synchronized
  fun stop() {
    running = false
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) audioFocus?.let { audioManager.abandonAudioFocusRequest(it) }
    else { @Suppress("DEPRECATION") audioManager.abandonAudioFocus(focusListener) }
    audioFocus = null
    reactApplicationContext.stopService(Intent(reactApplicationContext, VoicePcmService::class.java))
    generation.incrementAndGet()
    playbackGeneration.incrementAndGet()
    try { recorder?.stop() } catch (_: Exception) { }
    capture?.join(500)
    capture = null
    recorder?.release(); recorder = null
    echo?.release(); echo = null
    noise?.release(); noise = null
    val track = player
    player = null
    try { track?.pause(); track?.flush(); track?.release() } catch (_: Exception) { }
  }

  override fun invalidate() { stop(); output.shutdownNow(); super.invalidate() }
}
