package com.anonymous.weatherapp.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.view.View
import android.widget.RemoteViews
import com.anonymous.weatherapp.R

// SkyScore is a canonical astronomy product. Unlike a weather icon, it must
// never invent an observing score or a "best" time from current conditions.
class OmniwxSkyScoreWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    OmniwxWidgetScheduler.schedule(context)

    OmniwxWidgetExecutor.execute {
      val place = OmniwxWidgetData.readPlace(context)
      // Cache-first keeps the widget synchronized with the Space screen's
      // official score. A missing canonical payload is shown as unavailable.
      val sky = runCatching { OmniwxWidgetData.fetchSkyScore(context) }.getOrNull()
      appWidgetIds.forEach { id ->
        appWidgetManager.updateAppWidget(id, buildViews(context, place, sky, appWidgetManager.omniwxWidgetSizeClass(id)))
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
    place: WidgetPlace?,
    sky: WidgetSkyScore?,
    sizeClass: OmniwxWidgetSizeClass,
  ): RemoteViews {
    // The wide card mirrors the launcher-friendly 4x2 dashboard; retain the
    // taller composition when users expand it for cloud detail.
    val layout = when (sizeClass) {
      OmniwxWidgetSizeClass.COMPACT -> R.layout.omniwx_widget_sky_score_compact
      OmniwxWidgetSizeClass.STANDARD -> R.layout.omniwx_widget_sky_score_wide
      OmniwxWidgetSizeClass.EXPANDED -> R.layout.omniwx_widget_sky_score
    }
    return RemoteViews(context.packageName, layout).apply {
      setOnClickPendingIntent(R.id.widget_root, OmniwxWidgetData.openIntent(context, "/solar"))
      val compact = sizeClass == OmniwxWidgetSizeClass.COMPACT
      setViewVisibility(R.id.widget_cloud_summary, if (compact) View.GONE else View.VISIBLE)
      setViewVisibility(R.id.widget_divider, if (compact) View.GONE else View.VISIBLE)
      setViewVisibility(R.id.widget_footer, if (compact) View.GONE else View.VISIBLE)
      if (place == null || sky == null) {
        setTextViewText(R.id.widget_title, "SkyScore")
        setTextViewText(R.id.widget_chip, "ASTRO")
        setTextViewText(R.id.widget_primary, "--")
        setTextViewText(R.id.widget_secondary, "Astronomy data unavailable")
        setTextViewText(R.id.widget_best_window, "Open Space to calculate tonight")
        setTextViewText(R.id.widget_tertiary, "No observing window asserted")
        setTextViewText(R.id.widget_cloud_summary, "Cloud-layer forecast unavailable")
        setTextViewText(R.id.widget_footer, "Tap to refresh OMNIwx Space")
        setImageViewBitmap(R.id.widget_score_ring, OmniwxWidgetData.skyScoreRingBitmap(null))
        if (sizeClass == OmniwxWidgetSizeClass.EXPANDED) {
          setViewVisibility(R.id.widget_cloud_profile, View.GONE)
        }
      } else {
        setTextViewText(R.id.widget_title, place.name)
        setTextViewText(R.id.widget_chip, "Space")
        setTextViewText(R.id.widget_primary, sky.score.toString())
        setTextViewText(R.id.widget_secondary, sky.label)
        setTextViewText(R.id.widget_best_window, sky.bestWindow)
        setTextViewText(R.id.widget_tertiary, sky.bortle)
        setTextViewText(R.id.widget_cloud_summary, sky.clouds)
        setTextViewText(R.id.widget_footer, sky.aurora)
        setImageViewBitmap(R.id.widget_score_ring, OmniwxWidgetData.skyScoreRingBitmap(sky.score))
        if (sizeClass == OmniwxWidgetSizeClass.EXPANDED) {
          val hasCloudProfile = OmniwxWidgetData.hasSkyCloudProfile(sky.cloudLow, sky.cloudMid, sky.cloudHigh)
          setViewVisibility(R.id.widget_cloud_profile, if (hasCloudProfile) View.VISIBLE else View.GONE)
          if (hasCloudProfile) {
            setImageViewBitmap(
              R.id.widget_cloud_profile,
              OmniwxWidgetData.skyCloudProfileBitmap(sky.cloudLow, sky.cloudMid, sky.cloudHigh),
            )
          }
        }
      }
    }
  }
}
