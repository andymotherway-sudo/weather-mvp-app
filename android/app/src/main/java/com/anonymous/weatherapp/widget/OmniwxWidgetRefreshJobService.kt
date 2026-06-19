package com.anonymous.weatherapp.widget

import android.app.job.JobParameters
import android.app.job.JobService

class OmniwxWidgetRefreshJobService : JobService() {
  override fun onStartJob(params: JobParameters): Boolean {
    if (OmniwxWidgetRuntime.isAppVisible(applicationContext)) {
      OmniwxWidgetScheduler.schedule(applicationContext)
      jobFinished(params, false)
      return false
    }

    OmniwxWidgetExecutor.execute(
      task = {
        val hasWidgets = OmniwxWidgetRefreshReceiver.refreshAll(applicationContext)
        if (hasWidgets) {
          OmniwxWidgetScheduler.schedule(applicationContext)
        }
      },
      done = {
        jobFinished(params, false)
      }
    )
    return true
  }

  override fun onStopJob(params: JobParameters): Boolean = true
}
