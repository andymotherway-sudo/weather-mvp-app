package com.anonymous.weatherapp.video

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.content.pm.ServiceInfo
import com.anonymous.weatherapp.R

/**
 * Keeps a user-started MP4 export alive after OMNIwx leaves the foreground.
 * The encoder still lives in the native export module; this service provides
 * Android's required foreground-work contract and native completion notice.
 */
class OmniwxVideoExportForegroundService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    ensureChannel(this)
    startForegroundCompat(buildProgressNotification(this, "Preparing weather animation", 0, 0))
    // Keep CPU/network work alive when the display sleeps without keeping the
    // display awake. The timeout is a final safety net; finish() releases it
    // immediately after a successful or failed job.
    val power = getSystemService(Context.POWER_SERVICE) as PowerManager
    if (wakeLock?.isHeld != true) {
      wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "OMNIwx:VideoExport").also {
        it.setReferenceCounted(false)
        it.acquire(MAX_WAKE_LOCK_MS)
      }
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    wakeLock?.let { lock -> if (lock.isHeld) lock.release() }
    wakeLock = null
    super.onDestroy()
  }

  private fun startForegroundCompat(notification: Notification) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      // Video encoding is user-initiated media processing, not generic data
      // synchronization. This service is what keeps the native worker eligible
      // to continue after the activity is backgrounded or the display sleeps.
      startForeground(ONGOING_NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROCESSING)
    } else {
      startForeground(ONGOING_NOTIFICATION_ID, notification)
    }
  }

  companion object {
    private const val CHANNEL_ID = "omniwx-video-exports"
    private const val ONGOING_NOTIFICATION_ID = 4401
    private const val RESULT_NOTIFICATION_ID = 4402
    private const val MAX_WAKE_LOCK_MS = 45 * 60 * 1_000L
    private const val MAX_DIAGNOSTIC_CHARS = 12_000

    fun start(context: Context, jobId: String) {
      state(context).edit()
        .putString("jobId", jobId)
        .putString("stage", "preparing")
        .putString("message", "Preparing source frames")
        .putString("diagnostics", "")
        .putLong("updatedAt", System.currentTimeMillis())
        .apply()
      val intent = Intent(context, OmniwxVideoExportForegroundService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
    }

    fun update(context: Context, jobId: String, stage: String, completed: Int, total: Int, message: String) {
      val preferences = state(context)
      val diagnostics = if (stage == "preparing" && message.startsWith("Frame ")) {
        (preferences.getString("diagnostics", "").orEmpty() + message + "\n").takeLast(MAX_DIAGNOSTIC_CHARS)
      } else {
        preferences.getString("diagnostics", "").orEmpty()
      }
      preferences.edit()
        .putString("jobId", jobId)
        .putString("stage", stage)
        .putInt("completed", completed)
        .putInt("total", total)
        .putString("message", message)
        .putString("diagnostics", diagnostics)
        .putLong("updatedAt", System.currentTimeMillis())
        .apply()
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      ensureChannel(context)
      manager.notify(ONGOING_NOTIFICATION_ID, buildProgressNotification(context, message, completed, total))
    }

    fun finish(context: Context, succeeded: Boolean, message: String) {
      state(context).edit()
        .putString("stage", if (succeeded) "complete" else "failed")
        .putString("message", message)
        .putLong("updatedAt", System.currentTimeMillis())
        .apply()
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

    private fun state(context: Context) =
      context.getSharedPreferences("omniwx_video_export", Context.MODE_PRIVATE)

    private fun builder(context: Context) =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(context, CHANNEL_ID) else Notification.Builder(context)

    private fun buildProgressNotification(context: Context, message: String, completed: Int, total: Int): Notification =
      builder(context)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle("Creating OMNIwx video")
        .setContentText(message)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setProgress(total.coerceAtLeast(0), completed.coerceAtLeast(0), total <= 0)
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
