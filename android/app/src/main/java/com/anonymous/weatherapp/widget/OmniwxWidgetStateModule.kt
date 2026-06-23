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

  @ReactMethod
  fun updateWeather(weather: ReadableMap, promise: Promise) {
    try {
      val placeMap = if (weather.hasKey("place") && !weather.isNull("place")) weather.getMap("place") else null
      val lat = placeMap?.let { readDouble(it, "lat") } ?: Double.NaN
      val lon = placeMap?.let { readDouble(it, "lon") } ?: Double.NaN
      if (!lat.isFinite() || !lon.isFinite()) {
        promise.reject("E_INVALID_WEATHER", "Widget weather must include finite place lat/lon.")
        return
      }

      val place = WidgetPlace(
        name = placeMap?.let { readString(it, "name") } ?: "OMNIwx location",
        lat = lat,
        lon = lon,
      )
      val snapshot = WidgetWeather(
        place = place,
        temperatureF = readDouble(weather, "temperatureF"),
        feelsLikeF = readDouble(weather, "feelsLikeF"),
        highF = readDouble(weather, "highF"),
        lowF = readDouble(weather, "lowF"),
        windMph = readDouble(weather, "windMph"),
        gustMph = readDouble(weather, "gustMph"),
        windDirectionDeg = readDouble(weather, "windDirectionDeg"),
        dewPointF = readDouble(weather, "dewPointF"),
        visibilityMiles = readDouble(weather, "visibilityMiles"),
        humidityPct = readDouble(weather, "humidityPct"),
        cloudPct = readDouble(weather, "cloudPct"),
        weatherCode = readDouble(weather, "weatherCode").takeIf { it.isFinite() }?.toInt() ?: -1,
        updatedLabel = readString(weather, "updatedLabel") ?: "App cache",
      )

      OmniwxWidgetData.saveWeatherSnapshot(reactContext, snapshot)
      OmniwxWidgetRefreshReceiver.refreshAll(reactContext, force = true)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("E_WIDGET_WEATHER", e)
    }
  }

  private fun readDouble(map: ReadableMap, key: String): Double {
    return if (map.hasKey(key) && !map.isNull(key)) {
      runCatching { map.getDouble(key) }.getOrDefault(Double.NaN)
    } else {
      Double.NaN
    }
  }

  private fun readString(map: ReadableMap, key: String): String? {
    return if (map.hasKey(key) && !map.isNull(key)) {
      map.getString(key)?.takeIf { it.isNotBlank() }
    } else {
      null
    }
  }
}
