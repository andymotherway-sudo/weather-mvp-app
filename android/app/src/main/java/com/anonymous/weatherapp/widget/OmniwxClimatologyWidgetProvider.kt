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

// Medium climatology widget. It summarizes today's normal/record context from
// the same cached Almanac data the app uses, then renders a small native chart
// bitmap because RemoteViews cannot host the React Native Almanac chart.
class OmniwxClimatologyWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    OmniwxWidgetScheduler.schedule(context)
    appWidgetIds.forEach { id ->
      val loading = RemoteViews(context.packageName, R.layout.omniwx_widget_climatology).apply {
        setOnClickPendingIntent(R.id.widget_root, OmniwxWidgetData.openIntent(context, "/almanac"))
        setTextViewText(R.id.widget_title, "Climatology")
        setTextViewText(R.id.widget_month, monthLabel())
        setTextViewText(R.id.widget_high, "--")
        setTextViewText(R.id.widget_low, "--")
        setTextViewText(R.id.widget_precip, "Updating")
        setTextViewText(R.id.widget_footer, "Loading climate normals")
        setImageViewBitmap(R.id.widget_arch, OmniwxWidgetData.climateArchBitmap(null))
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
        setImageViewBitmap(R.id.widget_arch, OmniwxWidgetData.climateArchBitmap(null))
      } else {
        setTextViewText(R.id.widget_title, climo.place.name)
        setTextViewText(R.id.widget_high, recordTempLabel(climo.recordHighF, climo.recordHighYear, climo.normalHighF))
        setTextViewText(R.id.widget_low, recordTempLabel(climo.recordLowF, climo.recordLowYear, climo.normalLowF))
        setTextViewText(
          R.id.widget_precip,
          recordPrecipLabel(climo.recordPrecipIn, climo.recordPrecipYear, climo.normalPrecipIn, climo.annualPrecipIn)
        )
        setTextViewText(R.id.widget_footer, footerLabel(climo))
        setImageViewBitmap(R.id.widget_arch, OmniwxWidgetData.climateArchBitmap(climo))
      }
    }
  }

  private fun recordTempLabel(record: Double?, year: Int?, normal: Double?): String {
    val value = record?.takeIf { it.isFinite() } ?: normal?.takeIf { it.isFinite() } ?: return "--"
    val suffix = year?.let { "\n$it" } ?: "\nnormal"
    return "${value.roundToInt()}°$suffix"
  }

  private fun tempLabel(value: Double?): String {
    return value?.takeIf { it.isFinite() }?.let { "${it.roundToInt()}°" } ?: "--"
  }

  private fun recordPrecipLabel(record: Double?, year: Int?, month: Double?, annual: Double?): String {
    val dailyRecord = record?.takeIf { it.isFinite() }?.let {
      String.format(Locale.US, "%.2f in%s", it, year?.let { recordYear -> "\n$recordYear" } ?: "")
    }
    if (dailyRecord != null) return dailyRecord
    return precipLabel(month, annual)
  }

  private fun precipLabel(month: Double?, annual: Double?): String {
    val monthly = month?.takeIf { it.isFinite() }?.let { String.format(Locale.US, "%.1f in", it) } ?: "--"
    val yearly = annual?.takeIf { it.isFinite() }?.let { String.format(Locale.US, "%.1f in yr", it) }
    return listOfNotNull(monthly, yearly).joinToString("\n")
  }

  private fun footerLabel(climo: WidgetClimatology): String {
    // The footer tells you whether today's daily-record cache was available or
    // whether the widget is only showing normal climatology.
    val normal = "Normals ${tempLabel(climo.normalHighF)}/${tempLabel(climo.normalLowF)}"
    val records = if (climo.recordHighF == null && climo.recordLowF == null && climo.recordPrecipIn == null) {
      "open Almanac for records"
    } else {
      "records for today"
    }
    return "$normal - $records - ${climo.updatedLabel}"
  }

  private fun monthLabel(): String {
    return SimpleDateFormat("MMM", Locale.US).format(Date()).uppercase(Locale.US)
  }
}
