package com.anonymous.weatherapp.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import com.anonymous.weatherapp.R
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.concurrent.thread
import kotlin.math.roundToInt

class OmniwxClimatologyWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    appWidgetIds.forEach { id ->
      val loading = RemoteViews(context.packageName, R.layout.omniwx_widget_climatology).apply {
        setOnClickPendingIntent(R.id.widget_root, OmniwxWidgetData.openIntent(context, "/almanac"))
        setTextViewText(R.id.widget_title, "Climatology")
        setTextViewText(R.id.widget_month, monthLabel())
        setTextViewText(R.id.widget_high, "--")
        setTextViewText(R.id.widget_low, "--")
        setTextViewText(R.id.widget_precip, "Updating")
        setTextViewText(R.id.widget_footer, "Loading climate normals")
      }
      appWidgetManager.updateAppWidget(id, loading)
    }

    thread(name = "omniwx-climatology-widget") {
      val climo = runCatching { OmniwxWidgetData.fetchClimatology(context) }.getOrNull()
      appWidgetIds.forEach { id ->
        appWidgetManager.updateAppWidget(id, buildViews(context, climo))
      }
    }
  }

  private fun buildViews(context: Context, climo: WidgetClimatology?): RemoteViews {
    return RemoteViews(context.packageName, R.layout.omniwx_widget_climatology).apply {
      setOnClickPendingIntent(R.id.widget_root, OmniwxWidgetData.openIntent(context, "/almanac"))
      setTextViewText(R.id.widget_month, monthLabel())
      if (climo == null) {
        setTextViewText(R.id.widget_title, "Climatology")
        setTextViewText(R.id.widget_high, "--")
        setTextViewText(R.id.widget_low, "--")
        setTextViewText(R.id.widget_precip, "Open Almanac")
        setTextViewText(R.id.widget_footer, "Open OMNIwx to refresh climate normals.")
      } else {
        setTextViewText(R.id.widget_title, climo.place.name)
        setTextViewText(R.id.widget_high, tempLabel(climo.normalHighF))
        setTextViewText(R.id.widget_low, tempLabel(climo.normalLowF))
        setTextViewText(R.id.widget_precip, precipLabel(climo.normalPrecipIn, climo.annualPrecipIn))
        setTextViewText(R.id.widget_footer, "${climo.stationName}. Updated ${climo.updatedLabel}")
      }
    }
  }

  private fun tempLabel(value: Double?): String {
    return value?.takeIf { it.isFinite() }?.let { "${it.roundToInt()}°" } ?: "--"
  }

  private fun precipLabel(month: Double?, annual: Double?): String {
    val monthly = month?.takeIf { it.isFinite() }?.let { String.format(Locale.US, "%.1f in", it) } ?: "--"
    val yearly = annual?.takeIf { it.isFinite() }?.let { String.format(Locale.US, "%.1f in yr", it) }
    return listOfNotNull(monthly, yearly).joinToString("\n")
  }

  private fun monthLabel(): String {
    return SimpleDateFormat("MMM", Locale.US).format(Date()).uppercase(Locale.US)
  }
}
