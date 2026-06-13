package com.anonymous.weatherapp.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import com.anonymous.weatherapp.R
import kotlin.concurrent.thread

// SkyScore widget. It tries to mirror the Space tab by reading the app's cached
// sky-score payload first; only if that is missing do we fall back to a rough
// weather-derived score so the widget never stays empty forever.
class OmniwxSkyScoreWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    OmniwxWidgetScheduler.schedule(context)

    thread(name = "omniwx-sky-widget") {
      val place = OmniwxWidgetData.readPlace(context)
      // Cache-first keeps the widget synchronized with the Space screen's
      // official score instead of inventing a second score on every refresh.
      val sky = runCatching { OmniwxWidgetData.fetchSkyScore(context) }.getOrNull()
        ?: place?.let { runCatching { OmniwxWidgetData.skyScore(OmniwxWidgetData.fetchWeather(it)) }.getOrNull() }
      appWidgetIds.forEach { id ->
        appWidgetManager.updateAppWidget(id, buildViews(context, place, sky))
      }
    }
  }

  private fun buildViews(context: Context, place: WidgetPlace?, sky: WidgetSkyScore?): RemoteViews {
    return RemoteViews(context.packageName, R.layout.omniwx_widget_sky_score).apply {
      setOnClickPendingIntent(R.id.widget_root, OmniwxWidgetData.openIntent(context, "/solar"))
      if (place == null || sky == null) {
        setTextViewText(R.id.widget_title, "SkyScore")
        setTextViewText(R.id.widget_chip, "Space")
        setTextViewText(R.id.widget_primary, "--")
        setTextViewText(R.id.widget_secondary, "Quality --")
        setTextViewText(R.id.widget_best_window, "Open Space to refresh")
        setTextViewText(R.id.widget_tertiary, "Bortle unavailable")
        setTextViewText(R.id.widget_cloud_low, "LOW CLOUDS\n--")
        setTextViewText(R.id.widget_cloud_mid, "MID CLOUDS\n--")
        setTextViewText(R.id.widget_cloud_high, "HIGH CLOUDS\n--")
        setTextViewText(R.id.widget_footer, "Updated --")
        setImageViewBitmap(R.id.widget_score_ring, OmniwxWidgetData.skyScoreRingBitmap(null))
      } else {
        setTextViewText(R.id.widget_title, place.name)
        setTextViewText(R.id.widget_chip, "Space")
        setTextViewText(R.id.widget_primary, sky.score.toString())
        setTextViewText(R.id.widget_secondary, sky.label)
        setTextViewText(R.id.widget_best_window, sky.bestWindow)
        setTextViewText(R.id.widget_tertiary, sky.bortle)
        setTextViewText(R.id.widget_cloud_low, "LOW CLOUDS\n${sky.cloudLow}")
        setTextViewText(R.id.widget_cloud_mid, "MID CLOUDS\n${sky.cloudMid}")
        setTextViewText(R.id.widget_cloud_high, "HIGH CLOUDS\n${sky.cloudHigh}")
        setTextViewText(R.id.widget_footer, sky.aurora)
        setImageViewBitmap(R.id.widget_score_ring, OmniwxWidgetData.skyScoreRingBitmap(sky.score))
      }
    }
  }
}
