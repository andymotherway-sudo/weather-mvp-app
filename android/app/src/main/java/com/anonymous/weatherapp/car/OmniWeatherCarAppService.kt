package com.anonymous.weatherapp.car

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.database.sqlite.SQLiteDatabase
import android.location.Location
import android.location.LocationManager
import android.os.Handler
import android.os.Looper
import androidx.car.app.CarAppService
import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.Session
import androidx.car.app.SessionInfo
import androidx.car.app.model.Action
import androidx.car.app.model.ActionStrip
import androidx.car.app.model.CarColor
import androidx.car.app.model.CarLocation
import androidx.car.app.model.ItemList
import androidx.car.app.model.ListTemplate
import androidx.car.app.model.Metadata
import androidx.car.app.model.Pane
import androidx.car.app.model.PaneTemplate
import androidx.car.app.model.Place
import androidx.car.app.model.PlaceListMapTemplate
import androidx.car.app.model.PlaceMarker
import androidx.car.app.model.Row
import androidx.car.app.model.Template
import androidx.car.app.validation.HostValidator
import androidx.core.content.ContextCompat
import java.net.HttpURLConnection
import java.net.UnknownHostException
import java.net.URL
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import kotlin.concurrent.thread
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt
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
  private lateinit var repository: CarWeatherRepository

  override fun onCreateScreen(intent: Intent): Screen {
    repository = CarWeatherRepository(carContext)
    return OmniWeatherHomeScreen(carContext, repository)
  }
}

private class CarWeatherRepository(private val context: Context) {
  @Volatile var loading: Boolean = false
  @Volatile var loaded: Boolean = false
  @Volatile var report: CarWeatherReport? = null
  @Volatile var error: String? = null

  private val mainHandler = Handler(Looper.getMainLooper())
  private val callbacks = mutableListOf<() -> Unit>()

  fun load(force: Boolean = false, onDone: () -> Unit) {
    var shouldStart = false
    var notifyNow = false

    synchronized(this) {
      if (loaded && !force) {
        notifyNow = true
      } else {
        callbacks.add(onDone)
        if (!loading) {
          loading = true
          error = null
          shouldStart = true
        }
      }
    }

    if (notifyNow) {
      notify(onDone)
      return
    }
    if (!shouldStart) return

    thread(name = "omniwx-car-weather") {
      try {
        val place = resolveCarPlace(context)
          ?: throw IllegalStateException("No GPS or saved OMNIwx place found.")
        report = fetchCurrentWeather(place)
        loaded = true
      } catch (e: Exception) {
        error = friendlyCarError(e)
        loaded = true
      } finally {
        loading = false
        val pending = synchronized(this) {
          val copy = callbacks.toList()
          callbacks.clear()
          copy
        }
        pending.forEach { notify(it) }
      }
    }
  }

  private fun notify(callback: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) {
      callback()
    } else {
      mainHandler.post { callback() }
    }
  }
}

private abstract class OmniWeatherBaseScreen(
  carContext: CarContext,
  protected val repository: CarWeatherRepository
) : Screen(carContext) {
  protected fun ensureLoaded(force: Boolean = false) {
    repository.load(force) { invalidate() }
  }

  protected fun refreshAction(): Action {
    return Action.Builder()
      .setTitle("Refresh")
      .setBackgroundColor(CarColor.BLUE)
      .setOnClickListener {
        repository.load(force = true) { invalidate() }
        invalidate()
      }
      .build()
  }

  protected fun loadingOrErrorTemplate(title: String): Template? {
    val pane = Pane.Builder()
    when {
      repository.loading -> pane.addRow(Row.Builder().setTitle("Loading weather").addText("Connecting to your OMNIwx location.").build())
      repository.report == null && repository.error != null -> pane.addRow(Row.Builder().setTitle("Weather is still connecting").addText(repository.error ?: "Tap Refresh after the car connection settles.").build())
      repository.report == null -> pane.addRow(Row.Builder().setTitle("Location unavailable").addText("Open OMNIwx once on your phone or allow location access.").build())
      else -> return null
    }
    return PaneTemplate.Builder(pane.build())
      .setTitle(title)
      .setHeaderAction(Action.BACK)
      .setActionStrip(ActionStrip.Builder().addAction(refreshAction()).build())
      .build()
  }
}

