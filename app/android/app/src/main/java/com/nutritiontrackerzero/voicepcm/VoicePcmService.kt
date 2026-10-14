package com.nutritiontrackerzero.voicepcm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import com.nutritiontrackerzero.R

/** Keeps duplex microphone audio available while the screen is locked or the app is backgrounded. */
class VoicePcmService : Service() {
  override fun onCreate() {
    super.onCreate()
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(NotificationChannel(CHANNEL, "Voice check-in", NotificationManager.IMPORTANCE_LOW))
    }
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL) else Notification.Builder(this)
    builder.setSmallIcon(R.drawable.ic_call_small).setContentTitle("Food check-in in progress")
      .setContentText("Tap to return to your voice check-in").setOngoing(true).setCategory(Notification.CATEGORY_CALL)
    packageManager.getLaunchIntentForPackage(packageName)?.let {
      builder.setContentIntent(PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(ID, builder.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
    else startForeground(ID, builder.build())
  }
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int) = START_NOT_STICKY
  override fun onBind(intent: Intent?): IBinder? = null
  companion object { private const val CHANNEL = "voice-pcm"; private const val ID = 8803 }
}
