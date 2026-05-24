package com.anonymous.weatherapp.car

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.database.sqlite.SQLiteDatabase
import android.location.Location
import android.location.LocationManager
import androidx.car.app.CarAppService
import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.Session
import androidx.car.app.SessionInfo
import androidx.car.app.model.Action
import androidx.car.app.model.CarColor
import androidx.car.app.model.CarIcon
import androidx.car.app.model.Pane
import androidx.car.app.model.PaneTemplate
import androidx.car.app.model.Row
import androidx.car.app.model.Template
import androidx.car.app.validation.HostValidator
import androidx.core.content.ContextCompat
import com.anonymous.weatherapp.BuildConfig
import java.net.HttpURLConnection
import java.net.UnknownHostException
import java.net.URL
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import kotlin.concurrent.thread
import kotlin.math.roundToInt
import org.json.JSONObject

private const val PLACE_STORAGE_KEY = "omniwx.place.v2"
private const val DEFAULT_CITY_STORAGE_KEY = "omniwx:profile:defaultCity"

class OmniWeatherCarAppService : CarAppService() {
  override fun createHostValidator(): HostValidator {
    return if ((applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
      HostValidator.ALLOW_ALL_HOSTS_VALIDATOR
    } else {
      HostValidator.Builder(this)
        .addAllowedHosts(androidx.car.app.R.array.hosts_allowlist_sample)
        .build()
    }
  }

  override fun onCreateSession(sessionInfo: SessionInfo): Session {
    return OmniWeatherCarSession()
  }

  override fun onCreateSession(): Session {
    return OmniWeatherCarSession()
  }
}

class OmniWeatherCarSession : Session() {
  override fun onCreateScreen(intent: Intent): Screen {
    return OmniWeatherCarScreen(carContext)
  }
}

class OmniWeatherCarScreen(carContext: CarContext) : Screen(carContext) {
  @Volatile private var loading = false
  @Volatile private var loaded = false
  @Volatile private var report: CarWeatherReport? = null
  @Volatile private var error: String? = null

  override fun onGetTemplate(): Template {
    loadWeatherIfNeeded()
    return buildHomeTemplate()
  }

  private fun buildHomeTemplate(): Template {
    val pane = Pane.Builder()
    val current = report
    val currentError = error

    when {
      current != null -> {
        pane.addRow(
          Row.Builder()
            .setTitle("OMNIwx Alpha ${BuildConfig.VERSION_NAME}")
            .addText("${current.placeName} · ${current.locationSource} · ${current.updatedLabel}")
            .build()
        )
        pane.addRow(
          Row.Builder()
            .setTitle("${current.temperatureF.roundLabel()}°F · ${weatherCodeLabel(current.weatherCode)}")
            .addText("${conditionSubtitle(current.weatherCode)} · feels ${current.feelsLikeF.roundLabel()}°")
            .build()
        )
        pane.addRow(
          Row.Builder()
            .setTitle("${current.precipChancePct.roundLabel()}% precip · ${windDirectionLabel(current.windDirectionDeg)} ${current.windMph.roundLabel()} mph")
            .addText("Visibility ${current.visibilityMiles.roundLabel()} mi · high ${current.highF.roundLabel()}° / low ${current.lowF.roundLabel()}°")
            .build()
        )
        pane.addRow(alertSummaryRow(current))
      }
      loading -> {
        pane.addRow(
          Row.Builder()
            .setTitle("Loading weather")
            .addText("Connecting to your OMNIwx location. Android Auto may need a moment to wake up data.")
            .build()
        )
      }
      currentError != null -> {
        pane.addRow(
          Row.Builder()
            .setTitle("Weather is still connecting")
            .addText(currentError)
            .build()
        )
      }
      else -> {
        pane.addRow(
          Row.Builder()
            .setTitle("Location unavailable")
            .addText("Open OMNIwx once on your phone or allow location access.")
            .build()
        )
      }
    }

    pane.addAction(refreshAction())

    return PaneTemplate.Builder(pane.build())
      .setTitle("OMNIwx")
      .setHeaderAction(Action.APP_ICON)
      .build()
  }

