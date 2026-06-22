package com.anonymous.weatherapp.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import com.anonymous.weatherapp.R

// Current + radar widget. The radar panel is a native bitmap generated from
// live map/radar tiles when available, with a styled fallback board when the
// network or widget cache is not ready.
class OmniwxCurrentRadarWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    OmniwxWidgetScheduler.schedule(context)

    OmniwxWidgetExecutor.execute {
      val place = OmniwxWidgetData.readPlace(context)
      val weatherResult = place?.let { runCatching { OmniwxWidgetData.fetchWeather(context, it) } }
      val weather = weatherResult?.getOrNull()
      val weatherError = weatherResult?.exceptionOrNull()?.shortWidgetMessage()
        ?: OmniwxWidgetData.lastWeatherError(context)
      appWidgetIds.forEach { id ->
        appWidgetManager.updateAppWidget(id, buildViews(context, place, weather, loading = false, weatherError = weatherError))
      }
    }
  }

  private fun buildViews(
    context: Context,
    place: WidgetPlace?,
    weather: WidgetWeather?,
    loading: Boolean,
    weatherError: String? = null
  ): RemoteViews {
    return RemoteViews(context.packageName, R.layout.omniwx_widget_current_radar).apply {
      setOnClickPendingIntent(R.id.widget_root, OmniwxWidgetData.openIntent(context, "/maps"))
      setOnClickPendingIntent(R.id.widget_refresh, OmniwxWidgetData.refreshIntent(context))
      if (loading) {
        setTextViewText(R.id.widget_title, "OMNIwx")
        setTextViewText(R.id.widget_temp, "--")
        setTextViewText(R.id.widget_condition, "Updating current conditions")
        setTextViewText(R.id.widget_phrase, "Building radar snapshot")
        setTextViewText(R.id.widget_low, "Low --")
        setTextViewText(R.id.widget_range, "Now --")
        setTextViewText(R.id.widget_high, "High --")
        setTextViewText(R.id.widget_wind, "Wind --  Dew --")
        setTextViewText(R.id.widget_footer, "Radar snapshot pending")
        setImageViewBitmap(R.id.widget_icon, OmniwxWidgetData.weatherIconBitmap(-1))
        setImageViewBitmap(R.id.widget_radar, OmniwxWidgetData.radarSnapshotBitmap(null, null))
        return@apply
      }
      if (weather == null) {
        val conciseError = weatherError?.takeIf { it.isNotBlank() }?.take(44)
        setTextViewText(R.id.widget_title, place?.name ?: "OMNIwx")
        setTextViewText(R.id.widget_temp, "--")
        setTextViewText(R.id.widget_condition, if (place == null) "Open OMNIwx to refresh" else "Weather refresh failed")
        setTextViewText(
          R.id.widget_phrase,
          if (place == null) "Set a default city or allow location" else conciseError ?: "Tap refresh or open OMNIwx"
        )
        setTextViewText(R.id.widget_low, "Low --")
        setTextViewText(R.id.widget_range, "Now --")
        setTextViewText(R.id.widget_high, "High --")
        setTextViewText(R.id.widget_wind, "Wind --  Dew --")
        setTextViewText(R.id.widget_footer, if (place == null) "Tap refresh after opening OMNIwx once" else "Using saved location")
        setImageViewBitmap(R.id.widget_icon, OmniwxWidgetData.weatherIconBitmap(-1))
        setImageViewBitmap(R.id.widget_radar, OmniwxWidgetData.radarSnapshotBitmap(place, null))
        return@apply
      }
      setTextViewText(R.id.widget_title, weather.place.name)
      setTextViewText(R.id.widget_temp, "${weather.temperatureF.roundLabel()}°")
      setTextViewText(R.id.widget_condition, weatherCodeLabel(weather.weatherCode))
      setTextViewText(R.id.widget_phrase, smartWeatherPhrase(weather))
      setTextViewText(R.id.widget_low, "Low ${weather.lowF.roundLabel()}°")
      setTextViewText(R.id.widget_range, "Now ${weather.temperatureF.roundLabel()}°")
      setTextViewText(R.id.widget_high, "High ${weather.highF.roundLabel()}°")
      setTextViewText(
        R.id.widget_wind,
        "H/L ${weather.highF.roundLabel()}°/${weather.lowF.roundLabel()}°  Wind ${windDirectionLabel(weather.windDirectionDeg)} ${weather.windMph.roundLabel()}  Dew ${weather.dewPointF.roundLabel()}°"
      )
      setTextViewText(R.id.widget_footer, "Updated ${weather.updatedLabel}")
      setImageViewBitmap(R.id.widget_icon, OmniwxWidgetData.weatherIconBitmap(weather.weatherCode))
      setImageViewBitmap(R.id.widget_radar, OmniwxWidgetData.radarSnapshotBitmap(weather.place, weather))
    }
  }

  private fun smartWeatherPhrase(weather: WidgetWeather): String {
    val temp = weather.temperatureF
    val humidity = weather.humidityPct
    val wind = weather.windMph
    val condition = weatherCodeLabel(weather.weatherCode)
    val heat = when {
      temp.isFinite() && temp >= 100 -> "very hot"
      temp.isFinite() && temp >= 90 -> "hot"
      temp.isFinite() && temp >= 80 -> "warm"
      temp.isFinite() && temp <= 32 -> "freezing"
      temp.isFinite() && temp <= 45 -> "chilly"
      else -> "mild"
    }
    val moisture = when {
      humidity.isFinite() && humidity >= 75 -> "humid"
      humidity.isFinite() && humidity <= 25 -> "dry air"
      else -> "comfortable"
    }
    val breeze = when {
      wind.isFinite() && wind >= 22 -> "windy"
      wind.isFinite() && wind >= 12 -> "breezy"
      else -> "light wind"
    }
    return "$condition • $heat • $moisture • $breeze"
  }
}
