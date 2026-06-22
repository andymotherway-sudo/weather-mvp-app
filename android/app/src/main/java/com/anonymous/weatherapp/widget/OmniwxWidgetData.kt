package com.anonymous.weatherapp.widget

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.location.Location
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import com.anonymous.weatherapp.MainActivity
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt
import org.json.JSONArray
import org.json.JSONObject

private const val PLACE_STORAGE_KEY = "omniwx.place.v2"
private const val LAST_COORDS_STORAGE_KEY = "omniwx:lastCoords:v1"
private const val DEFAULT_CITY_STORAGE_KEY = "omniwx:profile:defaultCity"
private const val AVIATION_WIDGET_SELECTION_KEY = "omniwx:widget:aviation:selected:v1"
private const val CLIMO_CACHE_PREFIX = "omniwx:climo:v8"
private const val RECORDS_CACHE_PREFIX = "omniwx:records:v10"
private const val SKY_SCORE_CACHE_PREFIX = "omniwx:skyScore:v1"
private const val OMNIWX_API_BASE = "https://omniwx-api.omniwx.workers.dev"
private const val WIDGET_WEATHER_CACHE_TTL_MS = 10L * 60L * 1000L
private const val WIDGET_DATA_PREFS = "omniwx_widget_data"
private const val LAST_WEATHER_JSON = "lastWeatherJson"
private const val LAST_WEATHER_ERROR = "lastWeatherError"
private const val ACTIVE_PLACE_JSON = "activePlaceJson"
private const val RAINVIEWER_TIMELINE_URL = "https://api.rainviewer.com/public/weather-maps.json"
private const val WIDGET_RADAR_CACHE_TTL_MS = 10L * 60L * 1000L

@Suppress("DEPRECATION")
private fun widgetPrefs(context: Context) =
  context.getSharedPreferences(WIDGET_DATA_PREFS, Context.MODE_PRIVATE or Context.MODE_MULTI_PROCESS)

/*
 * Shared data/rendering helper for all Android home-screen widgets.
 *
 * Important: widgets cannot render React Native components. Android launchers
 * only accept RemoteViews, which are built from native XML layouts plus simple
 * text/bitmap updates. This object is the bridge between OMNIwx app state and
 * those native widget layouts.
 *
 * What this file does:
 *   - Reads app state from React Native AsyncStorage's SQLite database.
 *   - Fetches small weather/aviation/climatology payloads when needed.
 *   - Converts cached app data into native widget models.
 *   - Draws custom bitmaps, such as weather icons, sky rings, radar snapshots,
 *     and climate arches, because RemoteViews cannot run our React components.
 */
data class WidgetPlace(
  val name: String,
  val lat: Double,
  val lon: Double,
)

data class WidgetWeather(
  val place: WidgetPlace,
  val temperatureF: Double,
  val feelsLikeF: Double,
  val highF: Double,
  val lowF: Double,
  val windMph: Double,
  val gustMph: Double,
  val windDirectionDeg: Double,
  val dewPointF: Double,
  val visibilityMiles: Double,
  val humidityPct: Double,
  val cloudPct: Double,
  val weatherCode: Int,
  val updatedLabel: String,
)

private data class CachedWidgetWeather(
  val key: String,
  val savedAtMs: Long,
  val weather: WidgetWeather,
)

data class WidgetSkyScore(
  val score: Int,
  val label: String,
  val bestWindow: String,
  val bortle: String,
  val cloudLow: String,
  val cloudMid: String,
  val cloudHigh: String,
  val clouds: String,
  val aurora: String,
)

private data class TilePoint(
  val x: Double,
  val y: Double,
)

private data class CachedRadarSnapshot(
  val key: String,
  val savedAtMs: Long,
  val bitmap: Bitmap,
)

data class WidgetMetar(
  val station: String,
  val stationName: String,
  val category: String,
  val wind: String,
  val visibility: String,
  val ceiling: String,
  val altimeter: String,
  val hazards: String,
  val updatedLabel: String,
)

private data class AirportCandidate(
  val id: String,
  val lat: Double,
  val lon: Double,
)

data class WidgetAviationBriefing(
  val title: String,
  val category: String,
  val secondary: String,
  val tertiary: String,
  val footer: String,
)

data class WidgetAirportBoard(
  val station: String,
  val stationName: String,
  val category: String,
  val statusTitle: String,
  val statusSummary: String,
  val wind: String,
  val visibility: String,
  val ceiling: String,
  val altimeter: String,
  val tafTrend: String,
  val footer: String,
)

data class WidgetRouteBriefing(
  val title: String,
  val category: String,
  val detail: String,
  val concern: String,
  val turbulence: String,
  val icing: String,
  val flightCategory: String,
  val sigmet: String,
  val cwa: String,
  val pirep: String,
  val footer: String,
)

data class WidgetClimatology(
  val place: WidgetPlace,
  val stationName: String,
  val normalHighF: Double?,
  val normalLowF: Double?,
  val normalPrecipIn: Double?,
  val annualPrecipIn: Double?,
  val monthlyHighsF: List<Double?> = emptyList(),
  val monthlyLowsF: List<Double?> = emptyList(),
  val recordHighF: Double?,
  val recordHighYear: Int?,
  val recordLowF: Double?,
  val recordLowYear: Int?,
  val recordPrecipIn: Double?,
  val recordPrecipYear: Int?,
  val updatedLabel: String,
)

private data class WidgetDailyRecords(
  val recordHighF: Double?,
  val recordHighYear: Int?,
  val recordLowF: Double?,
  val recordLowYear: Int?,
  val recordPrecipIn: Double?,
  val recordPrecipYear: Int?,
)

object OmniwxWidgetData {
  const val ACTION_REFRESH_WIDGETS = "com.anonymous.weatherapp.widget.REFRESH_WIDGETS"
  const val EXTRA_REFRESH_REASON = "com.anonymous.weatherapp.widget.REFRESH_REASON"
  const val REFRESH_REASON_MANUAL = "manual"

  private var weatherCache: CachedWidgetWeather? = null
  private var radarSnapshotCache: CachedRadarSnapshot? = null

