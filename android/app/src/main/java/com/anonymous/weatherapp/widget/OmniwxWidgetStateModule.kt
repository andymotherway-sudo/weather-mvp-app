package com.anonymous.weatherapp.widget

import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import org.json.JSONObject

private const val WIDGET_STATE_PREFS = "omniwx_widget_data"
private const val ACTIVE_PLACE_JSON = "activePlaceJson"

@Suppress("DEPRECATION")
private fun widgetPrefs(context: Context) =
  context.getSharedPreferences(WIDGET_STATE_PREFS, Context.MODE_PRIVATE or Context.MODE_MULTI_PROCESS)

// Small native bridge so launcher widgets and Android Auto can read the current
// OMNIwx place from normal Android preferences instead of depending only on the
// React Native AsyncStorage SQLite implementation.
class OmniwxWidgetStateModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "OmniwxWidgetState"

  @ReactMethod
  fun updatePlace(place: ReadableMap, promise: Promise) {
    try {
      val lat = if (place.hasKey("lat")) place.getDouble("lat") else Double.NaN
      val lon = if (place.hasKey("lon")) place.getDouble("lon") else Double.NaN
      if (!lat.isFinite() || !lon.isFinite()) {
        promise.reject("E_INVALID_PLACE", "Widget place must include finite lat/lon.")
        return
      }

      val payload = JSONObject()
        .put("name", if (place.hasKey("name")) place.getString("name") ?: "OMNIwx location" else "OMNIwx location")
        .put("lat", lat)
        .put("lon", lon)
        .put("source", if (place.hasKey("source")) place.getString("source") ?: "app" else "app")
        .put("savedAtMs", System.currentTimeMillis())

      val saved = widgetPrefs(reactContext)
        .edit()
        .putString(ACTIVE_PLACE_JSON, payload.toString())
        .commit()

      promise.resolve(saved)
    } catch (e: Exception) {
      promise.reject("E_WIDGET_PLACE", e)
    }
  }
}
