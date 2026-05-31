package com.anonymous.weatherapp.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import com.anonymous.weatherapp.R
import kotlin.concurrent.thread

class OmniwxSkyScoreWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    appWidgetIds.forEach { id ->
      val loading = RemoteViews(context.packageName, R.layout.omniwx_widget_sky_score).apply {
        setOnClickPendingIntent(R.id.widget_root, OmniwxWidgetData.openIntent(context, "/solar"))
        setTextViewText(R.id.widget_title, "SkyScore")
        setTextViewText(R.id.widget_primary, "-- / 100")
        setTextViewText(R.id.widget_secondary, "Updating sky conditions")
        setTextViewText(R.id.widget_tertiary, "Open Space if this stays blank")
        setTextViewText(R.id.widget_footer, "Last updated --")
      }
      appWidgetManager.updateAppWidget(id, loading)
    }

    thread(name = "omniwx-sky-widget") {
      val place = OmniwxWidgetData.readPlace(context)
      val weather = place?.let { runCatching { OmniwxWidgetData.fetchWeather(it) }.getOrNull() }
      val sky = weather?.let { OmniwxWidgetData.skyScore(it) }
      appWidgetIds.forEach { id ->
        appWidgetManager.updateAppWidget(id, buildViews(context, weather, sky))
      }
    }
  }

  private fun buildViews(context: Context, weather: WidgetWeather?, sky: WidgetSkyScore?): RemoteViews {
    return RemoteViews(context.packageName, R.layout.omniwx_widget_sky_score).apply {
      setOnClickPendingIntent(R.id.widget_root, OmniwxWidgetData.openIntent(context, "/solar"))
      if (weather == null || sky == null) {
        setTextViewText(R.id.widget_title, "SkyScore")
        setTextViewText(R.id.widget_primary, "-- / 100")
        setTextViewText(R.id.widget_secondary, "Open Space to refresh")
        setTextViewText(R.id.widget_tertiary, "Bortle unavailable - Aurora unavailable")
        setTextViewText(R.id.widget_footer, "Last updated --")
      } else {
        setTextViewText(R.id.widget_title, weather.place.name)
        setTextViewText(R.id.widget_primary, "${sky.score} / 100")
        setTextViewText(R.id.widget_secondary, "${sky.label} - ${sky.bestWindow}")
        setTextViewText(R.id.widget_tertiary, "${sky.bortle} - ${sky.aurora}")
        setTextViewText(R.id.widget_footer, "Last updated ${weather.updatedLabel}")
      }
    }
  }
}