  fun openIntent(context: Context, route: String): PendingIntent {
    // Widgets open the real Expo Router screen through the app's weatherapp://
    // deep-link scheme. Keep route names aligned with actual routes or Android
    // will launch the app into Expo Router's "Unmatched Route" screen.
    val cleanRoute = if (route.startsWith("/")) route else "/$route"
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("weatherapp://$cleanRoute"), context, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
      setPackage(context.packageName)
    }
    return PendingIntent.getActivity(
      context,
      route.hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  fun refreshIntent(context: Context): PendingIntent {
    // All refresh buttons fan into one BroadcastReceiver, which then asks every
    // installed OMNIwx widget provider to update itself.
    val intent = Intent(context, OmniwxWidgetRefreshReceiver::class.java).apply {
      action = ACTION_REFRESH_WIDGETS
      putExtra(EXTRA_REFRESH_REASON, REFRESH_REASON_MANUAL)
      setPackage(context.packageName)
    }
    return PendingIntent.getBroadcast(
      context,
      ACTION_REFRESH_WIDGETS.hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  fun readPlace(context: Context): WidgetPlace? {
    readMirroredWidgetPlace(context)?.let { return it }

    // Prefer the active place written by PlaceContext. If the active place is
    // "Current Location", refresh it from the newest cheap background source
    // available, then fall back to the app's default city.
    readAsyncStorageValue(context, PLACE_STORAGE_KEY)?.let { raw ->
      runCatching {
        val root = JSONObject(raw)
        val active = root.optJSONObject("active")
        if (active != null) {
          if (active.optString("source", "") == "gps") {
            return currentPlace(context, placeFromJson(active)) ?: placeFromJson(active)
          }
          return placeFromJson(active)
        }
        val favorites = root.optJSONArray("favorites")
        if (favorites != null) {
          for (i in 0 until favorites.length()) {
            favorites.optJSONObject(i)?.let { favorite ->
              placeFromJson(favorite)?.let { return it }
            }
          }
        }
      }
    }

    currentPlace(context, null)?.let { return it }

    readAsyncStorageValue(context, DEFAULT_CITY_STORAGE_KEY)?.let { raw ->
      runCatching {
        return placeFromJson(JSONObject(raw))
      }
    }

    return null
  }

  private fun readMirroredWidgetPlace(context: Context): WidgetPlace? {
    val raw = widgetPrefs(context).getString(ACTIVE_PLACE_JSON, null)
      ?: return null
    return runCatching {
      val root = JSONObject(raw)
      val savedAtMs = root.optLong("savedAtMs", 0L)
      if (savedAtMs > 0L && System.currentTimeMillis() - savedAtMs > 30L * 24L * 60L * 60L * 1000L) {
        return@runCatching null
      }
      placeFromJson(root)
    }.getOrNull()
  }

  @Synchronized
  fun fetchWeather(context: Context, place: WidgetPlace): WidgetWeather {
    val cacheKey = weatherCacheKey(place)
    val now = System.currentTimeMillis()
    weatherCache
      ?.takeIf { it.key == cacheKey && now - it.savedAtMs in 0..WIDGET_WEATHER_CACHE_TTL_MS }
      ?.let { return it.weather }

    val weather = try {
      fetchWeatherFresh(place).also {
        saveCachedWidgetWeather(context, it)
        saveLastWeatherError(context, null)
      }
    } catch (e: Exception) {
      readCachedWidgetWeather(context, place)?.also {
        weatherCache = CachedWidgetWeather(cacheKey, now, it)
        saveLastWeatherError(context, "Using cached weather after ${e.shortWidgetMessage()}")
      } ?: run {
        saveLastWeatherError(context, e.shortWidgetMessage())
        throw e
      }
    }
    weatherCache = CachedWidgetWeather(cacheKey, now, weather)
    return weather
  }

  fun lastWeatherError(context: Context): String? {
    return widgetPrefs(context).getString(LAST_WEATHER_ERROR, null)
      ?.takeIf { it.isNotBlank() }
  }

  private fun fetchWeatherFresh(place: WidgetPlace): WidgetWeather {
    var directError: Throwable? = null
    runCatching { fetchWeatherFromOpenMeteo(place) }
      .onSuccess { return it }
      .onFailure { directError = it }

    runCatching { fetchWeatherFromOmniwxWorker(place) }
      .onSuccess { return it }
      .onFailure { workerError ->
        val directMessage = directError?.shortWidgetMessage() ?: "Open-Meteo failed"
        throw IllegalStateException("$directMessage; worker ${workerError.shortWidgetMessage()}")
      }

    throw directError ?: IllegalStateException("Weather unavailable")
  }

  private fun fetchWeatherFromOpenMeteo(place: WidgetPlace): WidgetWeather {
    // Compact one-day Open-Meteo request used by current/radar/sky widgets.
    // The full phone app can fetch richer data; widgets should stay cheap.
    val url =
      "https://api.open-meteo.com/v1/forecast" +
        "?latitude=${place.lat}" +
        "&longitude=${place.lon}" +
        "&current=temperature_2m,apparent_temperature,dew_point_2m,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,visibility,relative_humidity_2m,cloud_cover" +
        "&daily=weather_code,temperature_2m_max,temperature_2m_min" +
        "&temperature_unit=fahrenheit" +
        "&wind_speed_unit=mph" +
        "&timezone=auto" +
        "&forecast_days=1"

    val root = fetchJsonObject(url, "OMNIwx Alpha Android Widget")
    val current = root.getJSONObject("current")
    val daily = root.optJSONObject("daily")

    return WidgetWeather(
      place = place,
      temperatureF = current.optDouble("temperature_2m", Double.NaN),
      feelsLikeF = current.optDouble("apparent_temperature", Double.NaN),
      highF = daily?.optJSONArray("temperature_2m_max")?.optDouble(0, Double.NaN) ?: Double.NaN,
      lowF = daily?.optJSONArray("temperature_2m_min")?.optDouble(0, Double.NaN) ?: Double.NaN,
      windMph = current.optDouble("wind_speed_10m", Double.NaN),
      gustMph = current.optDouble("wind_gusts_10m", Double.NaN),
      windDirectionDeg = current.optDouble("wind_direction_10m", Double.NaN),
      dewPointF = current.optDouble("dew_point_2m", Double.NaN),
      visibilityMiles = metersToMiles(current.optDouble("visibility", Double.NaN)),
      humidityPct = current.optDouble("relative_humidity_2m", Double.NaN),
      cloudPct = current.optDouble("cloud_cover", Double.NaN),
      weatherCode = current.optInt("weather_code", -1),
      updatedLabel = nowLabel(),
    )
  }

  private fun fetchWeatherFromOmniwxWorker(place: WidgetPlace): WidgetWeather {
    val url =
      "$OMNIWX_API_BASE/api/current" +
        "?lat=${place.lat}" +
        "&lon=${place.lon}" +
        "&units=imperial"

    val root = fetchJsonObject(url, "OMNIwx Alpha Android Widget")
    if (!root.optBoolean("ok", false)) {
      throw IllegalStateException(root.optString("error", "worker current failed"))
    }

    return WidgetWeather(
      place = place,
      temperatureF = root.optDouble("temp", Double.NaN),
      feelsLikeF = root.optDouble("feels", Double.NaN),
      highF = Double.NaN,
      lowF = Double.NaN,
      windMph = root.optDouble("wind", Double.NaN),
      gustMph = root.optDouble("windGust", Double.NaN),
      windDirectionDeg = root.optDouble("windDir", Double.NaN),
      dewPointF = root.optDouble("dewPoint", Double.NaN),
      visibilityMiles = Double.NaN,
      humidityPct = root.optDouble("humidityPct", Double.NaN),
      cloudPct = root.optDouble("cloudCoverPct", Double.NaN),
      weatherCode = root.optInt("weatherCode", -1),
      updatedLabel = nowLabel(),
    )
  }

  private fun saveCachedWidgetWeather(context: Context, weather: WidgetWeather) {
    val payload = JSONObject()
      .put("key", weatherCacheKey(weather.place))
      .put("savedAtMs", System.currentTimeMillis())
      .put("place", JSONObject().put("name", weather.place.name).put("lat", weather.place.lat).put("lon", weather.place.lon))
      .put("temperatureF", weather.temperatureF)
      .put("feelsLikeF", weather.feelsLikeF)
      .put("highF", weather.highF)
      .put("lowF", weather.lowF)
      .put("windMph", weather.windMph)
      .put("gustMph", weather.gustMph)
      .put("windDirectionDeg", weather.windDirectionDeg)
      .put("dewPointF", weather.dewPointF)
      .put("visibilityMiles", weather.visibilityMiles)
      .put("humidityPct", weather.humidityPct)
      .put("cloudPct", weather.cloudPct)
      .put("weatherCode", weather.weatherCode)
      .put("updatedLabel", weather.updatedLabel)

    widgetPrefs(context)
      .edit()
      .putString(LAST_WEATHER_JSON, payload.toString())
      .commit()
  }

  private fun saveLastWeatherError(context: Context, message: String?) {
    val editor = widgetPrefs(context).edit()
    if (message.isNullOrBlank()) {
      editor.remove(LAST_WEATHER_ERROR)
    } else {
      editor.putString(LAST_WEATHER_ERROR, message.take(96))
    }
    editor.commit()
  }

  private fun readCachedWidgetWeather(context: Context, place: WidgetPlace): WidgetWeather? {
    val raw = widgetPrefs(context).getString(LAST_WEATHER_JSON, null)
      ?: return null
    return runCatching {
      val root = JSONObject(raw)
      if (root.optString("key") != weatherCacheKey(place)) return@runCatching null
      val savedAtMs = root.optLong("savedAtMs", 0L)
      if (savedAtMs <= 0L || System.currentTimeMillis() - savedAtMs > 6L * 60L * 60L * 1000L) return@runCatching null
      val cachedPlace = root.optJSONObject("place")?.let { placeFromJson(it) } ?: place
      WidgetWeather(
        place = cachedPlace,
        temperatureF = root.optDouble("temperatureF", Double.NaN),
        feelsLikeF = root.optDouble("feelsLikeF", Double.NaN),
        highF = root.optDouble("highF", Double.NaN),
        lowF = root.optDouble("lowF", Double.NaN),
        windMph = root.optDouble("windMph", Double.NaN),
        gustMph = root.optDouble("gustMph", Double.NaN),
        windDirectionDeg = root.optDouble("windDirectionDeg", Double.NaN),
        dewPointF = root.optDouble("dewPointF", Double.NaN),
        visibilityMiles = root.optDouble("visibilityMiles", Double.NaN),
        humidityPct = root.optDouble("humidityPct", Double.NaN),
        cloudPct = root.optDouble("cloudPct", Double.NaN),
        weatherCode = root.optInt("weatherCode", -1),
        updatedLabel = root.optString("updatedLabel", "recent cache"),
      )
    }.getOrNull()
  }

  fun skyScore(weather: WidgetWeather): WidgetSkyScore {
    // Fallback-only Sky Score. Prefer fetchSkyScore(), which reads the canonical
    // app cache. This keeps the widget useful before the Space tab has refreshed.
    var score = 86
    score -= when (weather.weatherCode) {
      0 -> 0
      1, 2 -> 8
      3 -> 20
      45, 48 -> 30
      51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82 -> 34
      71, 73, 75, 77, 85, 86 -> 38
      95, 96, 99 -> 45
      else -> 12
    }
    if (weather.cloudPct.isFinite()) score -= (weather.cloudPct * 0.42).roundToInt()
    if (weather.humidityPct.isFinite() && weather.humidityPct > 70) score -= ((weather.humidityPct - 70) * 0.3).roundToInt()
    if (weather.visibilityMiles.isFinite() && weather.visibilityMiles < 10) score -= ((10 - weather.visibilityMiles) * 2.2).roundToInt()
    if (weather.gustMph.isFinite() && weather.gustMph > 18) score -= ((weather.gustMph - 18) * 0.7).roundToInt()
    val clamped = score.coerceIn(0, 100)
    val label = when {
      clamped >= 90 -> "Excellent"
      clamped >= 80 -> "Very Good"
      clamped >= 65 -> "Good"
      clamped >= 45 -> "Fair"
      else -> "Poor"
    }
    val bestWindow = if (clamped >= 65) "Best window 9 PM-12 AM" else "Best window limited tonight"
    return WidgetSkyScore(
      score = clamped,
      label = label,
      bestWindow = bestWindow,
      bortle = "Bortle unavailable",
      cloudLow = "--",
      cloudMid = "--",
      cloudHigh = "${weather.cloudPct.roundLabel()}%",
      clouds = "Clouds ${weather.cloudPct.roundLabel()}%",
      aurora = "Aurora unavailable",
    )
  }

  fun fetchSkyScore(context: Context): WidgetSkyScore? {
    // Best path: read the Sky Score cache produced by the React Native Space
    // screen. Fallback path: call the worker's astro inspect endpoint so a new
    // widget can still populate before the user opens Space.
    val place = readPlace(context) ?: return null
    readSkyScoreCache(context, place)?.let { return it }
    val url = "$OMNIWX_API_BASE/api/astro/inspect?lat=${place.lat}&lon=${place.lon}&hour=0"
    val root = fetchJsonObject(url, "OMNIwx Alpha Android Widget")
    return skyScoreFromInspectJson(root)?.copy(aurora = "Updated ${nowLabel()}")
  }

  fun fetchNearestMetar(place: WidgetPlace): WidgetMetar? {
    // AviationWeather's bbox search can miss sparse areas, so expand outward in
    // steps and stop as soon as we get a usable nearest METAR.
    val deltas = listOf(0.75, 1.5, 3.0)
    for (delta in deltas) {
      val bbox = "${place.lon - delta},${place.lat - delta},${place.lon + delta},${place.lat + delta}"
      val url = "https://aviationweather.gov/api/data/metar?format=json&hours=2&bbox=$bbox"
      val array = runCatching { fetchJsonArray(url, "OMNIwx Alpha Android Widget") }.getOrNull() ?: continue
      val nearest = nearestMetarJson(place, array) ?: continue
      return metarFromJson(nearest)
    }
    return null
  }

  fun fetchAviationBriefing(context: Context): WidgetAviationBriefing? {
    // Legacy/general aviation widget: show either the saved route snapshot or a
    // nearby/selected airport. The newer dedicated widgets below split airport
    // board and route briefing into separate surfaces.
    val selection = readAsyncStorageValue(context, AVIATION_WIDGET_SELECTION_KEY)?.let { raw ->
      runCatching { JSONObject(raw) }.getOrNull()
    }

    if (selection?.optString("type") == "route") {
      val ageMs = System.currentTimeMillis() - selection.optLong("savedAt", 0L)
      if (ageMs in 0..(6L * 60L * 60L * 1000L)) {
        return WidgetAviationBriefing(
          title = selection.optString("title", "Route Briefing").ifBlank { "Route Briefing" },
          category = selection.optString("category", "--").ifBlank { "--" },
          secondary = selection.optString("summary", "Route weather snapshot").ifBlank { "Route weather snapshot" },
          tertiary = selection.optString("hazards", "No matched route advisories").ifBlank { "No matched route advisories" },
          footer = "Saved ${nowLabel()}. Situational awareness only.",
        )
      }
    }

    val selectedStation = selection
      ?.takeIf { it.optString("type") == "airport" }
      ?.optString("station", "")
      ?.trim()
      ?.uppercase(Locale.US)
      ?.takeIf { it.isNotBlank() }

    val metar = selectedStation
      ?.let { runCatching { fetchMetarForStation(it) }.getOrNull() }
      ?: readPlace(context)?.let { runCatching { fetchNearestMetar(it) }.getOrNull() }
      ?: readPlace(context)?.let { runCatching { fetchNearestCandidateMetar(it) }.getOrNull() }
      ?: return null

    return WidgetAviationBriefing(
      title = metar.station,
      category = metar.category,
      secondary = "${metar.wind} / ${metar.visibility}",
      tertiary = metar.ceiling,
      footer = "${metar.hazards}. ${metar.updatedLabel}",
    )
  }

  fun fetchAirportBoard(context: Context): WidgetAirportBoard? {
    // Airport Board widget answers: "What is my selected/home field doing now?"
    // It prefers the explicitly selected airport, then falls back to nearby
    // METAR discovery for the active OMNIwx place.
    val selection = readAviationSelection(context)
    val selectedStation = selection
      ?.takeIf { it.optString("type") == "airport" }
      ?.optString("station", "")
      ?.trim()
      ?.uppercase(Locale.US)
      ?.takeIf { it.isNotBlank() }
    val selectedName = selection
      ?.takeIf { it.optString("type") == "airport" }
      ?.optString("name", "")
      ?.ifBlank { null }

    val metar = selectedStation
      ?.let { runCatching { fetchMetarForStation(it) }.getOrNull() }
      ?: readPlace(context)?.let { runCatching { fetchNearestMetar(it) }.getOrNull() }
      ?: readPlace(context)?.let { runCatching { fetchNearestCandidateMetar(it) }.getOrNull() }
      ?: return null

    val taf = runCatching { fetchTafText(metar.station) }.getOrNull()
    val statusTitle = airportStatusTitle(metar.category, metar.hazards)
    return WidgetAirportBoard(
      station = metar.station,
      stationName = selectedName ?: metar.stationName.ifBlank { "Selected airport" },
      category = metar.category.ifBlank { "--" },
      statusTitle = statusTitle,
      statusSummary = airportStatusSummary(metar),
      wind = metar.wind,
      visibility = metar.visibility,
      ceiling = metar.ceiling.removePrefix("Ceiling "),
      altimeter = metar.altimeter,
      tafTrend = tafTrendLabel(taf),
      footer = "METAR ${metar.updatedLabel}. Situational awareness only.",
    )
  }

  fun fetchRouteBriefing(context: Context): WidgetRouteBriefing? {
    // Route widget is intentionally cache-based. Full route analysis is a phone
    // app workflow; the widget shows the last saved route snapshot if it is
    // recent enough to be meaningful.
    val selection = readAviationSelection(context)?.takeIf { it.optString("type") == "route" } ?: return null
    val ageMs = System.currentTimeMillis() - selection.optLong("savedAt", 0L)
    if (ageMs !in 0..(6L * 60L * 60L * 1000L)) return null
    val counts = selection.optJSONObject("counts")
    val hazardText = selection.optString("hazards", "").ifBlank { "No matched route advisories" }
    val altitude = selection.optNullableDouble("altitudeFt")?.let { formatAltitudeFt(it) }
    val depart = selection.optString("departureIso", "").ifBlank { null }?.let { utcShortLabel(it) }
    val detail = listOfNotNull(altitude, depart?.let { "depart $it" }).joinToString(" / ").ifBlank { "Saved route" }
    return WidgetRouteBriefing(
      title = selection.optString("title", "Route Briefing").ifBlank { "Route Briefing" },
      category = selection.optString("category", "--").ifBlank { "--" },
      detail = detail,
      concern = selection.optString("summary", "").ifBlank { hazardText },
      turbulence = countLabel(counts, "turbulence", hazardText, "turbulence"),
      icing = countLabel(counts, "icing", hazardText, "icing"),
      flightCategory = selection.optString("flightCategory", "").ifBlank { "VFR" },
      sigmet = countLabel(counts, "sigmet", hazardText, "SIGMET"),
      cwa = countLabel(counts, "cwa", hazardText, "CWA"),
      pirep = countLabel(counts, "pirep", hazardText, "PIREP"),
      footer = "Saved ${nowLabel()}. Situational awareness only.",
    )
  }

  fun fetchMetarForStation(station: String): WidgetMetar? {
    val normalized = station.trim().uppercase(Locale.US)
    if (normalized.isBlank()) return null
    val url = "https://aviationweather.gov/api/data/metar?format=json&hours=2&ids=$normalized"
    val array = fetchJsonArray(url, "OMNIwx Alpha Android Widget")
    if (array.length() == 0) return null
    return metarFromJson(array.optJSONObject(0) ?: return null)
  }

  fun fetchTafText(station: String): String? {
    val normalized = station.trim().uppercase(Locale.US)
    if (normalized.isBlank()) return null
    val url = "https://aviationweather.gov/api/data/taf?format=json&hours=8&ids=$normalized"
    val array = fetchJsonArray(url, "OMNIwx Alpha Android Widget")
    val item = array.optJSONObject(0) ?: return null
    return item.optString("rawTAF", "").ifBlank { item.optString("raw_text", "").ifBlank { item.optString("raw", "") } }.ifBlank { null }
  }

  fun fetchNearestCandidateMetar(place: WidgetPlace): WidgetMetar? {
    // Last-resort airport lookup for the Southwest-heavy alpha use case. This
    // prevents a totally blank aviation widget if bbox search fails around Mesa.
    // Long term, replace with a broader airport index.
    val candidates = listOf(
      AirportCandidate("KFFZ", 33.4659, -111.7212),
      AirportCandidate("KIWA", 33.3008, -111.6437),
      AirportCandidate("KPHX", 33.4278, -112.0037),
      AirportCandidate("KDVT", 33.6883, -112.0825),
      AirportCandidate("KSDL", 33.6229, -111.9105),
      AirportCandidate("KTUS", 32.1315, -110.9564),
      AirportCandidate("KFLG", 35.1385, -111.6712),
      AirportCandidate("KLAS", 36.0801, -115.1522),
      AirportCandidate("KDEN", 39.8617, -104.6731),
      AirportCandidate("KSLC", 40.7884, -111.9778),
      AirportCandidate("KABQ", 35.0402, -106.6092),
      AirportCandidate("KLAX", 33.9425, -118.4081),
      AirportCandidate("KSFO", 37.6190, -122.3750),
      AirportCandidate("KSEA", 47.4502, -122.3088)
    ).sortedBy { haversineMiles(place.lat, place.lon, it.lat, it.lon) }

    val ids = candidates.take(4).joinToString(",") { it.id }
    val url = "https://aviationweather.gov/api/data/metar?format=json&hours=2&ids=$ids"
    val array = fetchJsonArray(url, "OMNIwx Alpha Android Widget")
    if (array.length() == 0) return null
    val nearest = nearestMetarJson(place, array) ?: array.optJSONObject(0) ?: return null
    return metarFromJson(nearest)
  }

  fun fetchClimatology(context: Context): WidgetClimatology? {
    // Climatology widgets should mostly use app-generated caches so they do not
    // hammer NOAA/worker endpoints from the launcher. If no cache exists, fetch
    // a compact fallback from the worker.
    val place = readPlace(context) ?: return null
    val records = readTodayRecordsCache(context)
    val cached = readClimoCache(context, place)
    if (cached != null) return cached.withRecords(records)

    val url = "$OMNIWX_API_BASE/api/almanac/climo?lat=${place.lat}&lon=${place.lon}"
    val root = fetchJsonObject(url, "OMNIwx Alpha Android Widget")
    return climoFromJson(place, root)?.withRecords(records)
  }

  fun weatherIconBitmap(code: Int): Bitmap {
    // RemoteViews cannot use React Native/SVG weather icons, so we draw simple
    // native bitmap equivalents that match the dark-glass widget style.
    val bitmap = Bitmap.createBitmap(128, 128, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val cloudPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(241, 245, 249)
      style = Paint.Style.FILL
    }
    val accentPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = weatherIconColor(code)
      style = Paint.Style.FILL
    }
    val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = weatherIconColor(code)
      style = Paint.Style.STROKE
      strokeWidth = 7f
      strokeCap = Paint.Cap.ROUND
    }

    when (code) {
      0 -> drawSun(canvas, 64f, 64f, 22f, accentPaint, linePaint)
      1, 2 -> {
        drawSun(canvas, 49f, 47f, 18f, accentPaint, linePaint)
        drawCloud(canvas, cloudPaint, 0f)
      }
      3 -> drawCloud(canvas, cloudPaint, 0f)
      45, 48 -> {
        drawCloud(canvas, cloudPaint, -7f)
        listOf(78f, 92f, 106f).forEach { y -> canvas.drawLine(25f, y, 103f, y, linePaint) }
      }
      51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82 -> {
        drawCloud(canvas, cloudPaint, -8f)
        listOf(43f, 64f, 85f).forEach { x -> canvas.drawLine(x, 79f, x - 9f, 106f, linePaint) }
      }
      71, 73, 75, 77, 85, 86 -> {
        drawCloud(canvas, cloudPaint, -8f)
        listOf(43f, 64f, 85f).forEach { x -> canvas.drawCircle(x, 98f, 5f, accentPaint) }
      }
      95, 96, 99 -> {
        drawCloud(canvas, cloudPaint, -10f)
        val bolt = android.graphics.Path().apply {
          moveTo(68f, 72f)
          lineTo(51f, 103f)
          lineTo(67f, 98f)
          lineTo(57f, 121f)
          lineTo(82f, 88f)
          lineTo(66f, 93f)
          close()
        }
        canvas.drawPath(bolt, accentPaint)
      }
      else -> {
        val halo = Paint(Paint.ANTI_ALIAS_FLAG).apply {
          color = Color.rgb(34, 211, 238)
          alpha = 70
          style = Paint.Style.FILL
        }
        canvas.drawCircle(64f, 64f, 34f, halo)
        canvas.drawCircle(64f, 64f, 21f, accentPaint)
      }
    }
    return bitmap
  }

  fun skyScoreRingBitmap(score: Int?): Bitmap {
    // Draw a reusable circular progress ring for Sky Score widgets. RemoteViews
    // can display the resulting Bitmap but cannot animate/draw this itself.
    val bitmap = Bitmap.createBitmap(184, 184, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val base = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(15, 23, 42)
      style = Paint.Style.STROKE
      strokeWidth = 15f
      strokeCap = Paint.Cap.ROUND
    }
    val glow = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(34, 211, 238)
      alpha = 62
      style = Paint.Style.STROKE
      strokeWidth = 23f
      strokeCap = Paint.Cap.ROUND
    }
    val arc = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = skyScoreColor(score ?: 0)
      style = Paint.Style.STROKE
      strokeWidth = 16f
      strokeCap = Paint.Cap.ROUND
    }
    val rect = RectF(22f, 22f, 162f, 162f)
    canvas.drawArc(rect, -90f, 360f, false, base)
    if (score != null) {
      val sweep = (score.coerceIn(0, 100) / 100f) * 360f
      canvas.drawArc(rect, -90f, sweep, false, glow)
      canvas.drawArc(rect, -90f, sweep, false, arc)
    }
    return bitmap
  }

  fun climateArchBitmap(climo: WidgetClimatology?): Bitmap {
    // Compact climate arch for medium widgets: high line, low line, and the
    // normal temperature range band. The large 4x4 widget uses the richer
    // climateArchLargeBitmap() below.
    val bitmap = Bitmap.createBitmap(520, 104, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val grid = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(37, 99, 235)
      alpha = 72
      style = Paint.Style.STROKE
      strokeWidth = 1.5f
    }
    val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(14, 165, 233)
      alpha = 42
      style = Paint.Style.FILL
    }
    val highPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(251, 113, 133)
      style = Paint.Style.STROKE
      strokeWidth = 4.5f
      strokeCap = Paint.Cap.ROUND
      strokeJoin = Paint.Join.ROUND
    }
    val lowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(96, 165, 250)
      style = Paint.Style.STROKE
      strokeWidth = 4.5f
      strokeCap = Paint.Cap.ROUND
      strokeJoin = Paint.Join.ROUND
    }

    canvas.drawRoundRect(RectF(4f, 8f, 516f, 98f), 18f, 18f, grid)
    for (i in 1..3) {
      val y = 8f + (90f / 4f) * i
      canvas.drawLine(18f, y, 502f, y, grid)
    }

    val highs = climo?.monthlyHighsF?.takeIf { it.size >= 12 } ?: emptyList()
    val lows = climo?.monthlyLowsF?.takeIf { it.size >= 12 } ?: emptyList()
    val values = (highs + lows).mapNotNull { it?.takeIf { value -> value.isFinite() } }
    if (values.size < 4) return bitmap
    val min = (values.minOrNull() ?: 0.0) - 5.0
    val max = (values.maxOrNull() ?: 100.0) + 5.0
    fun x(index: Int) = 28f + (464f / 11f) * index
    fun y(value: Double): Float {
      val pct = ((value - min) / (max - min)).coerceIn(0.0, 1.0)
      return (88f - pct * 68f).toFloat()
    }

    val highPath = android.graphics.Path()
    val lowPath = android.graphics.Path()
    for (idx in 0 until 12) {
      val hi = highs.getOrNull(idx)
      val lo = lows.getOrNull(idx)
      if (hi != null && hi.isFinite()) {
        if (idx == 0) highPath.moveTo(x(idx), y(hi)) else highPath.lineTo(x(idx), y(hi))
      }
      if (lo != null && lo.isFinite()) {
        if (idx == 0) lowPath.moveTo(x(idx), y(lo)) else lowPath.lineTo(x(idx), y(lo))
      }
    }
    val bandPath = android.graphics.Path(highPath).apply {
      for (idx in 11 downTo 0) {
        val lo = lows.getOrNull(idx)
        if (lo != null && lo.isFinite()) lineTo(x(idx), y(lo))
      }
      close()
    }
    canvas.drawPath(bandPath, fill)
    canvas.drawPath(highPath, highPaint)
    canvas.drawPath(lowPath, lowPaint)
    return bitmap
  }

  fun climateArchLargeBitmap(climo: WidgetClimatology?): Bitmap {
    // Large 4x4 climate widget chart. This is deliberately drawn as a bitmap so
    // Android launchers can render it without running React Native or Skia.
    val bitmap = Bitmap.createBitmap(960, 520, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val plot = RectF(78f, 38f, 918f, 430f)
    val grid = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(71, 85, 105)
      alpha = 110
      style = Paint.Style.STROKE
      strokeWidth = 2f
    }
    val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(203, 213, 225)
      textSize = 25f
      typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
    }
    val mutedText = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(148, 163, 184)
      textSize = 21f
      typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
    }
    val bandPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(226, 232, 240)
      alpha = 115
      style = Paint.Style.FILL
    }
    val highPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(251, 113, 133)
      style = Paint.Style.STROKE
      strokeWidth = 7f
      strokeCap = Paint.Cap.ROUND
      strokeJoin = Paint.Join.ROUND
    }
    val lowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(96, 165, 250)
      style = Paint.Style.STROKE
      strokeWidth = 7f
      strokeCap = Paint.Cap.ROUND
      strokeJoin = Paint.Join.ROUND
    }
    val todayPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(125, 211, 252)
      alpha = 185
      style = Paint.Style.STROKE
      strokeWidth = 3f
    }
    val todayDot = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(125, 211, 252)
      style = Paint.Style.FILL
    }

    canvas.drawRoundRect(RectF(8f, 8f, 952f, 512f), 30f, 30f, grid)
    val highs = climo?.monthlyHighsF?.takeIf { it.size >= 12 } ?: emptyList()
    val lows = climo?.monthlyLowsF?.takeIf { it.size >= 12 } ?: emptyList()
    val values = (highs + lows).mapNotNull { it?.takeIf { value -> value.isFinite() } }
    if (values.size < 4) {
      canvas.drawText("Open OMNIwx to load climate normals", 84f, 250f, text)
      return bitmap
    }

    val minValue = ((values.minOrNull() ?: 0.0) - 8.0).coerceAtMost(20.0)
    val maxValue = ((values.maxOrNull() ?: 100.0) + 8.0).coerceAtLeast(100.0)
    fun x(index: Int) = plot.left + (plot.width() / 11f) * index
    fun y(value: Double): Float {
      val pct = ((value - minValue) / (maxValue - minValue)).coerceIn(0.0, 1.0)
      return (plot.bottom - pct * plot.height()).toFloat()
    }

    val gridValues = listOf(maxValue, (maxValue + minValue) / 2.0, minValue)
    gridValues.forEach { value ->
      val yy = y(value)
      canvas.drawLine(plot.left, yy, plot.right, yy, grid)
      canvas.drawText(value.roundToInt().toString(), 28f, yy + 8f, mutedText)
    }

    val highPath = android.graphics.Path()
    val lowPath = android.graphics.Path()
    for (idx in 0 until 12) {
      val hi = highs.getOrNull(idx)
      val lo = lows.getOrNull(idx)
      if (hi != null && hi.isFinite()) {
        if (idx == 0) highPath.moveTo(x(idx), y(hi)) else highPath.lineTo(x(idx), y(hi))
      }
      if (lo != null && lo.isFinite()) {
        if (idx == 0) lowPath.moveTo(x(idx), y(lo)) else lowPath.lineTo(x(idx), y(lo))
      }
    }
    val bandPath = android.graphics.Path(highPath).apply {
      for (idx in 11 downTo 0) {
        val lo = lows.getOrNull(idx)
        if (lo != null && lo.isFinite()) lineTo(x(idx), y(lo))
      }
      close()
    }
    canvas.drawPath(bandPath, bandPaint)
    canvas.drawPath(highPath, highPaint)
    canvas.drawPath(lowPath, lowPaint)

    val monthLabels = listOf("J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D")
    monthLabels.forEachIndexed { idx, label ->
      canvas.drawText(label, x(idx) - 7f, 480f, mutedText)
    }

    val cal = Calendar.getInstance()
    val month = cal.get(Calendar.MONTH)
    val day = cal.get(Calendar.DAY_OF_MONTH)
    val maxDay = cal.getActualMaximum(Calendar.DAY_OF_MONTH).coerceAtLeast(1)
    val todayX = x(month.coerceIn(0, 11)) + ((day - 1).toFloat() / maxDay.toFloat()) * (plot.width() / 11f)
    canvas.drawLine(todayX, plot.top, todayX, plot.bottom, todayPaint)
    canvas.drawCircle(todayX, plot.top + 28f, 10f, todayDot)
    canvas.drawText("Today", todayX + 14f, plot.top + 36f, text)
    return bitmap
  }

  fun climateVarianceLabel(climo: WidgetClimatology?): String {
    // A quick human label for climate volatility: Minneapolis-like climates show
    // a bigger spread than maritime or low-variance coastal locations.
    val highs = climo?.monthlyHighsF.orEmpty().mapNotNull { it?.takeIf { value -> value.isFinite() } }
    val lows = climo?.monthlyLowsF.orEmpty().mapNotNull { it?.takeIf { value -> value.isFinite() } }
    if (highs.isEmpty() || lows.isEmpty()) return "Seasonal range --"
    val winterLow = lows.minOrNull() ?: return "Seasonal range --"
    val summerHigh = highs.maxOrNull() ?: return "Seasonal range --"
    return "Seasonal spread ${(summerHigh - winterLow).roundToInt()}°"
  }

  fun radarSnapshotBitmap(place: WidgetPlace?, weather: WidgetWeather?): Bitmap {
    if (place != null) {
      val key = "${String.format(Locale.US, "%.2f", place.lat)},${String.format(Locale.US, "%.2f", place.lon)}"
      val now = System.currentTimeMillis()
      radarSnapshotCache
        ?.takeIf { it.key == key && now - it.savedAtMs in 0..WIDGET_RADAR_CACHE_TTL_MS && !it.bitmap.isRecycled }
        ?.let { return it.bitmap }

      fetchRadarTileComposite(place, weather)?.let { live ->
        radarSnapshotCache = CachedRadarSnapshot(key, now, live)
        return live
      }
    }

    // Keep launcher updates cheap. Live tile composites can require dozens of
    // network bitmap decodes during a widget refresh, which can make the
    // foreground app feel sluggish on some devices.
    val bitmap = Bitmap.createBitmap(720, 360, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val bg = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(5, 17, 36)
      style = Paint.Style.FILL
    }
    canvas.drawRect(0f, 0f, 720f, 360f, bg)
    val grid = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(56, 189, 248)
      alpha = 38
      strokeWidth = 2f
    }
    for (x in 0..720 step 72) canvas.drawLine(x.toFloat(), 0f, x.toFloat(), 360f, grid)
    for (y in 0..360 step 60) canvas.drawLine(0f, y.toFloat(), 720f, y.toFloat(), grid)
    val precipCode = weather?.weatherCode ?: -1
    val activePrecip = precipCode in listOf(51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99)
    if (activePrecip) {
      val colors = listOf(Color.rgb(34, 197, 94), Color.rgb(234, 179, 8), Color.rgb(249, 115, 22), Color.rgb(239, 68, 68))
      colors.forEachIndexed { idx, color ->
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply {
          this.color = color
          alpha = 160 - idx * 18
          style = Paint.Style.FILL
        }
        canvas.drawOval(RectF(420f + idx * 18f, 72f + idx * 18f, 650f - idx * 8f, 260f - idx * 2f), p)
      }
    }
    drawRadarWidgetOverlays(canvas, place?.name ?: "OMNIwx", weather, hasLiveTiles = false)
    return bitmap
  }

  private fun fetchRadarTileComposite(place: WidgetPlace, weather: WidgetWeather?): Bitmap? {
    // Native mini-map renderer for the current+radar widget. Keep this tiny:
    // one RainViewer timestamp and five transparent radar tiles through the
    // OMNIwx worker cache. The background is drawn locally so widget refreshes
    // do not compete with the foreground app for a full map tile stack.
    return runCatching {
      val bitmap = Bitmap.createBitmap(720, 360, Bitmap.Config.ARGB_8888)
      val canvas = Canvas(bitmap)
      val background = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(5, 17, 36)
        style = Paint.Style.FILL
      }
      canvas.drawRect(0f, 0f, 720f, 360f, background)

      val zoom = 7
      val tileSize = 512.0
      val timestamp = latestRainViewerTimestamp()
      val center = lonLatToTilePoint(place.lon, place.lat, zoom)
      val centerPxX = center.x * tileSize
      val centerPxY = center.y * tileSize
      val topLeftPxX = centerPxX - 360.0
      val topLeftPxY = centerPxY - 180.0
      val centerTileX = floor(center.x).toInt()
      val centerTileY = floor(center.y).toInt()
      val tileMax = 1 shl zoom

      val grid = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(56, 189, 248)
        alpha = 30
        strokeWidth = 2f
      }
      for (x in 0..720 step 72) canvas.drawLine(x.toFloat(), 0f, x.toFloat(), 360f, grid)
      for (y in 0..360 step 60) canvas.drawLine(0f, y.toFloat(), 720f, y.toFloat(), grid)

      val radarPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply {
        alpha = 225
      }
      var drawnTiles = 0
      val offsets = arrayOf(0 to 0, -1 to 0, 1 to 0, 0 to -1, 0 to 1)
      for ((dx, dy) in offsets) {
        val tileX = centerTileX + dx
        val tileY = centerTileY + dy
        if (tileY < 0 || tileY >= tileMax) continue
        val wrappedX = ((tileX % tileMax) + tileMax) % tileMax
        val url =
          "$OMNIWX_API_BASE/v1/radar/rainviewer/tiles/$zoom/$wrappedX/$tileY.png" +
            "?ts=$timestamp&size=512&color=2&smooth=1&snow=1"
        val tile = fetchBitmap(url) ?: continue
        val left = ((tileX * tileSize) - topLeftPxX).toFloat()
        val top = ((tileY * tileSize) - topLeftPxY).toFloat()
        canvas.drawBitmap(tile, null, RectF(left, top, (left + tileSize).toFloat(), (top + tileSize).toFloat()), radarPaint)
        drawnTiles += 1
      }

      if (drawnTiles <= 0) {
        return@runCatching null
      }

      val range = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(34, 211, 238)
        alpha = 72
        style = Paint.Style.STROKE
        strokeWidth = 3f
      }
      listOf(58f, 116f, 174f).forEach { radius -> canvas.drawCircle(360f, 180f, radius, range) }

      val label = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(148, 163, 184)
        alpha = 115
        textSize = 15f
        typeface = android.graphics.Typeface.DEFAULT_BOLD
        setShadowLayer(5f, 0f, 2f, Color.rgb(2, 6, 23))
      }
      canvas.drawText("25 mi", 438f, 127f, label)
      canvas.drawText("50 mi", 496f, 70f, label)

      val markerGlow = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(56, 189, 248)
        alpha = 58
        style = Paint.Style.FILL
      }
      canvas.drawCircle(360f, 180f, 29f, markerGlow)
      markerGlow.alpha = 96
      canvas.drawCircle(360f, 180f, 20f, markerGlow)
      val marker = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(125, 211, 252)
        style = Paint.Style.FILL
      }
      canvas.drawCircle(360f, 180f, 12f, marker)
      val markerStroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        alpha = 220
        style = Paint.Style.STROKE
        strokeWidth = 4f
      }
      canvas.drawCircle(360f, 180f, 13f, markerStroke)

      val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(226, 245, 255)
        alpha = 190
        textSize = 19f
        typeface = android.graphics.Typeface.DEFAULT_BOLD
        setShadowLayer(5f, 0f, 2f, Color.rgb(2, 6, 23))
      }
      canvas.drawText(place.name.take(22), 390f, 188f, text)
      text.textSize = 16f
      text.alpha = 130
      canvas.drawText("Live radar", 28f, 330f, text)

      drawRadarChip(canvas, 24f, 24f, radarStatusLabel(weather), accent = true)
      drawRadarChip(canvas, 556f, 24f, radarAgeLabel(timestamp), accent = false)
      bitmap
    }.getOrNull()
  }

  private fun latestRainViewerTimestamp(): Long {
    var connection: HttpURLConnection? = null
    return try {
      connection = (URL(RAINVIEWER_TIMELINE_URL).openConnection() as HttpURLConnection).apply {
        connectTimeout = 4500
        readTimeout = 4500
        requestMethod = "GET"
        setRequestProperty("User-Agent", "OMNIwx Alpha Android Widget")
        setRequestProperty("Accept", "application/json")
      }
      if (connection.responseCode !in 200..299) return 0L
      val root = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
      val radar = root.optJSONObject("radar") ?: return 0L
      val times = mutableListOf<Long>()
      val past = radar.optJSONArray("past") ?: JSONArray()
      val nowcast = radar.optJSONArray("nowcast") ?: JSONArray()
      for (idx in 0 until past.length()) {
        past.optJSONObject(idx)?.optLong("time", 0L)?.takeIf { it > 0L }?.let { times.add(it) }
      }
      for (idx in 0 until nowcast.length()) {
        nowcast.optJSONObject(idx)?.optLong("time", 0L)?.takeIf { it > 0L }?.let { times.add(it) }
      }
      times.maxOrNull() ?: 0L
    } catch (_: Exception) {
      0L
    } finally {
      connection?.disconnect()
    }
  }

  private fun radarAgeLabel(timestamp: Long): String {
    if (timestamp <= 0L) return "Radar --"
    val ageMinutes = ((System.currentTimeMillis() / 1000L - timestamp) / 60L).coerceAtLeast(0L)
    return when {
      ageMinutes < 2L -> "Radar now"
      ageMinutes < 90L -> "${ageMinutes}m old"
      else -> "Radar latest"
    }
  }

  private fun drawRadarWidgetOverlays(canvas: Canvas, placeName: String, weather: WidgetWeather?, hasLiveTiles: Boolean) {
    val width = 720f
    val height = 360f
    val cx = width / 2f
    val cy = height / 2f

    val vignette = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.argb(55, 2, 6, 23)
      style = Paint.Style.FILL
    }
    canvas.drawRoundRect(RectF(0f, 0f, width, height), 24f, 24f, vignette)

    val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(34, 211, 238)
      alpha = 88
      style = Paint.Style.STROKE
      strokeWidth = 3.5f
    }
    listOf(58f, 116f, 174f).forEach { radius -> canvas.drawCircle(cx, cy, radius, ring) }

    val cross = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(125, 211, 252)
      alpha = 42
      strokeWidth = 2f
    }
    canvas.drawLine(cx, 24f, cx, height - 24f, cross)
    canvas.drawLine(24f, cy, width - 24f, cy, cross)

    val label = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(226, 245, 255)
      alpha = if (hasLiveTiles) 180 else 132
      textSize = 19f
      typeface = android.graphics.Typeface.DEFAULT_BOLD
      setShadowLayer(5f, 0f, 2f, Color.rgb(2, 6, 23))
    }
    canvas.drawText(placeName.take(22), cx + 30f, cy + 8f, label)
    label.textSize = 16f
    label.alpha = 104
    canvas.drawText("25 mi", cx + 78f, cy - 53f, label)
    canvas.drawText("50 mi", cx + 136f, cy - 110f, label)
    canvas.drawText("Local radar", 28f, height - 30f, label)

    val pulse = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(56, 189, 248)
      alpha = 58
      style = Paint.Style.FILL
    }
    canvas.drawCircle(cx, cy, 29f, pulse)
    pulse.alpha = 96
    canvas.drawCircle(cx, cy, 20f, pulse)
    val dot = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(125, 211, 252)
      style = Paint.Style.FILL
    }
    canvas.drawCircle(cx, cy, 12f, dot)
    val dotStroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.WHITE
      alpha = 220
      style = Paint.Style.STROKE
      strokeWidth = 4f
    }
    canvas.drawCircle(cx, cy, 13f, dotStroke)

    drawRadarChip(canvas, 24f, 24f, radarStatusLabel(weather), accent = true)
    drawRadarChip(canvas, width - 164f, 24f, "Radar ${weather?.updatedLabel ?: "--"}", accent = false)
  }

  private fun drawRadarChip(canvas: Canvas, left: Float, top: Float, text: String, accent: Boolean) {
    val chip = RectF(left, top, left + if (accent) 210f else 140f, top + 38f)
    val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = if (accent) Color.argb(178, 8, 47, 73) else Color.argb(150, 15, 23, 42)
      style = Paint.Style.FILL
    }
    val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = if (accent) Color.rgb(34, 211, 238) else Color.rgb(148, 163, 184)
      alpha = if (accent) 118 else 72
      style = Paint.Style.STROKE
      strokeWidth = 1.5f
    }
    canvas.drawRoundRect(chip, 19f, 19f, fill)
    canvas.drawRoundRect(chip, 19f, 19f, stroke)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.WHITE
      alpha = 232
      textSize = 18f
      typeface = android.graphics.Typeface.DEFAULT_BOLD
    }
    canvas.drawText(text.take(if (accent) 22 else 15), left + 16f, top + 25f, paint)
  }

  private fun radarStatusLabel(weather: WidgetWeather?): String {
    val code = weather?.weatherCode ?: return "Radar loading"
    return when (code) {
      51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82 -> "Rain signal nearby"
      71, 73, 75, 77, 85, 86 -> "Snow signal nearby"
      95, 96, 99 -> "Storms possible"
      else -> "No precip nearby"
    }
  }

  private fun fetchBitmap(url: String): Bitmap? {
    var connection: HttpURLConnection? = null
    return try {
      connection = (URL(url).openConnection() as HttpURLConnection).apply {
        connectTimeout = 4500
        readTimeout = 4500
        requestMethod = "GET"
        setRequestProperty("User-Agent", "OMNIwx Alpha Android Widget")
      }
      if (connection.responseCode !in 200..299) return null
      connection.inputStream.use { stream -> BitmapFactory.decodeStream(stream) }
    } catch (_: Exception) {
      null
    } finally {
      connection?.disconnect()
    }
  }

  private fun lonLatToTilePoint(lon: Double, lat: Double, zoom: Int): TilePoint {
    val latRad = Math.toRadians(lat.coerceIn(-85.05112878, 85.05112878))
    val scale = (1 shl zoom).toDouble()
    val x = ((lon + 180.0) / 360.0) * scale
    val y = (1.0 - kotlin.math.ln(kotlin.math.tan(latRad) + 1.0 / kotlin.math.cos(latRad)) / Math.PI) / 2.0 * scale
    return TilePoint(x, y)
  }

  private fun nearestMetarJson(place: WidgetPlace, array: JSONArray): JSONObject? {
    var best: JSONObject? = null
    var bestDistance = Double.POSITIVE_INFINITY
    for (idx in 0 until array.length()) {
      val item = array.optJSONObject(idx) ?: continue
      val lat = item.optDouble("lat", Double.NaN)
      val lon = item.optDouble("lon", Double.NaN)
      if (!lat.isFinite() || !lon.isFinite()) continue
      val distance = haversineMiles(place.lat, place.lon, lat, lon)
      if (distance < bestDistance) {
        best = item
        bestDistance = distance
      }
    }
    return best
  }

  private fun metarFromJson(json: JSONObject): WidgetMetar {
    val raw = json.optString("rawOb", "").ifBlank { json.optString("rawText", "") }
    val station = json.optString("icaoId", "").ifBlank { "Nearest METAR" }
    val stationName = json.optString("name", "")
      .ifBlank { json.optString("site", "") }
      .ifBlank { json.optString("reportingStation", "") }
    val category = json.optString("fltCat", "").ifBlank { json.optString("flightCategory", "").ifBlank { "--" } }
    val wspd = json.optDouble("wspd", Double.NaN)
    val wgst = json.optDouble("wgst", Double.NaN)
    val wdir = json.optDouble("wdir", Double.NaN)
    val vis = json.optString("visib", "").ifBlank { "--" }
    val wind = if (wspd.isFinite()) {
      "${windDirectionLabel(wdir)} ${wspd.roundToInt()}${if (wgst.isFinite()) "G${wgst.roundToInt()}" else ""} kt"
    } else {
      "--"
    }
    return WidgetMetar(
      station = station,
      stationName = stationName,
      category = category,
      wind = wind,
      visibility = "$vis sm",
      ceiling = ceilingLabel(json.optJSONArray("clouds")),
      altimeter = altimeterLabel(json),
      hazards = hazardSummary(raw),
      updatedLabel = nowLabel(),
    )
  }

  private fun altimeterLabel(json: JSONObject): String {
    val value = json.optDouble("altim", Double.NaN).takeIf { it.isFinite() }
      ?: json.optDouble("altimeter", Double.NaN).takeIf { it.isFinite() }
      ?: json.optDouble("altimeter_hpa", Double.NaN).takeIf { it.isFinite() }
      ?: json.optDouble("altimeter_in_hg", Double.NaN).takeIf { it.isFinite() }
      ?: return "--"
    return if (value > 100) "${value.roundToInt()} hPa" else String.format(Locale.US, "%.2f inHg", value)
  }

  private fun airportStatusTitle(category: String, hazards: String): String {
    val cat = category.uppercase(Locale.US)
    return when {
      cat == "VFR" && !hazards.startsWith("Hazards") -> "Favorable"
      cat == "MVFR" -> "Marginal"
      cat == "IFR" || cat == "LIFR" -> "Instrument conditions"
      hazards.startsWith("Hazards") -> "Watch hazards"
      else -> "Airport weather"
    }
  }

  private fun airportStatusSummary(metar: WidgetMetar): String {
    val cat = metar.category.ifBlank { "category unavailable" }
    if (metar.hazards.startsWith("Hazards")) return "${metar.hazards}. Check official briefing."
    return "Current METAR is $cat with no obvious station-level concern."
  }

  private fun tafTrendLabel(raw: String?): String {
    val text = raw?.uppercase(Locale.US) ?: return "TAF --"
    return when {
      text.contains("LIFR") -> "TAF LIFR possible"
      text.contains("IFR") || Regex("""\bOVC00|BKN00|VV00""").containsMatchIn(text) -> "TAF IFR possible"
      text.contains("TS") || text.contains("CB") -> "TAF storms possible"
      text.contains("TEMPO") -> "TAF has TEMPO"
      text.contains("BECMG") -> "TAF changing"
      text.isNotBlank() -> "TAF available"
      else -> "TAF --"
    }
  }

  private fun hazardSummary(raw: String): String {
    val text = raw.uppercase(Locale.US)
    val hazards = mutableListOf<String>()
    if (Regex("""\bTS|VCTS|CB\b""").containsMatchIn(text)) hazards.add("Thunderstorms")
    if (text.contains("LLWS") || Regex("""\bWS\d{3}/""").containsMatchIn(text)) hazards.add("LLWS")
    if (text.contains("FZRA") || text.contains("PL") || text.contains("ICING")) hazards.add("Icing")
    if (hazards.isEmpty()) return "No local METAR hazards"
    return "Hazards: ${hazards.joinToString(", ")}"
  }

  private fun ceilingLabel(clouds: JSONArray?): String {
    if (clouds == null || clouds.length() == 0) return "Ceiling --"
    var lowest: Int? = null
    for (idx in 0 until clouds.length()) {
      val cloud = clouds.optJSONObject(idx) ?: continue
      val cover = cloud.optString("cover", "").uppercase(Locale.US)
      if (cover != "BKN" && cover != "OVC" && cover != "VV") continue
      val base = cloudBaseFeet(cloud)
      if (base != null && (lowest == null || base < lowest!!)) lowest = base
    }
    return lowest?.let { "Ceiling $it ft" } ?: "Ceiling unlimited"
  }

  private fun cloudBaseFeet(cloud: JSONObject): Int? {
    // AviationWeather JSON currently returns clouds[].base in feet AGL. Older
    // METAR encodings use hundreds of feet, so only multiply fields that are
    // explicitly named that way. This prevents BKN250/25000 ft from becoming
    // the obviously bogus 2,500,000 ft on widgets.
    val feet = cloud.optDouble("base", Double.NaN).takeIf { it.isFinite() }
      ?: cloud.optDouble("base_ft_agl", Double.NaN).takeIf { it.isFinite() }
      ?: cloud.optDouble("cloud_base_ft_agl", Double.NaN).takeIf { it.isFinite() }
    if (feet != null) return feet.roundToInt().takeIf { it in 0..60000 }

    val hundreds = cloud.optDouble("base_hundreds", Double.NaN).takeIf { it.isFinite() }
      ?: cloud.optDouble("baseHundreds", Double.NaN).takeIf { it.isFinite() }
    return hundreds?.let { (it * 100.0).roundToInt() }?.takeIf { it in 0..60000 }
  }
}

