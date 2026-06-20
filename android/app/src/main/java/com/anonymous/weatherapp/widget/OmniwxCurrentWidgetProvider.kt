package com.anonymous.weatherapp.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import com.anonymous.weatherapp.R

// Small current-conditions widget. AppWidgetProvider callbacks run on the main
// thread, so we push network/cache reads through the shared widget worker.
class OmniwxCurrentWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    OmniwxWidgetScheduler.schedule(context)

    OmniwxWidgetExecutor.execute {
      val place = OmniwxWidgetData.readPlace(context)
      val weather = place?.let { runCatching { OmniwxWidgetData.fetchWeather(context, it) }.getOrNull() }
      appWidgetIds.forEach { id ->
        appWidgetManager.updateAppWidget(id, buildViews(context, weather))
      }
    }
  }

  // RemoteViews is a constrained native view tree: no React components, no
  // arbitrary layout logic at render time, only setting text/bitmaps on XML ids.
  private fun buildViews(context: Context, weather: WidgetWeather?): RemoteViews {
    return RemoteViews(context.packageName, R.layout.omniwx_widget_current).apply {
      setOnClickPendingIntent(R.id.widget_root, OmniwxWidgetData.openIntent(context, "/"))
      setOnClickPendingIntent(R.id.widget_brand, OmniwxWidgetData.refreshIntent(context))
      if (weather == null) {
        setTextViewText(R.id.widget_title, "OMNIwx")
        setTextViewText(R.id.widget_primary, "--")
        setTextViewText(R.id.widget_secondary, "Open OMNIwx to refresh")
        setTextViewText(R.id.widget_high, "--")
        setTextViewText(R.id.widget_low, "--")
        setTextViewText(R.id.widget_tertiary, "Set a default city or allow location")
        setTextViewText(R.id.widget_footer, "--")
        setImageViewBitmap(R.id.widget_icon, OmniwxWidgetData.weatherIconBitmap(-1))
      } else {
        setTextViewText(R.id.widget_title, weather.place.name)
        setTextViewText(R.id.widget_primary, "${weather.temperatureF.roundLabel()}")
        setTextViewText(R.id.widget_secondary, weatherCodeLabel(weather.weatherCode))
        setTextViewText(R.id.widget_high, "${weather.highF.roundLabel()} high")
        setTextViewText(R.id.widget_low, "${weather.lowF.roundLabel()} low")
        setTextViewText(
          R.id.widget_tertiary,
          "Wind ${windDirectionLabel(weather.windDirectionDeg)} ${weather.windMph.roundLabel()} mph"
        )
        setTextViewText(R.id.widget_footer, weather.updatedLabel)
        setImageViewBitmap(R.id.widget_icon, OmniwxWidgetData.weatherIconBitmap(weather.weatherCode))
      }
    }
  }
}
