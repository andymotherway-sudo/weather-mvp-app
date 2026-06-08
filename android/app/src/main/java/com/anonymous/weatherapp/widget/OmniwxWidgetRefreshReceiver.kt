package com.anonymous.weatherapp.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent

// Central refresh fan-out for all home-screen widgets. Individual refresh
// buttons and the 15-minute scheduler both land here, then each installed
// provider receives a normal ACTION_APPWIDGET_UPDATE broadcast.
class OmniwxWidgetRefreshReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action
    if (
      action != Intent.ACTION_MY_PACKAGE_REPLACED &&
      action != Intent.ACTION_BOOT_COMPLETED &&
      action != Intent.ACTION_LOCKED_BOOT_COMPLETED &&
      action != OmniwxWidgetData.ACTION_REFRESH_WIDGETS
    ) return
    refreshAll(context)
  }

  companion object {
    private val providers = listOf(
      OmniwxCurrentWidgetProvider::class.java,
      OmniwxCurrentRadarWidgetProvider::class.java,
      OmniwxSkyScoreWidgetProvider::class.java,
      OmniwxAviationWidgetProvider::class.java,
      OmniwxAirportBoardWidgetProvider::class.java,
      OmniwxRouteBriefingWidgetProvider::class.java,
      OmniwxClimatologyWidgetProvider::class.java,
      OmniwxClimateArchWidgetProvider::class.java,
    )

    fun refreshAll(context: Context): Boolean {
      val manager = AppWidgetManager.getInstance(context)
      var hasWidgets = false
      providers.forEach { providerClass ->
        hasWidgets = refreshProvider(context, manager, providerClass) || hasWidgets
      }
      if (hasWidgets) {
        OmniwxWidgetScheduler.schedule(context)
      } else {
        OmniwxWidgetScheduler.cancel(context)
      }
      return hasWidgets
    }

    fun hasInstalledWidgets(context: Context): Boolean {
      val manager = AppWidgetManager.getInstance(context)
      return providers.any { providerClass ->
        manager.getAppWidgetIds(ComponentName(context, providerClass)).isNotEmpty()
      }
    }

    private fun refreshProvider(context: Context, manager: AppWidgetManager, providerClass: Class<out AppWidgetProvider>): Boolean {
      val ids = manager.getAppWidgetIds(ComponentName(context, providerClass))
      if (ids.isEmpty()) return false

      providerClass.getDeclaredConstructor().newInstance().onUpdate(context, manager, ids)
      return true
    }
  }
}
