package com.anonymous.weatherapp.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import com.anonymous.weatherapp.R
import kotlin.concurrent.thread

// Current + radar widget. The radar panel is a native bitmap generated from
// live map/radar tiles when available, with a styled fallback board when the
// network or widget cache is not ready.
class OmniwxCurrentRadarWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    OmniwxWidgetScheduler.schedule(context)
    appWidgetIds.forEach { id ->
      appWidgetManager.updateAppWidget(id, buildViews(context, null, loading = true))
    }

    thread(name = "omniwx-current-radar-widget") {
      val place = OmniwxWidgetData.readPlace(context)
      val weather = place?.let { runCatching { OmniwxWidgetData.fetchWeather(it) }.getOrNull() }
      appWidgetIds.forEach { id ->
        appWidgetManager.updateAppWidget(id, buildViews(context, weather, loading = false))
      }
    }
  }

  private fun buildViews(context: Context, weather: WidgetWeather?, loading: Boolean): RemoteViews {
    return RemoteViews(context.packageName, R.layout.omniwx_widget_current_radar).apply {
      setOnClickPendingIntent(R.id.widget_root, OmniwxWidgetData.openIntent(context, "/maps"))
      setOnClickPendingIntent(R.id.widget_refresh, OmniwxWidgetData.refreshIntent(context))
      if (loading) {
        setTextViewText(R.id.widget_title, "OMNIwx")
        setTextViewText(R.id.widget_chip, "Refreshing")
        setTextViewText(R.id.widget_temp, "--")
        setTextViewText(R.id.widget_condition, "Updating current conditions")
        setTextViewText(R.id.widget_range, "-- high / -- low")
        setTextViewText(R.id.widget_wind, "Wind --")
        setTextViewText(R.id.widget_footer, "Radar snapshot pending")
        setImageViewBitmap(R.id.widget_icon, OmniwxWidgetData.weatherIconBitmap(-1))
        setImageViewBitmap(R.id.widget_radar, OmniwxWidgetData.radarSnapshotBitmap(null, null))
        return@apply
      }
      if (weather == null) {
        setTextViewText(R.id.widget_title, "OMNIwx")
        setTextViewText(R.id.widget_chip, "Radar")
        setTextViewText(R.id.widget_temp, "--")
        setTextViewText(R.id.widget_condition, "Open OMNIwx to refresh")
        setTextViewText(R.id.widget_range, "Set a default city or allow location")
        setTextViewText(R.id.widget_wind, "Wind --")
        setTextViewText(R.id.widget_footer, "Tap refresh after opening OMNIwx once")
        setImageViewBitmap(R.id.widget_icon, OmniwxWidgetData.weatherIconBitmap(-1))
        setImageViewBitmap(R.id.widget_radar, OmniwxWidgetData.radarSnapshotBitmap(null, null))
        return@apply
      }
      setTextViewText(R.id.widget_title, weather.place.name)
      setTextViewText(R.id.widget_chip, "Now")
      setTextViewText(R.id.widget_temp, "${weather.temperatureF.roundLabel()}°")
      setTextViewText(R.id.widget_condition, weatherCodeLabel(weather.weatherCode))
      setTextViewText(R.id.widget_range, "${weather.highF.roundLabel()}° high / ${weather.lowF.roundLabel()}° low")
      setTextViewText(R.id.widget_wind, "Wind ${windDirectionLabel(weather.windDirectionDeg)} ${weather.windMph.roundLabel()} mph")
      setTextViewText(R.id.widget_footer, "Updated ${weather.updatedLabel}")
      setImageViewBitmap(R.id.widget_icon, OmniwxWidgetData.weatherIconBitmap(weather.weatherCode))
      setImageViewBitmap(R.id.widget_radar, OmniwxWidgetData.radarSnapshotBitmap(weather.place, weather))
    }
  }
}