private fun readAviationSelection(context: Context): JSONObject? {
  return readAsyncStorageValue(context, AVIATION_WIDGET_SELECTION_KEY)?.let { raw ->
    runCatching { JSONObject(raw) }.getOrNull()
  }
}

private fun readAsyncStorageValue(context: Context, key: String): String? {
  // Same AsyncStorage SQLite access pattern used by Android Auto. This lets
  // native widgets read app-written state without waking the React Native bridge.
  val dbFile = context.getDatabasePath("RKStorage")
  if (!dbFile.exists()) return null

  var db: SQLiteDatabase? = null
  return try {
    db = SQLiteDatabase.openDatabase(dbFile.absolutePath, null, SQLiteDatabase.OPEN_READONLY)
    db.rawQuery("SELECT value FROM catalystLocalStorage WHERE key = ? LIMIT 1", arrayOf(key)).use { cursor ->
      if (cursor.moveToFirst()) cursor.getString(0) else null
    }
  } catch (_: Exception) {
    null
  } finally {
    db?.close()
  }
}

private fun countLabel(counts: JSONObject?, key: String, hazardText: String, fallbackToken: String): String {
  // Route widget can receive structured counts or older plain-English hazard
  // text. Prefer structured values, then parse the text as a compatibility path.
  val direct = counts?.optInt(key, Int.MIN_VALUE)?.takeIf { it != Int.MIN_VALUE }
  if (direct != null) return direct.toString()
  val match = Regex("""(\d+)\s+${Regex.escape(fallbackToken)}""", RegexOption.IGNORE_CASE).find(hazardText)
  return match?.groupValues?.getOrNull(1) ?: "0"
}

