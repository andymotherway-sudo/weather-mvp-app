package com.anonymous.weatherapp.widget

import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent

// Central refresh fan-out for all home-screen widgets. Individual refresh
// buttons and the 15-minute scheduler both land here, then each installed
// provider receives a normal ACTION_APPWIDGET_UPDATE broadcast.
class OmniwxWidgetRefreshReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_MY_PACKAGE_REPLACED && intent.action != OmniwxWidgetData.ACTION_REFRESH_WIDGETS) return
    OmniwxWidgetScheduler.schedule(context)

    refreshProvider(context, OmniwxCurrentWidgetProvider::class.java)
    refreshProvider(context, OmniwxCurrentRadarWidgetProvider::class.java)
    refreshProvider(context, OmniwxSkyScoreWidgetProvider::class.java)
    refreshProvider(context, OmniwxAviationWidgetProvider::class.java)
    refreshProvider(context, OmniwxAirportBoardWidgetProvider::class.java)
    refreshProvider(context, OmniwxRouteBriefingWidgetProvider::class.java)
    refreshProvider(context, OmniwxClimatologyWidgetProvider::class.java)
    refreshProvider(context, OmniwxClimateArchWidgetProvider::class.java)
  }

  private fun refreshProvider(context: Context, providerClass: Class<*>) {
    val manager = AppWidgetManager.getInstance(context)
    val ids = manager.getAppWidgetIds(ComponentName(context, providerClass))
    if (ids.isEmpty()) return

    val updateIntent = Intent(context, providerClass).apply {
      action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
      putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
    }
    context.sendBroadcast(updateIntent)
  }
}
