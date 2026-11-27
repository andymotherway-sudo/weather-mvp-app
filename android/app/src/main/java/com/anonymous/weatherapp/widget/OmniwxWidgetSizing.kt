package com.anonymous.weatherapp.widget

import android.appwidget.AppWidgetManager
import android.os.Bundle

enum class OmniwxWidgetSizeClass {
  COMPACT,
  STANDARD,
  EXPANDED,
}

/**
 * Uses launcher-provided dp bounds rather than assumed grid-cell pixels. The
 * thresholds preserve readable type by removing supporting data in compact
 * presentations instead of continuously shrinking every label.
 */
fun AppWidgetManager.omniwxWidgetSizeClass(appWidgetId: Int): OmniwxWidgetSizeClass {
  val options: Bundle = getAppWidgetOptions(appWidgetId)
  val width = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0)
  val height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0)
  return when {
    width >= 280 && height >= 180 -> OmniwxWidgetSizeClass.EXPANDED
    width < 190 || height < 120 -> OmniwxWidgetSizeClass.COMPACT
    else -> OmniwxWidgetSizeClass.STANDARD
  }
}