private fun formatAltitudeFt(value: Double): String {
  if (!value.isFinite()) return ""
  return if (value >= 18000) "FL${(value / 100.0).roundToInt().toString().padStart(3, '0')}" else "${value.roundToInt()} ft"
}

private fun utcShortLabel(value: String): String? {
  val formats = listOf(
    "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
    "yyyy-MM-dd'T'HH:mm:ss'Z'",
    "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
    "yyyy-MM-dd'T'HH:mm:ssXXX",
  )
  for (pattern in formats) {
    val parsed = runCatching {
      SimpleDateFormat(pattern, Locale.US).apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }.parse(value)
    }.getOrNull()
    if (parsed != null) return SimpleDateFormat("HHmm'Z'", Locale.US).apply {
      timeZone = java.util.TimeZone.getTimeZone("UTC")
    }.format(parsed)
  }
  return null
}

private fun readAsyncStorageValuesByPrefix(context: Context, prefix: String): List<String> {
  // Cache keys include lat/lon/date suffixes, so prefix scans are used when the
  // widget needs "any current cache for this feature" instead of one exact key.
  val dbFile = context.getDatabasePath("RKStorage")
  if (!dbFile.exists()) return emptyList()

  var db: SQLiteDatabase? = null
  return try {
    db = SQLiteDatabase.openDatabase(dbFile.absolutePath, null, SQLiteDatabase.OPEN_READONLY)
    val values = mutableListOf<String>()
    db.rawQuery(
      "SELECT value FROM catalystLocalStorage WHERE key LIKE ?",
      arrayOf("$prefix%")
    ).use { cursor ->
      while (cursor.moveToNext()) values.add(cursor.getString(0))
    }
    values
  } catch (_: Exception) {
    emptyList()
  } finally {
    db?.close()
  }
}