  private fun buildMapTemplate(): Template {
    val current = report
    val pane = Pane.Builder()
      .addRow(
        Row.Builder()
          .setTitle("Weather map")
          .addText(current?.let { "Centered on ${it.placeName}" } ?: "Centered on your OMNIwx location when available.")
          .build()
      )
      .addRow(
        Row.Builder()
          .setTitle("Radar")
          .addText("Station radar, warning polygons, and map layers remain available on the phone screen.")
          .build()
      )
      .addRow(
        Row.Builder()
          .setTitle("Android Auto safety")
          .addText("The car display uses simplified, glanceable map status instead of the full interactive map.")
          .build()
      )
      .addAction(refreshAction())
      .build()

    return PaneTemplate.Builder(pane)
      .setTitle("Map")
      .setHeaderAction(Action.APP_ICON)
      .build()
  }

  private fun buildAlertsTemplate(): Template {
    val current = report
    val pane = Pane.Builder()

    if (current?.alertTitle != null) {
      pane.addRow(
        Row.Builder()
          .setTitle(current.alertTitle)
          .addText(current.alertSubtitle ?: "Active near ${current.placeName}")
          .build()
      )
    } else if (current != null) {
      pane.addRow(
        Row.Builder()
          .setTitle("No active alerts")
          .addText("No NWS alerts found for ${current.placeName}.")
          .build()
      )
    } else {
      pane.addRow(
        Row.Builder()
          .setTitle("Alerts unavailable")
          .addText("Load your OMNIwx location to check nearby alerts.")
          .build()
      )
    }

    pane.addRow(
      Row.Builder()
        .setTitle("Refresh")
        .addText("Check current weather and alerts again.")
        .build()
    )
    pane.addAction(refreshAction())

    return PaneTemplate.Builder(pane.build())
      .setTitle("Alerts")
      .setHeaderAction(Action.APP_ICON)
      .build()
  }

  private fun refreshAction(): Action {
    return Action.Builder()
      .setTitle("Refresh")
      .setBackgroundColor(CarColor.BLUE)
      .setOnClickListener {
        loaded = false
        loadWeatherIfNeeded(force = true)
        invalidate()
      }
      .build()
  }