private class OmniWeatherHomeScreen(carContext: CarContext, repository: CarWeatherRepository) : OmniWeatherBaseScreen(carContext, repository) {
  override fun onGetTemplate(): Template {
    ensureLoaded()
    val current = repository.report
    val list = ItemList.Builder()

    if (current != null) {
      list.addItem(Row.Builder()
        .setTitle("Current")
        .addText("${current.temperatureF.roundLabel()}F - ${weatherCodeLabel(current.weatherCode)} - feels ${current.feelsLikeF.roundLabel()}F")
        .addText("Wind ${windDirectionLabel(current.windDirectionDeg)} ${current.windMph.roundLabel()} mph - precip ${current.precipChancePct.roundLabel()}%")
        .setOnClickListener { repository.load(force = true) { invalidate() } }
        .build())
      list.addItem(Row.Builder()
        .setTitle("SkyScore")
        .addText("${current.skyScore?.score ?: "--"} ${current.skyScore?.label ?: "Pending"}")
        .addText(current.skyScore?.bestWindow?.let { "Best $it" } ?: "Open sky details")
        .setOnClickListener { screenManager.push(OmniWeatherSkyScoreScreen(carContext, repository)) }
        .build())
      list.addItem(Row.Builder()
        .setTitle("Alerts")
        .addText(current.alertTitle ?: "No active alerts")
        .addText(current.alertSubtitle ?: "No NWS alerts found near ${current.placeName}.")
        .setOnClickListener { screenManager.push(OmniWeatherAlertsScreen(carContext, repository)) }
        .build())
      list.addItem(Row.Builder()
        .setTitle("Forecast")
        .addText(current.forecastHomeSummary())
        .addText("5-day outlook")
        .setOnClickListener { screenManager.push(OmniWeatherFiveDayScreen(carContext, repository)) }
        .build())
      list.addItem(Row.Builder()
        .setTitle("Next 24 hours")
        .addText(current.hourlyHomeSummary())
        .addText(current.hourlyTrendSummary())
        .setOnClickListener { screenManager.push(OmniWeatherHourlyScreen(carContext, repository)) }
        .build())
      list.addItem(Row.Builder()
        .setTitle("Map / Radar")
        .addText("Nearest NEXRAD ${current.nearestRadar.id} - ${current.nearestRadarDistanceMi.roundLabel()} mi")
        .addText("Open nearby weather map")
        .setOnClickListener { screenManager.push(OmniWeatherMapScreen(carContext, repository)) }
        .build())
    } else if (repository.loading) {
      list.addItem(Row.Builder().setTitle("Loading weather").addText("Connecting to your OMNIwx location.").build())
    } else if (repository.error != null) {
      list.addItem(Row.Builder().setTitle("Weather is still connecting").addText(repository.error ?: "Tap Refresh after the car connection settles.").build())
    } else {
      list.addItem(Row.Builder().setTitle("Location unavailable").addText("Open OMNIwx once on your phone or allow location access.").build())
    }

    return ListTemplate.Builder()
      .setSingleList(list.build())
      .setTitle(current?.let { "OMNIwx - ${it.placeName}" } ?: "OMNIwx")
      .setHeaderAction(Action.APP_ICON)
      .setActionStrip(ActionStrip.Builder().addAction(refreshAction()).build())
      .build()
  }
}

private class OmniWeatherFiveDayScreen(carContext: CarContext, repository: CarWeatherRepository) : OmniWeatherBaseScreen(carContext, repository) {
  override fun onGetTemplate(): Template {
    ensureLoaded()
    loadingOrErrorTemplate("5-day Forecast")?.let { return it }
    val current = repository.report!!
    val list = ItemList.Builder()
    current.daily.take(5).forEach { day ->
      list.addItem(Row.Builder()
        .setTitle(day.label)
        .addText("${day.highF.roundLabel()} / ${day.lowF.roundLabel()} - ${weatherCodeLabel(day.weatherCode)}")
        .addText("Precip ${day.precipChancePct.roundLabel()}%")
        .build())
    }
    if (current.daily.isEmpty()) list.addItem(Row.Builder().setTitle("Forecast loading").addText("Tap Refresh if the car connection just started.").build())
    return ListTemplate.Builder()
      .setSingleList(list.build())
      .setTitle("5-day Forecast")
      .setHeaderAction(Action.BACK)
      .setActionStrip(ActionStrip.Builder().addAction(refreshAction()).build())
      .build()
  }
}