private fun placeFromJson(json: JSONObject): WidgetPlace? {
  val lat = json.optDouble("lat", Double.NaN).takeIf { it.isFinite() }
    ?: json.optDouble("latitude", Double.NaN).takeIf { it.isFinite() }
    ?: return null
  val lon = json.optDouble("lon", Double.NaN).takeIf { it.isFinite() }
    ?: json.optDouble("lng", Double.NaN).takeIf { it.isFinite() }
    ?: json.optDouble("longitude", Double.NaN).takeIf { it.isFinite() }
    ?: return null
  if (!lat.isFinite() || !lon.isFinite()) return null
  val rawName = json.optString("name", "").ifBlank { "OMNIwx location" }
  val name = if (looksLikeCoordinateLabel(rawName)) "Current Location" else rawName
  return WidgetPlace(name = name, lat = lat, lon = lon)
}

private fun currentPlace(context: Context, fallback: WidgetPlace?): WidgetPlace? {
  val stored = readAsyncStorageValue(context, LAST_COORDS_STORAGE_KEY)
    ?.let { raw -> runCatching { currentPlaceFromJson(JSONObject(raw)) }.getOrNull() }
  val nativeLastKnown = lastKnownCurrentPlace(context)
  return nativeLastKnown ?: stored ?: fallback
}

