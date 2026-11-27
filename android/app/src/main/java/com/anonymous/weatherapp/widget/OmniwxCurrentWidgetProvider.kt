package com.anonymous.weatherapp.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.view.View
import android.widget.RemoteViews
import com.anonymous.weatherapp.R

// Small current-conditions widget. AppWidgetProvider callbacks run on the main
// thread, so we push network/cache reads through the shared widget worker.
class OmniwxCurrentWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    OmniwxWidgetScheduler.schedule(context)

    OmniwxWidgetExecutor.execute {
      val place = OmniwxWidgetData.readPlace(context)
      val weatherResult = place?.let { runCatching { OmniwxWidgetData.fetchWeather(context, it) } }
      val weather = weatherResult?.getOrNull()
      val weatherError = weatherResult?.exceptionOrNull()?.shortWidgetMessage()
        ?: OmniwxWidgetData.lastWeatherError(context)
      appWidgetIds.forEach { id ->
        appWidgetManager.updateAppWidget(id, buildViews(context, place, weather, weatherError, appWidgetManager.omniwxWidgetSizeClass(id)))
      }
    }
  }

  // RemoteViews is a constrained native view tree: no React components, no
  // arbitrary layout logic at render time, only setting text/bitmaps on XML ids.
  override fun onAppWidgetOptionsChanged(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int,
    newOptions: android.os.Bundle,
  ) {
    onUpdate(context, appWidgetManager, intArrayOf(appWidgetId))
  }

  private fun buildViews(
    context: Context,
    place: WidgetPlace?,
    weather: WidgetWeather?,
    weatherError: String?,
    sizeClass: OmniwxWidgetSizeClass,
  ): RemoteViews {
    return RemoteViews(context.packageName, R.layout.omniwx_widget_current).apply {
      setOnClickPendingIntent(R.id.widget_root, OmniwxWidgetData.openIntent(context, "/"))
      setOnClickPendingIntent(R.id.widget_brand, OmniwxWidgetData.refreshIntent(context))
      val compact = sizeClass == OmniwxWidgetSizeClass.COMPACT
      val expanded = sizeClass == OmniwxWidgetSizeClass.EXPANDED
      setViewVisibility(R.id.widget_high, if (compact) View.GONE else View.VISIBLE)
      setViewVisibility(R.id.widget_low, if (compact) View.GONE else View.VISIBLE)
      setViewVisibility(R.id.widget_metrics, if (compact) View.GONE else View.VISIBLE)
      setViewVisibility(R.id.widget_trend, if (compact) View.GONE else View.VISIBLE)
      setViewVisibility(R.id.widget_detail_metrics, if (expanded) View.VISIBLE else View.GONE)
      setViewVisibility(R.id.widget_divider, if (compact) View.GONE else View.VISIBLE)
      setViewVisibility(R.id.widget_tertiary, if (compact) View.GONE else View.VISIBLE)
      setViewVisibility(R.id.widget_footer, if (compact) View.GONE else View.VISIBLE)
      if (weather == null) {
        setTextViewText(R.id.widget_title, place?.name ?: "OMNIwx")
        setTextViewText(R.id.widget_primary, "--")
        setTextViewText(R.id.widget_secondary, if (place == null) "Open OMNIwx to refresh" else "Weather refresh failed")
        setTextViewText(R.id.widget_high, "--")
        setTextViewText(R.id.widget_low, "--")
        setTextViewText(
          R.id.widget_tertiary,
          if (place == null) "Set a default city or allow location" else weatherError?.take(44) ?: "Tap refresh or open OMNIwx"
        )
        setTextViewText(R.id.widget_footer, "--")
        setImageViewBitmap(R.id.widget_icon, OmniwxWidgetData.weatherIconBitmap(-1))
        setImageViewBitmap(R.id.widget_trend, OmniwxWidgetData.hourlyTrendBitmap(null))
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
        setImageViewBitmap(R.id.widget_trend, OmniwxWidgetData.hourlyTrendBitmap(weather))
        setTextViewText(R.id.widget_wind_metric, "${windDirectionLabel(weather.windDirectionDeg)} ${weather.windMph.roundLabel()} mph")
        setTextViewText(R.id.widget_humidity_metric, "RH ${weather.humidityPct.roundLabel()}%")
        setTextViewText(R.id.widget_dew_metric, "Dew ${weather.dewPointF.roundLabel()}°")
      }
    }
  }
}
