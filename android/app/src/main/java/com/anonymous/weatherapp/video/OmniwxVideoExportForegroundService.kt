package com.anonymous.weatherapp.video

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import com.anonymous.weatherapp.R

/**
 * Keeps a user-started MP4 export alive after OMNIwx leaves the foreground.
 * The encoder still lives in the native export module; this service provides
 * Android's required foreground-work contract and native completion notice.
 */
class OmniwxVideoExportForegroundService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    ensureChannel(this)
    startForegroundCompat(buildProgressNotification(this, "Preparing weather animation"))
    return START_NOT_STICKY
  }

  private fun startForegroundCompat(notification: Notification) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(ONGOING_NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      startForeground(ONGOING_NOTIFICATION_ID, notification)
    }
  }

  companion object {
    private const val CHANNEL_ID = "omniwx-video-exports"
    private const val ONGOING_NOTIFICATION_ID = 4401
    private const val RESULT_NOTIFICATION_ID = 4402

    fun start(context: Context) {
      val intent = Intent(context, OmniwxVideoExportForegroundService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
    }

    fun update(context: Context, message: String) {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      ensureChannel(context)
      manager.notify(ONGOING_NOTIFICATION_ID, buildProgressNotification(context, message))
    }

    fun finish(context: Context, succeeded: Boolean, message: String) {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      ensureChannel(context)
      manager.cancel(ONGOING_NOTIFICATION_ID)
      manager.notify(RESULT_NOTIFICATION_ID, buildResultNotification(context, succeeded, message))
      context.stopService(Intent(context, OmniwxVideoExportForegroundService::class.java))
    }

    private fun ensureChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "OMNIwx video exports", NotificationManager.IMPORTANCE_DEFAULT).apply {
          description = "Progress and completion for saved weather animation videos."
        },
      )
    }

    private fun builder(context: Context) =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(context, CHANNEL_ID) else Notification.Builder(context)

    private fun buildProgressNotification(context: Context, message: String): Notification =
      builder(context)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle("Creating OMNIwx video")
        .setContentText(message)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setProgress(0, 0, true)
        .build()

    private fun buildResultNotification(context: Context, succeeded: Boolean, message: String): Notification =
      builder(context)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle(if (succeeded) "OMNIwx video saved" else "OMNIwx video export failed")
        .setContentText(message)
        .setAutoCancel(true)
        .build()
  }
}