private fun currentPlaceFromJson(json: JSONObject): WidgetPlace? {
  val lat = json.optDouble("lat", Double.NaN)
  val lon = json.optDouble("lon", Double.NaN)
  if (!lat.isFinite() || !lon.isFinite()) return null
  val label = json.optString("label", "").trim().ifBlank { "Current Location" }
  return WidgetPlace(name = label, lat = lat, lon = lon)
}

private fun lastKnownCurrentPlace(context: Context): WidgetPlace? {
  if (!hasLocationPermission(context)) return null
  val manager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
  val providers = listOf(
    LocationManager.FUSED_PROVIDER,
    LocationManager.GPS_PROVIDER,
    LocationManager.NETWORK_PROVIDER,
    LocationManager.PASSIVE_PROVIDER,
  ).distinct()

  val best = providers
    .mapNotNull { provider ->
      runCatching {
        if (manager.allProviders.contains(provider)) manager.getLastKnownLocation(provider) else null
      }.getOrNull()
    }
    .filter { it.hasUsableCoordinates() }
    .maxWithOrNull(compareBy<Location> { it.time }.thenByDescending { if (it.hasAccuracy()) it.accuracy else Float.MAX_VALUE })
    ?: return null

  return WidgetPlace(name = "Current Location", lat = best.latitude, lon = best.longitude)
}

