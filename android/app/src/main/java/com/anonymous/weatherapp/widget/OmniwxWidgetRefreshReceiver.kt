package com.anonymous.weatherapp.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import java.util.concurrent.atomic.AtomicBoolean

private const val WIDGET_REFRESH_PREFS = "omniwx_widget_refresh"
private const val LAST_BACKGROUND_REFRESH_MS = "lastBackgroundRefreshMs"
private const val BACKGROUND_REFRESH_COOLDOWN_MS = 12L * 60L * 1000L

// Central refresh fan-out for all home-screen widgets. Individual refresh
// buttons and the scheduler both land here, then each installed provider
// receives a normal ACTION_APPWIDGET_UPDATE broadcast.
class OmniwxWidgetRefreshReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action
    if (
      action != Intent.ACTION_MY_PACKAGE_REPLACED &&
      action != Intent.ACTION_BOOT_COMPLETED &&
      action != Intent.ACTION_LOCKED_BOOT_COMPLETED &&
      action != OmniwxWidgetData.ACTION_REFRESH_WIDGETS
    ) return
    val manual = intent.getStringExtra(OmniwxWidgetData.EXTRA_REFRESH_REASON) == OmniwxWidgetData.REFRESH_REASON_MANUAL
    refreshAll(context, force = manual || action != OmniwxWidgetData.ACTION_REFRESH_WIDGETS)
  }

  companion object {
    private val refreshInFlight = AtomicBoolean(false)

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

    fun refreshAll(context: Context, force: Boolean = false): Boolean {
      val manager = AppWidgetManager.getInstance(context)
      val hasInstalled = hasInstalledWidgets(context, manager)
      if (!hasInstalled) {
        OmniwxWidgetScheduler.cancel(context)
        return false
      }

      if (!force && OmniwxWidgetRuntime.isAppVisible(context)) {
        OmniwxWidgetScheduler.schedule(context)
        return true
      }

      if (!force && !shouldRunBackgroundRefresh(context)) {
        OmniwxWidgetScheduler.schedule(context)
        return true
      }

      if (!refreshInFlight.compareAndSet(false, true)) {
        OmniwxWidgetScheduler.schedule(context)
        return true
      }

      var hasWidgets = false
      try {
        if (!force) markBackgroundRefresh(context)
        providers.forEach { providerClass ->
          hasWidgets = refreshProvider(context, manager, providerClass) || hasWidgets
        }
      } finally {
        refreshInFlight.set(false)
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
      return hasInstalledWidgets(context, manager)
    }

    private fun hasInstalledWidgets(context: Context, manager: AppWidgetManager): Boolean {
      return providers.any { providerClass ->
        manager.getAppWidgetIds(ComponentName(context, providerClass)).isNotEmpty()
      }
    }

    private fun shouldRunBackgroundRefresh(context: Context): Boolean {
      val prefs = context.getSharedPreferences(WIDGET_REFRESH_PREFS, Context.MODE_PRIVATE)
      val last = prefs.getLong(LAST_BACKGROUND_REFRESH_MS, 0L)
      return last <= 0L || System.currentTimeMillis() - last >= BACKGROUND_REFRESH_COOLDOWN_MS
    }

    private fun markBackgroundRefresh(context: Context) {
      context.getSharedPreferences(WIDGET_REFRESH_PREFS, Context.MODE_PRIVATE)
        .edit()
        .putLong(LAST_BACKGROUND_REFRESH_MS, System.currentTimeMillis())
        .apply()
    }

    private fun refreshProvider(context: Context, manager: AppWidgetManager, providerClass: Class<out AppWidgetProvider>): Boolean {
      val ids = manager.getAppWidgetIds(ComponentName(context, providerClass))
      if (ids.isEmpty()) return false

      providerClass.getDeclaredConstructor().newInstance().onUpdate(context, manager, ids)
      return true
    }
  }
}