private class OmniWeatherHourlyScreen(carContext: CarContext, repository: CarWeatherRepository) : OmniWeatherBaseScreen(carContext, repository) {
  override fun onGetTemplate(): Template {
    ensureLoaded()
    loadingOrErrorTemplate("24-hour Forecast")?.let { return it }
    val current = repository.report!!
    val list = ItemList.Builder()
    listOf(0, 3, 6, 9, 12, 18, 23).mapNotNull { current.hourly.getOrNull(it) }.forEach { hour ->
      list.addItem(Row.Builder()
        .setTitle(hour.label)
        .addText("${hour.temperatureF.roundLabel()}F - ${weatherCodeLabel(hour.weatherCode)}")
        .addText("Precip ${hour.precipChancePct.roundLabel()}% - wind ${hour.windMph.roundLabel()} mph")
        .build())
    }
    if (current.hourly.isEmpty()) list.addItem(Row.Builder().setTitle("Hourly forecast loading").addText("Tap Refresh if the car connection just started.").build())
    return ListTemplate.Builder()
      .setSingleList(list.build())
      .setTitle("24-hour Forecast")
      .setHeaderAction(Action.BACK)
      .setActionStrip(ActionStrip.Builder().addAction(refreshAction()).build())
      .build()
  }
}

private class OmniWeatherAlertsScreen(carContext: CarContext, repository: CarWeatherRepository) : OmniWeatherBaseScreen(carContext, repository) {
  override fun onGetTemplate(): Template {
    ensureLoaded()
    loadingOrErrorTemplate("Alerts")?.let { return it }
    val current = repository.report!!
    val pane = Pane.Builder()
    if (current.alertTitle != null) {
      pane.addRow(Row.Builder()
        .setTitle(current.alertTitle)
        .addText(current.alertSubtitle ?: "Active near ${current.placeName}.")
        .addText("Open OMNIwx on phone for full NWS text.")
        .build())
    } else {
      pane.addRow(Row.Builder()
        .setTitle("No active alerts")
        .addText("No NWS alerts found for ${current.placeName}.")
        .build())
    }
    return PaneTemplate.Builder(pane.build())
      .setTitle("Alerts")
      .setHeaderAction(Action.BACK)
      .setActionStrip(ActionStrip.Builder().addAction(refreshAction()).build())
      .build()
  }
}

private class OmniWeatherSkyScoreScreen(carContext: CarContext, repository: CarWeatherRepository) : OmniWeatherBaseScreen(carContext, repository) {
  override fun onGetTemplate(): Template {
    ensureLoaded()
    loadingOrErrorTemplate("SkyScore")?.let { return it }
    val current = repository.report!!
    val sky = current.skyScore ?: placeholderSkyScoreFromWeather(current)
    val pane = Pane.Builder()
      .addRow(Row.Builder().setTitle("SkyScore ${sky.score} - ${sky.label}").addText(sky.bestWindow?.let { "Best window: $it" } ?: "Best window pending").build())
      .addRow(Row.Builder().setTitle("Why").addText(sky.summary ?: "Based on cloud cover, visibility, and current weather.").build())
      .addRow(Row.Builder().setTitle("Driver-safe note").addText("Open OMNIwx on phone for the full astronomy map.").build())
      .build()
    return PaneTemplate.Builder(pane)
      .setTitle("SkyScore")
      .setHeaderAction(Action.BACK)
      .setActionStrip(ActionStrip.Builder().addAction(refreshAction()).build())
      .build()
  }
}

private class OmniWeatherMapScreen(carContext: CarContext, repository: CarWeatherRepository) : OmniWeatherBaseScreen(carContext, repository) {
  override fun onGetTemplate(): Template {
    ensureLoaded()
    loadingOrErrorTemplate("Weather Map")?.let { return it }
    val current = repository.report!!
    return try {
      buildPlaceListMapTemplate(current)
    } catch (_: Throwable) {
      buildMapFallbackTemplate(current)
    }
  }