private fun hasLocationPermission(context: Context): Boolean {
  if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
  return context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED ||
    context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED
}

private fun Location.hasUsableCoordinates(): Boolean =
  latitude.isFinite() && longitude.isFinite() && latitude in -90.0..90.0 && longitude in -180.0..180.0

private fun readClimoCache(context: Context, place: WidgetPlace): WidgetClimatology? {
  // The phone app stores climate normals keyed by rounded coordinates. Widgets
  // use the same rounding so the launcher and app point at the same cache row.
  val key = "$CLIMO_CACHE_PREFIX:${String.format(Locale.US, "%.3f", place.lat)},${String.format(Locale.US, "%.3f", place.lon)}"
  return readAsyncStorageValue(context, key)?.let { raw ->
    runCatching { climoFromJson(place, JSONObject(raw)) }.getOrNull()
  }
}

private fun readSkyScoreCache(context: Context, place: WidgetPlace): WidgetSkyScore? {
  // Keep Sky Score fresh enough for a glanceable widget. Six hours prevents an
  // old evening score from pretending to be current the next day.
  val key = "$SKY_SCORE_CACHE_PREFIX:${String.format(Locale.US, "%.3f", place.lat)},${String.format(Locale.US, "%.3f", place.lon)}"
  return readAsyncStorageValue(context, key)?.let { raw ->
    runCatching {
      val payload = JSONObject(raw)
      val savedAt = payload.optLong("savedAt", 0L)
      if (savedAt <= 0L || System.currentTimeMillis() - savedAt > 6L * 60L * 60L * 1000L) return@runCatching null
      payload.optJSONObject("widget")?.let { return@runCatching skyScoreFromWidgetJson(it) }
      skyScoreFromInspectJson(payload.optJSONObject("data") ?: return@runCatching null)
    }.getOrNull()
  }
}

private fun skyScoreFromWidgetJson(root: JSONObject): WidgetSkyScore? {
  // Preferred cache shape: the React Native app pre-formats the exact widget
  // strings so native Android does not re-implement the whole astronomy model.
  val score = root.optInt("score", -1).takeIf { it >= 0 } ?: return null
  return WidgetSkyScore(
    score = score.coerceIn(0, 100),
    label = root.optString("label", "").ifBlank { skyQualityLabel(score) },
    bestWindow = root.optString("bestWindow", "").ifBlank { "Best window --" },
    bortle = root.optString("bortle", "").ifBlank { "Bortle unavailable" },
    cloudLow = root.optString("cloudLow", "").ifBlank { "--" },
    cloudMid = root.optString("cloudMid", "").ifBlank { "--" },
    cloudHigh = root.optString("cloudHigh", "").ifBlank { "--" },
    clouds = root.optString("clouds", "").ifBlank { "Cloud layers --" },
    aurora = root.optString("footer", "").ifBlank { "Cached ${nowLabel()}" },
  )
}

private fun skyScoreFromInspectJson(root: JSONObject): WidgetSkyScore? {
  // Fallback worker/API shape. This has raw inspect values, so format the core
  // widget strings here.
  val score = root.optInt("skyScore", -1).takeIf { it >= 0 } ?: return null
  val site = root.optJSONObject("site")
  val bortleClass = site?.optNullableDouble("bortleClass")
  val bortleLabel = site?.optString("bortleLabel", "")?.ifBlank { null }
  val low = root.optNullableDouble("cloudLow")
  val mid = root.optNullableDouble("cloudMid")
  val high = root.optNullableDouble("cloudHigh")
  return WidgetSkyScore(
    score = score.coerceIn(0, 100),
    label = skyQualityLabel(score),
    bestWindow = skyWindowLine(score, low, mid, high),
    bortle = bortleLine(bortleClass, bortleLabel),
    cloudLow = pctLabel(low),
    cloudMid = pctLabel(mid),
    cloudHigh = pctLabel(high),
    clouds = cloudLayerShort(low, mid, high),
    aurora = "Cached ${nowLabel()}",
  )
}

private fun climoFromJson(place: WidgetPlace, root: JSONObject): WidgetClimatology? {
  // Worker/cache JSON -> widget model. The widget needs both the current month
  // normals and the full 12-month high/low arrays for the climate arch.
  val normals = root.optJSONArray("normals") ?: return null
  val month = Calendar.getInstance().get(Calendar.MONTH) + 1
  var normalHigh: Double? = null
  var normalLow: Double? = null
  val monthlyHighs = MutableList<Double?>(12) { null }
  val monthlyLows = MutableList<Double?>(12) { null }
  for (idx in 0 until normals.length()) {
    val item = normals.optJSONObject(idx) ?: continue
    val itemMonth = item.optInt("month", -1)
    if (itemMonth in 1..12) {
      monthlyHighs[itemMonth - 1] = item.optNullableDouble("tmaxF")
      monthlyLows[itemMonth - 1] = item.optNullableDouble("tminF")
    }
    if (itemMonth == month) {
      normalHigh = item.optNullableDouble("tmaxF")
      normalLow = item.optNullableDouble("tminF")
    }
  }

  val precipArray = root.optJSONArray("precipMonthlyIn")
  val monthPrecip = precipArray?.optNullableDouble(month - 1)
  var annualPrecip: Double? = null
  if (precipArray != null) {
    var total = 0.0
    var count = 0
    for (idx in 0 until precipArray.length()) {
      val value = precipArray.optNullableDouble(idx) ?: continue
      total += value.coerceAtLeast(0.0)
      count += 1
    }
    if (count > 0) annualPrecip = total
  }

  val station = root.optJSONObject("station")
  val stationName = station?.optString("name", "")?.ifBlank { null } ?: "Nearest climate station"
  return WidgetClimatology(
    place = place,
    stationName = stationName,
    normalHighF = normalHigh,
    normalLowF = normalLow,
    normalPrecipIn = monthPrecip,
    annualPrecipIn = annualPrecip,
    monthlyHighsF = monthlyHighs,
    monthlyLowsF = monthlyLows,
    recordHighF = null,
    recordHighYear = null,
    recordLowF = null,
    recordLowYear = null,
    recordPrecipIn = null,
    recordPrecipYear = null,
    updatedLabel = nowLabel(),
  )
}

