package com.anonymous.weatherapp.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import com.anonymous.weatherapp.R
import kotlin.concurrent.thread

class OmniwxCurrentWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    appWidgetIds.forEach { id ->
      val loading = RemoteViews(context.packageName, R.layout.omniwx_widget_current).apply {
        setOnClickPendingIntent(R.id.widget_root, OmniwxWidgetData.openIntent(context, "/"))
        setTextViewText(R.id.widget_title, "OMNIwx")
        setTextViewText(R.id.widget_primary, "--F")
        setTextViewText(R.id.widget_secondary, "Updating current conditions")
        setTextViewText(R.id.widget_tertiary, "Open OMNIwx if this stays blank")
        setTextViewText(R.id.widget_footer, "Last updated --")
      }
      appWidgetManager.updateAppWidget(id, loading)
    }

    thread(name = "omniwx-current-widget") {
      val place = OmniwxWidgetData.readPlace(context)
      val weather = place?.let { runCatching { OmniwxWidgetData.fetchWeather(it) }.getOrNull() }
      appWidgetIds.forEach { id ->
        appWidgetManager.updateAppWidget(id, buildViews(context, weather))
      }
    }
  }

  private fun buildViews(context: Context, weather: WidgetWeather?): RemoteViews {
    return RemoteViews(context.packageName, R.layout.omniwx_widget_current).apply {
      setOnClickPendingIntent(R.id.widget_root, OmniwxWidgetData.openIntent(context, "/"))
      if (weather == null) {
        setTextViewText(R.id.widget_title, "OMNIwx")
        setTextViewText(R.id.widget_primary, "--F")
        setTextViewText(R.id.widget_secondary, "Open OMNIwx to refresh")
        setTextViewText(R.id.widget_tertiary, "Set a default city or allow location")
        setTextViewText(R.id.widget_footer, "Last updated --")
      } else {
        setTextViewText(R.id.widget_title, weather.place.name)
        setTextViewText(R.id.widget_primary, "${weather.temperatureF.roundLabel()}F")
        setTextViewText(
          R.id.widget_secondary,
          "${weatherCodeLabel(weather.weatherCode)} - H ${weather.highF.roundLabel()} / L ${weather.lowF.roundLabel()}"
        )
        setTextViewText(
          R.id.widget_tertiary,
          "Wind ${windDirectionLabel(weather.windDirectionDeg)} ${weather.windMph.roundLabel()} mph"
        )
        setTextViewText(R.id.widget_footer, "Last updated ${weather.updatedLabel}")
      }
    }
  }
}
