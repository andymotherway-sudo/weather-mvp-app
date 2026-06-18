package com.anonymous.weatherapp.widget

import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.content.Context
import android.os.Build

private const val WIDGET_REFRESH_INTERVAL_MS = 30L * 60L * 1000L
private const val WIDGET_REFRESH_JOB_ID = 0x0A17

// Lightweight periodic refresh for widgets. Keep one OS-managed background path
// so launcher widgets do not compete with the foreground React Native app.
object OmniwxWidgetScheduler {
  fun schedule(context: Context) {
    scheduleJob(context)
  }

  fun cancel(context: Context) {
    (context.getSystemService(Context.JOB_SCHEDULER_SERVICE) as? JobScheduler)?.cancel(WIDGET_REFRESH_JOB_ID)
  }

  private fun scheduleJob(context: Context) {
    val scheduler = context.getSystemService(Context.JOB_SCHEDULER_SERVICE) as? JobScheduler ?: return
    val component = ComponentName(context, OmniwxWidgetRefreshJobService::class.java)
    val job = JobInfo.Builder(WIDGET_REFRESH_JOB_ID, component)
      .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
      .setPersisted(true)
      .apply {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          setRequiresBatteryNotLow(true)
        }
      }
      .setPeriodic(WIDGET_REFRESH_INTERVAL_MS)
      .build()
    scheduler.schedule(job)
  }
}
