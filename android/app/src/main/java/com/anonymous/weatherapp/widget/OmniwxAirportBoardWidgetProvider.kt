package com.anonymous.weatherapp.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import com.anonymous.weatherapp.R

// Pilot-facing airport widget. This is separate from the generic aviation
// widget so a saved/home airport can get a dense METAR-style board.
class OmniwxAirportBoardWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    OmniwxWidgetScheduler.schedule(context)

    OmniwxWidgetExecutor.execute {
      // The data helper decides whether to use a saved field, selected airport,
      // or nearest sensible station; the provider only maps that board to XML.
      val board = runCatching { OmniwxWidgetData.fetchAirportBoard(context) }.getOrNull()
      appWidgetIds.forEach { id ->
        appWidgetManager.updateAppWidget(id, buildViews(context, board, loading = false))
      }
    }
  }

  private fun buildViews(context: Context, board: WidgetAirportBoard?, loading: Boolean): RemoteViews {
    return RemoteViews(context.packageName, R.layout.omniwx_widget_airport_board).apply {
      setOnClickPendingIntent(R.id.widget_root, OmniwxWidgetData.openIntent(context, "/aviation"))
      if (loading) {
        setTextViewText(R.id.widget_station, "Airport")
        setTextViewText(R.id.widget_airport_name, "Updating METAR")
        setTextViewText(R.id.widget_category, "--")
        setTextViewText(R.id.widget_status_title, "Loading")
        setTextViewText(R.id.widget_status_summary, "Checking selected or nearest station.")
        setTextViewText(R.id.widget_wind, "WIND\n--")
        setTextViewText(R.id.widget_visibility, "VISIBILITY\n--")
        setTextViewText(R.id.widget_ceiling, "CEILING\n--")
        setTextViewText(R.id.widget_altimeter, "ALTIMETER\n--")
        setTextViewText(R.id.widget_footer, "Situational awareness only.")
        return@apply
      }

      if (board == null) {
        setTextViewText(R.id.widget_station, "Airport")
        setTextViewText(R.id.widget_airport_name, "Open OMNIwx to select airport")
        setTextViewText(R.id.widget_category, "--")
        setTextViewText(R.id.widget_status_title, "No METAR")
        setTextViewText(R.id.widget_status_summary, "Open Aviation once to refresh airport weather.")
        setTextViewText(R.id.widget_wind, "WIND\n--")
        setTextViewText(R.id.widget_visibility, "VISIBILITY\n--")
        setTextViewText(R.id.widget_ceiling, "CEILING\n--")
        setTextViewText(R.id.widget_altimeter, "ALTIMETER\n--")
        setTextViewText(R.id.widget_footer, "Situational awareness only.")
        return@apply
      }

      setTextViewText(R.id.widget_station, board.station)
      setTextViewText(R.id.widget_airport_name, board.stationName)
      setTextViewText(R.id.widget_category, board.category)
      setTextViewText(R.id.widget_status_title, board.statusTitle)
      setTextViewText(R.id.widget_status_summary, board.statusSummary)
      setTextViewText(R.id.widget_wind, "WIND\n${board.wind}")
      setTextViewText(R.id.widget_visibility, "VISIBILITY\n${board.visibility}")
      setTextViewText(R.id.widget_ceiling, "CEILING\n${board.ceiling}")
      setTextViewText(R.id.widget_altimeter, "ALTIMETER\n${board.altimeter}")
      setTextViewText(R.id.widget_footer, "${board.tafTrend}. ${board.footer}")
    }
  }
}
