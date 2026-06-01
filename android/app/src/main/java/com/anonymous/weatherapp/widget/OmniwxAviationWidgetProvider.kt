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
        setTextViewText(R.id.widget_primary, "--")
        setTextViewText(R.id.widget_secondary, "Updating METAR")
        setTextViewText(R.id.widget_tertiary, "Ceiling --")
        setTextViewText(R.id.widget_footer, "Situational awareness only.")
      }
      appWidgetManager.updateAppWidget(id, loading)
    }

    thread(name = "omniwx-aviation-widget") {
      val briefing = runCatching { OmniwxWidgetData.fetchAviationBriefing(context) }.getOrNull()
      appWidgetIds.forEach { id ->
        appWidgetManager.updateAppWidget(id, buildViews(context, briefing))
      }
    }
  }

  private fun buildViews(context: Context, briefing: WidgetAviationBriefing?): RemoteViews {
    return RemoteViews(context.packageName, R.layout.omniwx_widget_aviation).apply {
        setOnClickPendingIntent(R.id.widget_root, OmniwxWidgetData.openIntent(context, "/aviation"))
      if (briefing == null) {
        setTextViewText(R.id.widget_title, "Aviation")
        setTextViewText(R.id.widget_primary, "--")
        setTextViewText(R.id.widget_secondary, "Open OMNIwx")
        setTextViewText(R.id.widget_tertiary, "Ceiling --")
        setTextViewText(R.id.widget_footer, "Situational awareness only.")
      } else {
        setTextViewText(R.id.widget_title, briefing.title)
        setTextViewText(R.id.widget_primary, briefing.category)
        setTextViewText(R.id.widget_secondary, briefing.secondary)
        setTextViewText(R.id.widget_tertiary, briefing.tertiary)
        setTextViewText(R.id.widget_footer, briefing.footer)
      }
    }
  }
}
