package com.anonymous.weatherapp.widget

import android.app.ActivityManager
import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.Process
import java.util.concurrent.Executors

private const val WIDGET_REFRESH_INTERVAL_MS = 30L * 60L * 1000L
private const val WIDGET_REFRESH_JOB_ID = 0x0A17

// Home-screen widget callbacks can arrive in bursts. Keep widget work serialized
// and background-priority so launcher refreshes do not compete with the app UI.
object OmniwxWidgetExecutor {
  private const val WORKER_THREAD_NAME = "omniwx-widget-worker"

  private val executor = Executors.newSingleThreadExecutor { task ->
    Thread(task, WORKER_THREAD_NAME).apply {
      isDaemon = true
      priority = Thread.MIN_PRIORITY
    }
  }

  fun execute(task: () -> Unit) {
    if (Thread.currentThread().name == WORKER_THREAD_NAME) {
      task()
      return
    }
    executor.execute {
      Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND)
      task()
    }
  }

  fun execute(task: () -> Unit, done: () -> Unit) {
    if (Thread.currentThread().name == WORKER_THREAD_NAME) {
      try {
        task()
      } finally {
        done()
      }
      return
    }
    executor.execute {
      Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND)
      try {
        task()
      } finally {
        done()
      }
    }
  }
}

object OmniwxWidgetRuntime {
  fun isAppVisible(context: Context): Boolean {
    val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager ?: return false
    return manager.runningAppProcesses
      ?.firstOrNull { it.processName == context.packageName }
      ?.let { it.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE }
      ?: false
  }
}

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