  private fun loadWeatherIfNeeded(force: Boolean = false) {
    if (loading) return
    if (loaded && !force) return

    loading = true
    error = null

    thread(name = "omniwx-car-weather") {
      try {
        val place = resolveCarPlace(carContext)
          ?: throw IllegalStateException("No GPS or saved OMNIwx place found.")
        report = fetchCurrentWeather(place)
        loaded = true
      } catch (e: Exception) {
        error = friendlyCarError(e)
        loaded = true
      } finally {
        loading = false
        invalidate()
      }
    }
  }
}

private data class CarPlace(
  val name: String,
  val lat: Double,
  val lon: Double,
  val source: String,
)

private data class CarWeatherReport(
  val placeName: String,
  val locationSource: String,
  val updatedLabel: String,
  val temperatureF: Double,
  val feelsLikeF: Double,
  val highF: Double,
  val lowF: Double,
  val precipChancePct: Double,
  val windMph: Double,
  val windDirectionDeg: Double,
  val visibilityMiles: Double,
  val weatherCode: Int,
  val alertTitle: String?,
  val alertSubtitle: String?,
)

private fun resolveCarPlace(context: Context): CarPlace? {
  val activePlace = readStoredActivePlace(context)
  if (activePlace?.source == "gps") {
    val gps = readLastKnownLocation(context)
    if (gps != null) return gps
  }

  if (activePlace != null) return activePlace

  return readStoredDefaultCity(context) ?: readLastKnownLocation(context)
}

private fun readStoredActivePlace(context: Context): CarPlace? {
  val raw = readAsyncStorageValue(context, PLACE_STORAGE_KEY) ?: return null
  val root = JSONObject(raw)
  val active = root.optJSONObject("active") ?: return null
  return placeFromJson(active, "Saved place")
}

private fun readStoredDefaultCity(context: Context): CarPlace? {
  val raw = readAsyncStorageValue(context, DEFAULT_CITY_STORAGE_KEY) ?: return null
  val city = JSONObject(raw)
  return placeFromJson(city, "Default city")
}

private fun placeFromJson(json: JSONObject, fallbackSource: String): CarPlace? {
  val lat = json.optDouble("lat", Double.NaN)
  val lon = json.optDouble("lon", Double.NaN)
  if (!lat.isFinite() || !lon.isFinite()) return null

  val source = json.optString("source", fallbackSource).ifBlank { fallbackSource }
  val rawName = json.optString("name", "").ifBlank {
    if (source == "gps") "Current Location" else "OMNIwx location"
  }
  val name = if (source == "gps" || looksLikeCoordinateLabel(rawName)) "Current Location" else rawName

  return CarPlace(name = name, lat = lat, lon = lon, source = if (source == "gps") "GPS" else source)
}

private fun looksLikeCoordinateLabel(value: String): Boolean {
  return Regex("""^\s*-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?\s*$""").matches(value)
}

private fun readLastKnownLocation(context: Context): CarPlace? {
  val fineGranted = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
  val coarseGranted = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
  if (!fineGranted && !coarseGranted) return null

  val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
  val providers = try {
    locationManager.getProviders(true)
  } catch (_: SecurityException) {
    return null
  }

  val best: Location = providers
    .mapNotNull { provider ->
      try {
        locationManager.getLastKnownLocation(provider)
      } catch (_: SecurityException) {
        null
      }
    }
    .maxByOrNull { it.time } ?: return null

  return CarPlace(
    name = "Current Location",
    lat = best.latitude,
    lon = best.longitude,
    source = "GPS",
  )
}

private fun readAsyncStorageValue(context: Context, key: String): String? {
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

private fun fetchCurrentWeather(place: CarPlace): CarWeatherReport {
  val url =
    "https://api.open-meteo.com/v1/forecast" +
      "?latitude=${place.lat}" +
      "&longitude=${place.lon}" +
      "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,visibility" +
      "&hourly=precipitation_probability" +
      "&daily=temperature_2m_max,temperature_2m_min" +
      "&temperature_unit=fahrenheit" +
      "&wind_speed_unit=mph"

  val conn = (URL(url).openConnection() as HttpURLConnection).apply {
    connectTimeout = 8000
    readTimeout = 8000
    requestMethod = "GET"
  }

  try {
    if (conn.responseCode !in 200..299) {
      throw IllegalStateException("Weather service returned ${conn.responseCode}.")
    }

    val body = conn.inputStream.bufferedReader().use { it.readText() }
    val root = JSONObject(body)
    val current = root.getJSONObject("current")
    val hourly = root.optJSONObject("hourly")
    val daily = root.optJSONObject("daily")
    val precipChance = hourly?.optJSONArray("precipitation_probability")?.optDouble(0, Double.NaN) ?: Double.NaN
    val alert = fetchWeatherAlert(place)

    return CarWeatherReport(
      placeName = place.name,
      locationSource = place.source,
      updatedLabel = "Updated just now",
      temperatureF = current.optDouble("temperature_2m", Double.NaN),
      feelsLikeF = current.optDouble("apparent_temperature", Double.NaN),
      highF = daily?.optJSONArray("temperature_2m_max")?.optDouble(0, Double.NaN) ?: Double.NaN,
      lowF = daily?.optJSONArray("temperature_2m_min")?.optDouble(0, Double.NaN) ?: Double.NaN,
      precipChancePct = precipChance,
      windMph = current.optDouble("wind_speed_10m", Double.NaN),
      windDirectionDeg = current.optDouble("wind_direction_10m", Double.NaN),
      visibilityMiles = metersToMiles(current.optDouble("visibility", Double.NaN)),
      weatherCode = current.optInt("weather_code", -1),
      alertTitle = alert?.title,
      alertSubtitle = alert?.subtitle,
    )
  } finally {
    conn.disconnect()
  }
}

private fun friendlyCarError(error: Exception): String {
  return when (error) {
    is UnknownHostException ->
      "Android Auto could not reach weather data yet. Check signal or tap Refresh once the connection settles."
    is IllegalStateException ->
      error.message ?: "Open OMNIwx on your phone once so Android Auto can use your active place."
    else ->
      "Weather did not load cleanly. Tap Refresh, or open OMNIwx on your phone if the car connection just started."
  }
}

private data class CarWeatherAlert(val title: String, val subtitle: String?)

private fun fetchWeatherAlert(place: CarPlace): CarWeatherAlert? {
  val url = "https://api.weather.gov/alerts/active?point=${place.lat},${place.lon}"
  val conn = (URL(url).openConnection() as HttpURLConnection).apply {
    connectTimeout = 7000
    readTimeout = 7000
    requestMethod = "GET"
    setRequestProperty("User-Agent", "OMNIwx Alpha Android Auto")
    setRequestProperty("Accept", "application/geo+json")
  }

  return try {
    if (conn.responseCode !in 200..299) return null
    val body = conn.inputStream.bufferedReader().use { it.readText() }
    val features = JSONObject(body).optJSONArray("features")
    val props = features?.optJSONObject(0)?.optJSONObject("properties") ?: return null
    val event = props.optString("event", "").ifBlank { "Active weather alert" }
    val expires = props.optString("ends", "").ifBlank { props.optString("expires", "") }
    val subtitle = if (expires.isBlank()) {
      props.optString("headline", "").ifBlank { null }
    } else {
      "In effect until ${formatAlertTime(expires)}"
    }
    CarWeatherAlert(event, subtitle)
  } catch (_: Exception) {
    null
  } finally {
    conn.disconnect()
  }
}

private fun Double.roundLabel(): String {
  if (!isFinite()) return "--"
  return roundToInt().toString()
}

private fun metersToMiles(meters: Double): Double {
  if (!meters.isFinite()) return Double.NaN
  return meters / 1609.344
}

private fun windDirectionLabel(degrees: Double): String {
  if (!degrees.isFinite()) return "--"
  val directions = arrayOf("N", "NE", "E", "SE", "S", "SW", "W", "NW")
  val index = (((degrees + 22.5) / 45.0).toInt() % 8).coerceIn(0, 7)
  return directions[index]
}

private fun alertSummaryRow(report: CarWeatherReport): Row {
  return if (report.alertTitle != null) {
    Row.Builder()
      .setTitle(report.alertTitle)
      .addText(report.alertSubtitle ?: "Active near ${report.placeName}")
      .build()
  } else {
    Row.Builder()
      .setTitle("No active alerts")
      .addText("No NWS alerts found for ${report.placeName}.")
      .build()
  }
}

private fun formatAlertTime(value: String): String {
  return try {
    val dt = OffsetDateTime.parse(value)
    dt.format(DateTimeFormatter.ofPattern("h:mm a"))
  } catch (_: Exception) {
    value
  }
}

private fun conditionSubtitle(code: Int): String {
  return when (code) {
    0 -> "Plenty of sunshine"
    1, 2 -> "Some clouds around"
    3 -> "Cloud cover in place"
    45, 48 -> "Reduced visibility"
    51, 53, 55, 56, 57 -> "Light precipitation possible"
    61, 63, 65, 66, 67 -> "Rain in the area"
    71, 73, 75, 77 -> "Snow in the area"
    80, 81, 82 -> "Showers nearby"
    85, 86 -> "Snow showers nearby"
    95, 96, 99 -> "Storms possible"
    else -> "Current conditions"
  }
}

private fun weatherCodeLabel(code: Int): String {
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
