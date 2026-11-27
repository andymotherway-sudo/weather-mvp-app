package com.anonymous.weatherapp.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import com.anonymous.weatherapp.R

/** Supplemental NOAA SWPC summary; values are never synthesized when the feed is unavailable. */
class OmniwxSpaceWeatherWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    OmniwxWidgetScheduler.schedule(context)
    OmniwxWidgetExecutor.execute {
      val summary = OmniwxWidgetData.fetchSpaceWeather()
      ids.forEach { id -> manager.updateAppWidget(id, views(context, summary)) }
    }
  }

  private fun views(context: Context, summary: WidgetSpaceWeather?): RemoteViews =
    RemoteViews(context.packageName, R.layout.omniwx_widget_space_weather).apply {
      setOnClickPendingIntent(R.id.widget_root, OmniwxWidgetData.openIntent(context, "/space"))
      setOnClickPendingIntent(R.id.widget_refresh, OmniwxWidgetData.refreshIntent(context))
      if (summary == null) {
        setTextViewText(R.id.widget_kp, "--")
        setTextViewText(R.id.widget_status, "Space weather unavailable")
        setTextViewText(R.id.widget_details, "Open OMNIwx or refresh to retry")
        setTextViewText(R.id.widget_updated, "No current observation")
      } else {
        val kp = summary.kp?.let { "Kp ${"%.1f".format(java.util.Locale.US, it)}" } ?: "Kp --"
        val status = when {
          (summary.kp ?: 0.0) >= 5.0 -> "Geomagnetic storm conditions"
          (summary.kp ?: 0.0) >= 4.0 -> "Active geomagnetic conditions"
          else -> "Quiet to unsettled conditions"
        }
        setTextViewText(R.id.widget_kp, kp)
        setTextViewText(R.id.widget_status, status)
        setTextViewText(R.id.widget_details, "Solar wind ${summary.solarWindSpeed?.let { "${it.toInt()} km/s" } ?: "--"}  |  Bz ${summary.bzNt?.let { "${"%.1f".format(java.util.Locale.US, it)} nT" } ?: "--"}  |  X-ray ${summary.xrayClass ?: "--"}")
        setTextViewText(R.id.widget_updated, "Observed ${summary.updatedLabel}")
      }
    }
}