  private fun buildPlaceListMapTemplate(report: CarWeatherReport): Template {
    val list = ItemList.Builder()
      .addItem(weatherPoiRow("Current Location", "${report.temperatureF.roundLabel()}F - ${weatherCodeLabel(report.weatherCode)}", report.latitude, report.longitude, "WX") {
        screenManager.push(OmniWeatherHomeScreen(carContext, repository))
      })
      .addItem(weatherPoiRow("Radar: ${report.nearestRadar.id}", "Nearest NEXRAD - ${report.nearestRadarDistanceMi.roundLabel()} mi", report.nearestRadar.lat, report.nearestRadar.lon, "R") {
        screenManager.push(OmniWeatherMapScreen(carContext, repository))
      })
      .addItem(weatherPoiRow("Alerts", report.alertTitle ?: "No active alerts", report.latitude, report.longitude, "!") {
        screenManager.push(OmniWeatherAlertsScreen(carContext, repository))
      })
      .addItem(weatherPoiRow("SkyScore", "${report.skyScore?.score ?: "--"} ${report.skyScore?.label ?: "Pending"} - best ${report.skyScore?.bestWindow ?: "later"}", report.latitude, report.longitude, "S") {
        screenManager.push(OmniWeatherSkyScoreScreen(carContext, repository))
      })
      .addItem(weatherPoiRow("Forecast Area", "5-day and 24-hour forecast", report.latitude, report.longitude, "F") {
        screenManager.push(OmniWeatherFiveDayScreen(carContext, repository))
      })
      .build()

    return PlaceListMapTemplate.Builder()
      .setTitle("Weather Map")
      .setHeaderAction(Action.BACK)
      .setCurrentLocationEnabled(true)
      .setAnchor(placeFor(report.latitude, report.longitude, "WX"))
      .setItemList(list)
      .setActionStrip(ActionStrip.Builder().addAction(refreshAction()).build())
      .build()
  }

  private fun buildMapFallbackTemplate(report: CarWeatherReport): Template {
    val list = ItemList.Builder()
      .addItem(Row.Builder().setTitle("Current Location").addText("${report.temperatureF.roundLabel()}F - ${weatherCodeLabel(report.weatherCode)}").build())
      .addItem(Row.Builder().setTitle("Radar: ${report.nearestRadar.id}").addText("Nearest NEXRAD - ${report.nearestRadarDistanceMi.roundLabel()} mi").build())
      .addItem(Row.Builder().setTitle("Alerts").addText(report.alertTitle ?: "No active alerts").build())
      .addItem(Row.Builder().setTitle("SkyScore").addText("${report.skyScore?.score ?: "--"} ${report.skyScore?.label ?: "Pending"}").build())
      .addItem(Row.Builder().setTitle("Forecast Area").addText("5-day and 24-hour forecast").build())
      .build()
    return ListTemplate.Builder()
      .setSingleList(list)
      .setTitle("Weather Map")
      .setHeaderAction(Action.BACK)
      .setActionStrip(ActionStrip.Builder().addAction(refreshAction()).build())
      .build()
  }
}

private fun weatherPoiRow(title: String, subtitle: String, lat: Double, lon: Double, marker: String, onClick: () -> Unit): Row {
  return Row.Builder()
    .setTitle(title)
    .addText(subtitle)
    .setMetadata(Metadata.Builder().setPlace(placeFor(lat, lon, marker)).build())
    .setOnClickListener(onClick)
    .build()
}

private fun placeFor(lat: Double, lon: Double, marker: String): Place {
  return Place.Builder(CarLocation.create(lat, lon))
    .setMarker(PlaceMarker.Builder().setLabel(marker).build())
    .build()
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
  val latitude: Double,
  val longitude: Double,
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
  val hourly: List<CarHourlyForecast>,
  val daily: List<CarDailyForecast>,
  val nearestRadar: NexradSite,
  val nearestRadarDistanceMi: Double,
  val skyScore: CarSkyScore?,
)

private data class CarSkyScore(
  val score: Int,
  val label: String,
  val bestWindow: String?,
  val summary: String?,
)

private data class CarHourlyForecast(
  val label: String,
  val temperatureF: Double,
  val precipChancePct: Double,
  val windMph: Double,
  val weatherCode: Int,
)

private data class CarDailyForecast(
  val label: String,
  val highF: Double,
  val lowF: Double,
  val precipChancePct: Double,
  val weatherCode: Int,
)

