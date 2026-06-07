package com.anonymous.weatherapp.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.SystemClock

private const val WIDGET_REFRESH_INTERVAL_MS = 15L * 60L * 1000L

// Lightweight periodic refresh for widgets. Inexact repeating is deliberate:
// Android can batch it with other work, which is friendlier to battery than an
// exact alarm for glanceable weather cards.
object OmniwxWidgetScheduler {
  fun schedule(context: Context) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
    val pendingIntent = refreshPendingIntent(context)
    alarmManager.setInexactRepeating(
      AlarmManager.ELAPSED_REALTIME,
      SystemClock.elapsedRealtime() + WIDGET_REFRESH_INTERVAL_MS,
      WIDGET_REFRESH_INTERVAL_MS,
      pendingIntent
    )
  }

  fun cancel(context: Context) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
    alarmManager.cancel(refreshPendingIntent(context))
  }

  private fun refreshPendingIntent(context: Context): PendingIntent {
    val intent = Intent(context, OmniwxWidgetRefreshReceiver::class.java).apply {
      action = OmniwxWidgetData.ACTION_REFRESH_WIDGETS
      setPackage(context.packageName)
    }
    return PendingIntent.getBroadcast(
      context,
      OmniwxWidgetData.ACTION_REFRESH_WIDGETS.hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }
}
