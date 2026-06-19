package com.anonymous.weatherapp.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import com.anonymous.weatherapp.R

// Legacy/general aviation widget. Newer pilot widgets split airport boards and
// route briefings, but this remains as a compact nearest-field awareness card.
class OmniwxAviationWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    OmniwxWidgetScheduler.schedule(context)

    OmniwxWidgetExecutor.execute {
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