private data class NexradSite(
  val id: String,
  val name: String,
  val lat: Double,
  val lon: Double,
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
      "&hourly=temperature_2m,weather_code,precipitation_probability,wind_speed_10m" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
      "&temperature_unit=fahrenheit" +
      "&wind_speed_unit=mph" +
      "&timezone=auto" +
      "&forecast_days=5"

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
    val nearestRadar = nearestNexradSite(place.lat, place.lon)

    val baseReport = CarWeatherReport(
      placeName = place.name,
      locationSource = place.source,
      updatedLabel = "Updated just now",
      latitude = place.lat,
      longitude = place.lon,
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
      hourly = parseHourlyForecast(hourly),
      daily = parseDailyForecast(daily),
      nearestRadar = nearestRadar,
      nearestRadarDistanceMi = haversineMiles(place.lat, place.lon, nearestRadar.lat, nearestRadar.lon),
      skyScore = null,
    )
    return baseReport.copy(skyScore = computeCarSkyScore(baseReport))
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

private fun parseHourlyForecast(hourly: JSONObject?): List<CarHourlyForecast> {
  if (hourly == null) return emptyList()
  val times = hourly.optJSONArray("time") ?: return emptyList()
  val temps = hourly.optJSONArray("temperature_2m")
  val weatherCodes = hourly.optJSONArray("weather_code")
  val precip = hourly.optJSONArray("precipitation_probability")
  val wind = hourly.optJSONArray("wind_speed_10m")
  val count = minOf(times.length(), 24)

  return (0 until count).map { idx ->
    CarHourlyForecast(
      label = formatOpenMeteoHour(times.optString(idx, "")),
      temperatureF = temps?.optDouble(idx, Double.NaN) ?: Double.NaN,
      precipChancePct = precip?.optDouble(idx, Double.NaN) ?: Double.NaN,
      windMph = wind?.optDouble(idx, Double.NaN) ?: Double.NaN,
      weatherCode = weatherCodes?.optInt(idx, -1) ?: -1,
    )
  }
}

private fun parseDailyForecast(daily: JSONObject?): List<CarDailyForecast> {
  if (daily == null) return emptyList()
  val times = daily.optJSONArray("time") ?: return emptyList()
  val highs = daily.optJSONArray("temperature_2m_max")
  val lows = daily.optJSONArray("temperature_2m_min")
  val weatherCodes = daily.optJSONArray("weather_code")
  val precip = daily.optJSONArray("precipitation_probability_max")
  val count = minOf(times.length(), 5)

  return (0 until count).map { idx ->
    CarDailyForecast(
      label = formatOpenMeteoDay(times.optString(idx, ""), idx),
      highF = highs?.optDouble(idx, Double.NaN) ?: Double.NaN,
      lowF = lows?.optDouble(idx, Double.NaN) ?: Double.NaN,
      precipChancePct = precip?.optDouble(idx, Double.NaN) ?: Double.NaN,
      weatherCode = weatherCodes?.optInt(idx, -1) ?: -1,
    )
  }
}

private fun CarWeatherReport.forecastHomeSummary(): String {
  val today = daily.getOrNull(0)
  val tomorrow = daily.getOrNull(1)
  if (today == null) return "Forecast details are loading."
  val todayText = "Today ${today.highF.roundLabel()}/${today.lowF.roundLabel()}"
  val tomorrowText = tomorrow?.let { "Tomorrow ${it.highF.roundLabel()}/${it.lowF.roundLabel()}" }
  return listOfNotNull(todayText, tomorrowText).joinToString(" - ")
}

private fun CarWeatherReport.hourlyHomeSummary(): String {
  if (hourly.isEmpty()) return "Hourly data is loading."
  return listOf(0, 3, 6).mapNotNull { hourly.getOrNull(it) }.joinToString(" - ") {
    "${it.label} ${it.temperatureF.roundLabel()}F"
  }
}

private fun CarWeatherReport.hourlyTrendSummary(): String {
  if (hourly.isEmpty()) return "Tap Refresh if the car connection just started."
  val maxPop = hourly.mapNotNull { if (it.precipChancePct.isFinite()) it.precipChancePct else null }.maxOrNull()
  val maxWind = hourly.mapNotNull { if (it.windMph.isFinite()) it.windMph else null }.maxOrNull()
  val dominant = hourly.groupingBy { weatherCodeLabel(it.weatherCode) }.eachCount().maxByOrNull { it.value }?.key ?: "conditions"
  return "Peak precip ${maxPop?.roundToInt()?.toString() ?: "--"}% - wind up to ${maxWind?.roundToInt()?.toString() ?: "--"} mph - $dominant"
}

private fun computeCarSkyScore(report: CarWeatherReport): CarSkyScore {
  return placeholderSkyScoreFromWeather(report)
}

private fun placeholderSkyScoreFromWeather(report: CarWeatherReport): CarSkyScore {
  var score = 80
  score -= when (report.weatherCode) {
    0 -> 0
    1, 2 -> 8
    3 -> 22
    45, 48 -> 30
    51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82 -> 34
    71, 73, 75, 77, 85, 86 -> 38
    95, 96, 99 -> 44
    else -> 12
  }
  if (report.visibilityMiles.isFinite()) {
    score -= when {
      report.visibilityMiles < 2.0 -> 28
      report.visibilityMiles < 5.0 -> 16
      report.visibilityMiles < 8.0 -> 8
      else -> 0
    }
  }
  score = score.coerceIn(0, 100)
  val label = when {
    score >= 80 -> "Good"
    score >= 60 -> "Fair"
    else -> "Poor"
  }
  val bestWindow = if (score >= 60) "9 PM-12 AM" else null
  val summary = when {
    score >= 80 -> "Clear skies and visibility look good."
    score >= 60 -> "Some clouds or haze may limit sky quality."
    else -> "Clouds, weather, or visibility may limit observing."
  }
  return CarSkyScore(score, label, bestWindow, summary)
}

private fun formatOpenMeteoHour(value: String): String {
  val hour = value.substringAfter("T", "").take(2).toIntOrNull() ?: return "--"
  val hour12 = ((hour + 11) % 12) + 1
  val suffix = if (hour >= 12) "PM" else "AM"
  return "$hour12 $suffix"
}

private fun formatOpenMeteoDay(value: String, idx: Int): String {
  if (idx == 0) return "Today"
  if (idx == 1) return "Tomorrow"
  return try {
    val odt = java.time.LocalDate.parse(value)
    odt.dayOfWeek.name.take(3).lowercase().replaceFirstChar { it.uppercase() }
  } catch (_: Exception) {
    "Day ${idx + 1}"
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

private val CAR_NEXRAD_SITES = listOf(
  NexradSite("KABX", "Albuquerque", 35.1497, -106.8239),
  NexradSite("KAMA", "Amarillo", 35.2333, -101.7093),
  NexradSite("KATX", "Seattle", 48.1946, -122.4957),
  NexradSite("KBBX", "Beale AFB", 39.4961, -121.6317),
  NexradSite("KBLX", "Billings", 45.8538, -108.6068),
  NexradSite("KBMX", "Birmingham", 33.1719, -86.7697),
  NexradSite("KBOI", "Boise", 43.4902, -116.2360),
  NexradSite("KBOX", "Boston", 41.9558, -71.1369),
  NexradSite("KBRO", "Brownsville", 25.9160, -97.4190),
  NexradSite("KBUF", "Buffalo", 42.9488, -78.7368),
  NexradSite("KBYX", "Key West", 24.5975, -81.7032),
  NexradSite("KCBW", "Caribou", 46.0392, -67.8064),
  NexradSite("KCBX", "Boise", 43.4902, -116.2360),
  NexradSite("KCCX", "State College", 40.9231, -78.0039),
  NexradSite("KCLE", "Cleveland", 41.4131, -81.8597),
  NexradSite("KCLX", "Charleston", 32.6556, -81.0422),
  NexradSite("KCRP", "Corpus Christi", 27.7840, -97.5112),
  NexradSite("KCYS", "Cheyenne", 41.1519, -104.8060),
  NexradSite("KDDC", "Dodge City", 37.7608, -99.9688),
  NexradSite("KDFX", "Laughlin AFB", 29.2731, -100.2803),
  NexradSite("KDGX", "Jackson", 32.2799, -89.9844),
  NexradSite("KDIX", "Philadelphia", 39.9471, -74.4108),
  NexradSite("KDLH", "Duluth", 46.8369, -92.2102),
  NexradSite("KDMX", "Des Moines", 41.7312, -93.7229),
  NexradSite("KDOX", "Dover", 38.8258, -75.4400),
  NexradSite("KDTX", "Detroit", 42.6999, -83.4717),
  NexradSite("KDVN", "Quad Cities", 41.6116, -90.5808),
  NexradSite("KDYX", "Dyess AFB", 32.5384, -99.2540),
  NexradSite("KEAX", "Kansas City", 38.8102, -94.2645),
  NexradSite("KEMX", "Tucson", 31.8937, -110.6303),
  NexradSite("KENX", "Albany", 42.5866, -74.0641),
  NexradSite("KEPZ", "El Paso", 31.8731, -106.6980),
  NexradSite("KESX", "Las Vegas", 35.7013, -114.8919),
  NexradSite("KEVX", "Eglin AFB", 30.5650, -85.9211),
  NexradSite("KEWX", "Austin/San Antonio", 29.7039, -98.0286),
  NexradSite("KEYX", "Edwards AFB", 35.0979, -117.5608),
  NexradSite("KFCX", "Roanoke", 37.0242, -80.2739),
  NexradSite("KFDR", "Frederick", 34.3620, -98.9767),
  NexradSite("KFDX", "Cannon AFB", 34.6353, -103.6294),
  NexradSite("KFFC", "Atlanta", 33.3636, -84.5659),
  NexradSite("KFSD", "Sioux Falls", 43.5878, -96.7294),
  NexradSite("KFSX", "Flagstaff", 34.5744, -111.1985),
  NexradSite("KFTG", "Denver", 39.7866, -104.5458),
  NexradSite("KFWS", "Dallas/Fort Worth", 32.5730, -97.3031),
  NexradSite("KGGW", "Glasgow", 48.2064, -106.6259),
  NexradSite("KGJX", "Grand Junction", 39.0622, -108.2138),
  NexradSite("KGLD", "Goodland", 39.3669, -101.7004),
  NexradSite("KGRB", "Green Bay", 44.4986, -88.1111),
  NexradSite("KGRK", "Fort Hood", 30.7218, -97.3832),
  NexradSite("KGRR", "Grand Rapids", 42.8939, -85.5449),
  NexradSite("KGSP", "Greer", 34.8833, -82.2201),
  NexradSite("KGWX", "Columbus AFB", 33.8969, -88.3292),
  NexradSite("KGYX", "Portland", 43.8913, -70.2564),
  NexradSite("KHDX", "Holloman AFB", 33.0763, -106.1201),
  NexradSite("KHGX", "Houston", 29.4719, -95.0792),
  NexradSite("KHNX", "Hanford", 36.3142, -119.6321),
  NexradSite("KHPX", "Fort Campbell", 36.7367, -87.2850),
  NexradSite("KHTX", "Huntsville", 34.9306, -86.0836),
  NexradSite("KICT", "Wichita", 37.6544, -97.4431),
  NexradSite("KICX", "Cedar City", 37.5906, -112.8622),
  NexradSite("KILN", "Cincinnati", 39.4203, -83.8217),
  NexradSite("KILX", "Lincoln", 40.1505, -89.3368),
  NexradSite("KIND", "Indianapolis", 39.7075, -86.2804),
  NexradSite("KINX", "Tulsa", 36.1751, -95.5641),
  NexradSite("KIWA", "Phoenix", 33.2892, -111.6690),
  NexradSite("KIWX", "Northern Indiana", 41.3586, -85.7000),
  NexradSite("KJAX", "Jacksonville", 30.4846, -81.7019),
  NexradSite("KJGX", "Robins AFB", 32.6750, -83.3511),
  NexradSite("KJKL", "Jackson", 37.5908, -83.3130),
  NexradSite("KLBB", "Lubbock", 33.6541, -101.8141),
  NexradSite("KLCH", "Lake Charles", 30.1253, -93.2159),
  NexradSite("KLGX", "Langley Hill", 47.1169, -124.1066),
  NexradSite("KLIX", "New Orleans", 30.3367, -89.8254),
  NexradSite("KLNX", "North Platte", 41.9579, -100.5764),
  NexradSite("KLOT", "Chicago", 41.6044, -88.0846),
  NexradSite("KLRX", "Elko", 40.7397, -116.8028),
  NexradSite("KLSX", "St Louis", 38.6989, -90.6828),
  NexradSite("KLTX", "Wilmington", 33.9891, -78.4291),
  NexradSite("KLVX", "Louisville", 37.9753, -85.9439),
  NexradSite("KLWX", "Sterling", 38.9754, -77.4778),
  NexradSite("KLZK", "Little Rock", 34.8365, -92.2622),
  NexradSite("KMAF", "Midland", 31.9434, -102.1893),
  NexradSite("KMAX", "Medford", 42.0812, -122.7173),
  NexradSite("KMBX", "Minot", 48.3925, -100.8644),
  NexradSite("KMHX", "Morehead City", 34.7759, -76.8763),
  NexradSite("KMKX", "Milwaukee", 42.9679, -88.5506),
  NexradSite("KMLB", "Melbourne", 28.1131, -80.6541),
  NexradSite("KMOB", "Mobile", 30.6795, -88.2397),
  NexradSite("KMPX", "Minneapolis", 44.8489, -93.5655),
  NexradSite("KMQT", "Marquette", 46.5311, -87.5487),
  NexradSite("KMRX", "Knoxville", 36.1686, -83.4019),
  NexradSite("KMSX", "Missoula", 47.0410, -113.9862),
  NexradSite("KMTX", "Salt Lake City", 41.2628, -112.4478),
  NexradSite("KMUX", "San Francisco", 37.1552, -121.8984),
  NexradSite("KMVX", "Grand Forks", 47.5279, -97.3257),
  NexradSite("KMXX", "Maxwell AFB", 32.5367, -85.7897),
  NexradSite("KNKX", "San Diego", 32.9189, -117.0419),
  NexradSite("KNQA", "Memphis", 35.3447, -89.8733),
  NexradSite("KOAX", "Omaha", 41.3203, -96.3668),
  NexradSite("KOHX", "Nashville", 36.2472, -86.5625),
  NexradSite("KOKX", "New York City", 40.8655, -72.8645),
  NexradSite("KOTX", "Spokane", 47.6804, -117.6267),
  NexradSite("KPAH", "Paducah", 37.0684, -88.7720),
  NexradSite("KPBZ", "Pittsburgh", 40.5317, -80.2181),
  NexradSite("KPDT", "Pendleton", 45.6906, -118.8529),
  NexradSite("KPOE", "Fort Polk", 31.1558, -92.9758),
  NexradSite("KPUX", "Pueblo", 38.4595, -104.1814),
  NexradSite("KRAX", "Raleigh", 35.6655, -78.4898),
  NexradSite("KRGX", "Reno", 39.7542, -119.4622),
  NexradSite("KRIW", "Riverton", 43.0661, -108.4773),
  NexradSite("KRLX", "Charleston WV", 38.3111, -81.7230),
  NexradSite("KRTX", "Portland", 45.7150, -122.9650),
  NexradSite("KSFX", "Pocatello", 43.1056, -112.6861),
  NexradSite("KSGF", "Springfield", 37.2352, -93.4005),
  NexradSite("KSHV", "Shreveport", 32.4508, -93.8413),
  NexradSite("KSJT", "San Angelo", 31.3713, -100.4925),
  NexradSite("KSOX", "Santa Ana", 33.8177, -117.6359),
  NexradSite("KSRX", "Fort Smith", 35.2904, -94.3619),
  NexradSite("KTBW", "Tampa Bay", 27.7055, -82.4018),
  NexradSite("KTFX", "Great Falls", 47.4597, -111.3853),
  NexradSite("KTLH", "Tallahassee", 30.3975, -84.3289),
  NexradSite("KTLX", "Oklahoma City", 35.3331, -97.2778),
  NexradSite("KTWX", "Topeka", 38.9969, -96.2325),
  NexradSite("KTYX", "Fort Drum", 43.7558, -75.6800),
  NexradSite("KUDX", "Rapid City", 44.1250, -102.8300),
  NexradSite("KUEX", "Hastings", 40.3208, -98.4419),
  NexradSite("KVAX", "Moody AFB", 30.8904, -83.0018),
  NexradSite("KVBX", "Vandenberg", 34.8383, -120.3978),
  NexradSite("KVNX", "Vance AFB", 36.7408, -98.1278),
  NexradSite("KVTX", "Los Angeles", 34.4116, -119.1795),
  NexradSite("KYUX", "Yuma", 32.4953, -114.6567)
)

private fun nearestNexradSite(lat: Double, lon: Double): NexradSite {
  return CAR_NEXRAD_SITES.minByOrNull { haversineMiles(lat, lon, it.lat, it.lon) } ?: CAR_NEXRAD_SITES.first()
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
