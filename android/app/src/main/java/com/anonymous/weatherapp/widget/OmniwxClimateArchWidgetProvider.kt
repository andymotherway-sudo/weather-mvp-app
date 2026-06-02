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

class OmniwxClimateArchWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    appWidgetIds.forEach { id ->
      appWidgetManager.updateAppWidget(id, buildViews(context, null, loading = true))
    }

    thread(name = "omniwx-climate-arch-widget") {
      val climo = runCatching { OmniwxWidgetData.fetchClimatology(context) }.getOrNull()
      appWidgetIds.forEach { id ->
        appWidgetManager.updateAppWidget(id, buildViews(context, climo, loading = false))
      }
    }
  }

  private fun buildViews(context: Context, climo: WidgetClimatology?, loading: Boolean): RemoteViews {
    return RemoteViews(context.packageName, R.layout.omniwx_widget_climate_arch).apply {
      setOnClickPendingIntent(R.id.widget_root, OmniwxWidgetData.openIntent(context, "/almanac"))
      setTextViewText(R.id.widget_month, monthLabel())
      setImageViewBitmap(R.id.widget_arch_large, OmniwxWidgetData.climateArchLargeBitmap(climo))

      if (loading) {
        setTextViewText(R.id.widget_title, "Climate Arch")
        setTextViewText(R.id.widget_subtitle, "Loading 30-year normals")
        setTextViewText(R.id.widget_normal, "Normals --")
        setTextViewText(R.id.widget_variance, "Seasonal spread --")
        setTextViewText(R.id.widget_records, "Records loading")
        setTextViewText(R.id.widget_footer, "Tap to open Almanac")
        return@apply
      }

      if (climo == null) {
        setTextViewText(R.id.widget_title, "Climate Arch")
        setTextViewText(R.id.widget_subtitle, "Open OMNIwx to refresh")
        setTextViewText(R.id.widget_normal, "Normals --")
        setTextViewText(R.id.widget_variance, "Seasonal spread --")
        setTextViewText(R.id.widget_records, "Records unavailable")
        setTextViewText(R.id.widget_footer, "Tap to open Almanac")
        return@apply
      }

      setTextViewText(R.id.widget_title, climo.place.name)
      setTextViewText(R.id.widget_subtitle, "30-year normals - ${climo.stationName}")
      setTextViewText(R.id.widget_normal, "Normal ${tempLabel(climo.normalLowF)} / ${tempLabel(climo.normalHighF)}")
      setTextViewText(R.id.widget_variance, OmniwxWidgetData.climateVarianceLabel(climo))
      setTextViewText(R.id.widget_records, recordsLabel(climo))
      setTextViewText(R.id.widget_footer, "Updated ${climo.updatedLabel}")
    }
  }

  private fun recordsLabel(climo: WidgetClimatology): String {
    val high = climo.recordHighF?.takeIf { it.isFinite() }?.let {
      "High ${it.roundToInt()}°${yearSuffix(climo.recordHighYear)}"
    }
    val low = climo.recordLowF?.takeIf { it.isFinite() }?.let {
      "Low ${it.roundToInt()}°${yearSuffix(climo.recordLowYear)}"
    }
    val rain = climo.recordPrecipIn?.takeIf { it.isFinite() }?.let {
      String.format(Locale.US, "Rain %.2f in%s", it, yearSuffix(climo.recordPrecipYear))
    }
    return listOfNotNull(high, low, rain).takeIf { it.isNotEmpty() }?.joinToString(" - ")
      ?: "Open Almanac for daily records"
  }

  private fun tempLabel(value: Double?): String {
    return value?.takeIf { it.isFinite() }?.let { "${it.roundToInt()}°" } ?: "--"
  }

  private fun yearSuffix(year: Int?): String {
    return year?.let { " $it" } ?: ""
  }

  private fun monthLabel(): String {
    return SimpleDateFormat("MMM d", Locale.US).format(Date()).uppercase(Locale.US)
  }
}
