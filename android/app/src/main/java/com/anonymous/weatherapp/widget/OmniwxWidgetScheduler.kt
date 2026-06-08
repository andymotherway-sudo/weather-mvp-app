package com.anonymous.weatherapp.widget

import android.app.AlarmManager
import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock

private const val WIDGET_REFRESH_INTERVAL_MS = 15L * 60L * 1000L
private const val WIDGET_REFRESH_JOB_ID = 0x0A17

// Lightweight periodic refresh for widgets. Android launchers and OEM battery
// policies can throttle AppWidgetProvider updatePeriodMillis, so OMNIwx keeps a
// wakeup alarm and a persisted JobScheduler job as independent refresh paths.
object OmniwxWidgetScheduler {
  fun schedule(context: Context) {
    scheduleAlarm(context)
    scheduleJob(context)
  }

  fun cancel(context: Context) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
    alarmManager.cancel(refreshPendingIntent(context))
    (context.getSystemService(Context.JOB_SCHEDULER_SERVICE) as? JobScheduler)?.cancel(WIDGET_REFRESH_JOB_ID)
  }

  private fun scheduleAlarm(context: Context) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
    val triggerAt = SystemClock.elapsedRealtime() + WIDGET_REFRESH_INTERVAL_MS
    val pendingIntent = refreshPendingIntent(context)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      alarmManager.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingIntent)
    } else {
      alarmManager.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingIntent)
    }
  }

  private fun scheduleJob(context: Context) {
    val scheduler = context.getSystemService(Context.JOB_SCHEDULER_SERVICE) as? JobScheduler ?: return
    val component = ComponentName(context, OmniwxWidgetRefreshJobService::class.java)
    val job = JobInfo.Builder(WIDGET_REFRESH_JOB_ID, component)
      .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
      .setPersisted(true)
      .setPeriodic(WIDGET_REFRESH_INTERVAL_MS)
      .build()
    scheduler.schedule(job)
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