private fun readTodayRecordsCache(context: Context): WidgetDailyRecords? {
  // Records are date-specific. Scan valid records caches and pick the freshest
  // one that contains today's MM-DD entry.
  val todayKey = SimpleDateFormat("MM-dd", Locale.US).format(Date())
  var bestSavedAt = 0L
  var best: WidgetDailyRecords? = null
  readAsyncStorageValuesByPrefix(context, RECORDS_CACHE_PREFIX).forEach { raw ->
    val root = runCatching { JSONObject(raw) }.getOrNull() ?: return@forEach
    val savedAt = root.optLong("savedAt", 0L)
    val ttlMs = root.optLong("ttlMs", 30L * 24L * 60L * 60L * 1000L)
    if (savedAt <= 0L || savedAt + ttlMs < System.currentTimeMillis()) return@forEach
    val record = root.optJSONObject("data")?.optJSONObject(todayKey) ?: return@forEach
    if (savedAt < bestSavedAt) return@forEach
    bestSavedAt = savedAt
    best = WidgetDailyRecords(
      recordHighF = record.optNullableDouble("recordHighF"),
      recordHighYear = firstYear(record.optJSONArray("recordHighYears")),
      recordLowF = record.optNullableDouble("recordLowF"),
      recordLowYear = firstYear(record.optJSONArray("recordLowYears")),
      recordPrecipIn = record.optNullableDouble("recordPrecipIn"),
      recordPrecipYear = firstYear(record.optJSONArray("recordPrecipYears")),
    )
  }
  return best
}

private fun WidgetClimatology.withRecords(records: WidgetDailyRecords?): WidgetClimatology {
  if (records == null) return this
  return copy(
    recordHighF = records.recordHighF,
    recordHighYear = records.recordHighYear,
    recordLowF = records.recordLowF,
    recordLowYear = records.recordLowYear,
    recordPrecipIn = records.recordPrecipIn,
    recordPrecipYear = records.recordPrecipYear,
  )
}

private fun firstYear(years: JSONArray?): Int? {
  if (years == null || years.length() == 0) return null
  return years.optInt(0, -1).takeIf { it > 0 }
}

private fun skyQualityLabel(score: Int): String {
  return when {
    score >= 90 -> "Excellent"
    score >= 80 -> "Very Good"
    score >= 65 -> "Good"
    score >= 45 -> "Fair"
    else -> "Poor"
  }
}

private fun bortleLine(bortleClass: Double?, label: String?): String {
  val b = bortleClass?.takeIf { it.isFinite() }?.roundToInt()
  return when {
    b != null && !label.isNullOrBlank() -> "Bortle $b - $label"
    b != null -> "Bortle $b"
    !label.isNullOrBlank() -> label
    else -> "Bortle unavailable"
  }
}

private fun cloudLayerLine(low: Double?, mid: Double?, high: Double?): String {
  return "Low ${pctLabel(low)} / Mid ${pctLabel(mid)} / High ${pctLabel(high)}"
}

private fun cloudLayerShort(low: Double?, mid: Double?, high: Double?): String {
  return "Clouds L ${pctLabel(low)} M ${pctLabel(mid)} H ${pctLabel(high)}"
}

private fun skyWindowLine(score: Int, low: Double?, mid: Double?, high: Double?): String {
  val worstCloud = listOfNotNull(low, mid, high).filter { it.isFinite() }.maxOrNull()
  return when {
    score >= 80 && (worstCloud == null || worstCloud <= 25) -> "Best window favorable tonight"
    score >= 65 -> "Best window worth checking"
    score >= 45 -> "Best window limited tonight"
    else -> "Poor observing window"
  }
}

private fun pctLabel(value: Double?): String {
  return value?.takeIf { it.isFinite() }?.let { "${it.roundToInt()}%" } ?: "--"
}

private fun weatherCacheKey(place: WidgetPlace): String {
  return "${place.lat.roundCoord()},${place.lon.roundCoord()}"
}

private fun Double.roundCoord(): String {
  return String.format(Locale.US, "%.3f", this)
}

private fun looksLikeCoordinateLabel(value: String): Boolean {
  return Regex("""^\s*-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?\s*$""").matches(value)
}

private fun fetchJsonObject(url: String, userAgent: String): JSONObject {
  return JSONObject(fetchText(url, userAgent))
}

private fun fetchJsonArray(url: String, userAgent: String): JSONArray {
  return JSONArray(fetchText(url, userAgent))
}

private fun JSONObject.optNullableDouble(name: String): Double? {
  if (!has(name) || isNull(name)) return null
  val value = optDouble(name, Double.NaN)
  return if (value.isFinite()) value else null
}

private fun JSONArray.optNullableDouble(index: Int): Double? {
  if (index < 0 || index >= length() || isNull(index)) return null
  val value = optDouble(index, Double.NaN)
  return if (value.isFinite()) value else null
}

private fun fetchText(url: String, userAgent: String): String {
  val conn = (URL(url).openConnection() as HttpURLConnection).apply {
    connectTimeout = 8000
    readTimeout = 8000
    requestMethod = "GET"
    setRequestProperty("User-Agent", userAgent)
    setRequestProperty("Accept", "application/json")
  }
  return try {
    if (conn.responseCode !in 200..299) throw IllegalStateException("HTTP ${conn.responseCode}")
    conn.inputStream.bufferedReader().use { it.readText() }
  } finally {
    conn.disconnect()
  }
}

private fun drawSun(canvas: Canvas, cx: Float, cy: Float, radius: Float, fill: Paint, ray: Paint) {
  canvas.drawCircle(cx, cy, radius, fill)
  for (i in 0 until 8) {
    val angle = Math.toRadians((i * 45).toDouble())
    val x1 = cx + ((radius + 11f) * cos(angle)).toFloat()
    val y1 = cy + ((radius + 11f) * sin(angle)).toFloat()
    val x2 = cx + ((radius + 23f) * cos(angle)).toFloat()
    val y2 = cy + ((radius + 23f) * sin(angle)).toFloat()
    canvas.drawLine(x1, y1, x2, y2, ray)
  }
}

private fun drawCloud(canvas: Canvas, paint: Paint, yOffset: Float) {
  canvas.drawCircle(43f, 66f + yOffset, 16f, paint)
  canvas.drawCircle(64f, 58f + yOffset, 24f, paint)
  canvas.drawCircle(86f, 69f + yOffset, 15f, paint)
  canvas.drawRoundRect(RectF(31f, 69f + yOffset, 101f, 88f + yOffset), 13f, 13f, paint)
}

private fun weatherIconColor(code: Int): Int {
  return when (code) {
    0 -> Color.rgb(250, 204, 21)
    1, 2 -> Color.rgb(251, 191, 36)
    3, 45, 48 -> Color.rgb(148, 163, 184)
    51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82 -> Color.rgb(56, 189, 248)
    71, 73, 75, 77, 85, 86 -> Color.rgb(186, 230, 253)
    95, 96, 99 -> Color.rgb(251, 146, 60)
    else -> Color.rgb(34, 211, 238)
  }
}

private fun skyScoreColor(score: Int): Int {
  return when {
    score >= 80 -> Color.rgb(34, 211, 238)
    score >= 65 -> Color.rgb(96, 165, 250)
    score >= 45 -> Color.rgb(250, 204, 21)
    else -> Color.rgb(248, 113, 113)
  }
}

fun weatherCodeLabel(code: Int): String {
  return when (code) {
    0 -> "Clear"
    1, 2 -> "Partly cloudy"
    3 -> "Cloudy"
    45, 48 -> "Fog"
    51, 53, 55, 56, 57 -> "Drizzle"
    61, 63, 65, 66, 67 -> "Rain"
    71, 73, 75, 77 -> "Snow"
    80, 81, 82 -> "Showers"
    85, 86 -> "Snow showers"
    95, 96, 99 -> "Thunderstorms"
    else -> "Current conditions"
  }
}

fun windDirectionLabel(degrees: Double): String {
  if (!degrees.isFinite()) return "--"
  val directions = arrayOf("N", "NE", "E", "SE", "S", "SW", "W", "NW")
  val index = (((degrees + 22.5) / 45.0).toInt() % 8).coerceIn(0, 7)
  return directions[index]
}

fun Double.roundLabel(): String {
  if (!isFinite()) return "--"
  return roundToInt().toString()
}

fun Throwable.shortWidgetMessage(): String {
  val root = generateSequence(this) { it.cause }.last()
  val raw = root.message?.takeIf { it.isNotBlank() } ?: root.javaClass.simpleName
  return raw
    .replace('\n', ' ')
    .replace('\r', ' ')
    .take(96)
}

private fun metersToMiles(meters: Double): Double {
  if (!meters.isFinite()) return Double.NaN
  return meters / 1609.344
}

private fun nowLabel(): String {
  return SimpleDateFormat("h:mm a", Locale.US).format(Date())
}

private fun haversineMiles(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
  val radiusMiles = 3958.7613
  val dLat = Math.toRadians(lat2 - lat1)
  val dLon = Math.toRadians(lon2 - lon1)
  val rLat1 = Math.toRadians(lat1)
  val rLat2 = Math.toRadians(lat2)
  val a = sin(dLat / 2) * sin(dLat / 2) + cos(rLat1) * cos(rLat2) * sin(dLon / 2) * sin(dLon / 2)
  val c = 2 * atan2(sqrt(a), sqrt(1 - a))
  return radiusMiles * c
}
