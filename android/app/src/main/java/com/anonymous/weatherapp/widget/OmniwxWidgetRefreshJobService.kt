package com.anonymous.weatherapp.widget

import android.app.job.JobParameters
import android.app.job.JobService

class OmniwxWidgetRefreshJobService : JobService() {
  override fun onStartJob(params: JobParameters): Boolean {
    val hasWidgets = OmniwxWidgetRefreshReceiver.refreshAll(applicationContext)
    if (hasWidgets) {
      OmniwxWidgetScheduler.schedule(applicationContext)
    }
    jobFinished(params, false)
    return false
  }

  override fun onStopJob(params: JobParameters): Boolean = true
}
