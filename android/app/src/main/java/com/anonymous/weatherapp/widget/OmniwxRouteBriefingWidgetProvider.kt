package com.anonymous.weatherapp.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import com.anonymous.weatherapp.R

// Route briefing widget. It intentionally shows the last analyzed/saved route
// instead of running a fresh flight briefing from the home screen.
class OmniwxRouteBriefingWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    OmniwxWidgetScheduler.schedule(context)

    OmniwxWidgetExecutor.execute {
      val route = runCatching { OmniwxWidgetData.fetchRouteBriefing(context) }.getOrNull()
      appWidgetIds.forEach { id ->
        appWidgetManager.updateAppWidget(id, buildViews(context, route, loading = false))
      }
    }
  }

  private fun buildViews(context: Context, route: WidgetRouteBriefing?, loading: Boolean): RemoteViews {
    return RemoteViews(context.packageName, R.layout.omniwx_widget_route_briefing).apply {
      setOnClickPendingIntent(R.id.widget_root, OmniwxWidgetData.openIntent(context, "/aviation"))
      if (loading) {
        setTextViewText(R.id.widget_route_title, "Route Briefing")
        setTextViewText(R.id.widget_route_category, "--")
        setTextViewText(R.id.widget_route_detail, "Updating corridor")
        setTextViewText(R.id.widget_route_concern, "Loading saved route weather.")
        setCounts("--", "--", "--", "--", "--", "--")
        setTextViewText(R.id.widget_footer, "Situational awareness only.")
        return@apply
      }

      if (route == null) {
        setTextViewText(R.id.widget_route_title, "Route Briefing")
        setTextViewText(R.id.widget_route_category, "--")
        setTextViewText(R.id.widget_route_detail, "No saved route")
        setTextViewText(R.id.widget_route_concern, "Analyze a route in OMNIwx Aviation to pin corridor weather here.")
        setCounts("--", "--", "--", "--", "--", "--")
        setTextViewText(R.id.widget_footer, "Situational awareness only.")
        return@apply
      }

      setTextViewText(R.id.widget_route_title, route.title)
      setTextViewText(R.id.widget_route_category, route.category.uppercase())
      setTextViewText(R.id.widget_route_detail, route.detail)
      setTextViewText(R.id.widget_route_concern, route.concern)
      setCounts(route.turbulence, route.icing, route.flightCategory, route.sigmet, route.cwa, route.pirep)
      setTextViewText(R.id.widget_footer, route.footer)
    }
  }

  // Keep the six badges compact; a widget should answer "anything I should
  // care about?" without trying to replace the full Aviation route screen.
  private fun RemoteViews.setCounts(turb: String, icing: String, cat: String, sigmet: String, cwa: String, pirep: String) {
    setTextViewText(R.id.widget_turbulence, "TURB\n$turb")
    setTextViewText(R.id.widget_icing, "ICE\n$icing")
    setTextViewText(R.id.widget_flight_cat, "CAT\n$cat")
    setTextViewText(R.id.widget_sigmet, "SIGMET\n$sigmet")
    setTextViewText(R.id.widget_cwa, "CWA\n$cwa")
    setTextViewText(R.id.widget_pirep, "PIREP\n$pirep")
  }
}
