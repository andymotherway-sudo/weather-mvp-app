package com.anonymous.weatherapp.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import com.anonymous.weatherapp.R
import kotlin.concurrent.thread

class OmniwxAviationWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    appWidgetIds.forEach { id ->
      val loading = RemoteViews(context.packageName, R.layout.omniwx_widget_aviation).apply {
        setOnClickPendingIntent(R.id.widget_root, OmniwxWidgetData.openIntent(context, "/aviation"))
        setTextViewText(R.id.widget_title, "Aviation")
        setTextViewText(R.id.widget_primary, "Category --")
        setTextViewText(R.id.widget_secondary, "Updating nearest METAR")
        setTextViewText(R.id.widget_tertiary, "Open Aviation if this stays blank")
        setTextViewText(R.id.widget_footer, "Situational awareness only.")
      }
      appWidgetManager.updateAppWidget(id, loading)
    }

    thread(name = "omniwx-aviation-widget") {
      val place = OmniwxWidgetData.readPlace(context)
      val metar = place?.let { runCatching { OmniwxWidgetData.fetchNearestMetar(it) }.getOrNull() }
      appWidgetIds.forEach { id ->
        appWidgetManager.updateAppWidget(id, buildViews(context, metar))
      }
    }
  }

  private fun buildViews(context: Context, metar: WidgetMetar?): RemoteViews {
    return RemoteViews(context.packageName, R.layout.omniwx_widget_aviation).apply {
      setOnClickPendingIntent(R.id.widget_root, OmniwxWidgetData.openIntent(context, "/aviation"))
      if (metar == null) {
        setTextViewText(R.id.widget_title, "Aviation")
        setTextViewText(R.id.widget_primary, "Category --")
        setTextViewText(R.id.widget_secondary, "Open OMNIwx to refresh")
        setTextViewText(R.id.widget_tertiary, "Nearest METAR unavailable")
        setTextViewText(R.id.widget_footer, "Situational awareness only.")
      } else {
        setTextViewText(R.id.widget_title, metar.station)
        setTextViewText(R.id.widget_primary, "Category ${metar.category}")
        setTextViewText(R.id.widget_secondary, "Wind ${metar.wind} - Vis ${metar.visibility}")
        setTextViewText(R.id.widget_tertiary, "${metar.ceiling} - ${metar.hazards}")
        setTextViewText(R.id.widget_footer, "Situational awareness only. ${metar.updatedLabel}")
      }
    }
  }
}
