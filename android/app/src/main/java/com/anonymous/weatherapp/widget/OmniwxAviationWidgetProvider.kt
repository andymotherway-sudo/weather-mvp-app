package com.anonymous.weatherapp.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.view.View
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
        appWidgetManager.updateAppWidget(id, buildViews(context, briefing, appWidgetManager.omniwxWidgetSizeClass(id)))
      }
    }
  }

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
    briefing: WidgetAviationBriefing?,
    sizeClass: OmniwxWidgetSizeClass,
  ): RemoteViews {
    return RemoteViews(context.packageName, R.layout.omniwx_widget_aviation).apply {
      setOnClickPendingIntent(R.id.widget_root, OmniwxWidgetData.openIntent(context, "/aviation"))
      val compact = sizeClass == OmniwxWidgetSizeClass.COMPACT
      setViewVisibility(R.id.widget_metrics, if (compact) View.GONE else View.VISIBLE)
      setViewVisibility(R.id.widget_divider, if (compact) View.GONE else View.VISIBLE)
      setViewVisibility(R.id.widget_footer, if (compact) View.GONE else View.VISIBLE)
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
