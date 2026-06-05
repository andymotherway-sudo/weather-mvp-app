package com.anonymous.weatherapp.widget

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
import android.net.Uri
import com.anonymous.weatherapp.MainActivity
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt
import org.json.JSONArray
import org.json.JSONObject

private const val PLACE_STORAGE_KEY = "omniwx.place.v2"
private const val DEFAULT_CITY_STORAGE_KEY = "omniwx:profile:defaultCity"
private const val AVIATION_WIDGET_SELECTION_KEY = "omniwx:widget:aviation:selected:v1"
private const val CLIMO_CACHE_PREFIX = "omniwx:climo:v8"
private const val RECORDS_CACHE_PREFIX = "omniwx:records:v10"
private const val SKY_SCORE_CACHE_PREFIX = "omniwx:skyScore:v1"
private const val OMNIWX_API_BASE = "https://omniwx-api.omniwx.workers.dev"

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
  val visibilityMiles: Double,
  val humidityPct: Double,
  val cloudPct: Double,
  val weatherCode: Int,
  val updatedLabel: String,
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

  fun openIntent(context: Context, route: String): PendingIntent {
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
    val intent = Intent(context, OmniwxWidgetRefreshReceiver::class.java).apply {
      action = ACTION_REFRESH_WIDGETS
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
    readAsyncStorageValue(context, PLACE_STORAGE_KEY)?.let { raw ->
      runCatching {
        val root = JSONObject(raw)
        val active = root.optJSONObject("active")
        if (active != null) return placeFromJson(active)
      }
    }

    readAsyncStorageValue(context, DEFAULT_CITY_STORAGE_KEY)?.let { raw ->
      runCatching {
        return placeFromJson(JSONObject(raw))
      }
    }

    return null
  }

  fun fetchWeather(place: WidgetPlace): WidgetWeather {
    val url =
      "https://api.open-meteo.com/v1/forecast" +
        "?latitude=${place.lat}" +
        "&longitude=${place.lon}" +
        "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,visibility,relative_humidity_2m,cloud_cover" +
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
      visibilityMiles = metersToMiles(current.optDouble("visibility", Double.NaN)),
      humidityPct = current.optDouble("relative_humidity_2m", Double.NaN),
      cloudPct = current.optDouble("cloud_cover", Double.NaN),
      weatherCode = current.optInt("weather_code", -1),
      updatedLabel = nowLabel(),
    )
  }

  fun skyScore(weather: WidgetWeather): WidgetSkyScore {
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
    val place = readPlace(context) ?: return null
    readSkyScoreCache(context, place)?.let { return it }
    val url = "$OMNIWX_API_BASE/api/astro/inspect?lat=${place.lat}&lon=${place.lon}&hour=0"
    val root = fetchJsonObject(url, "OMNIwx Alpha Android Widget")
    return skyScoreFromInspectJson(root)?.copy(aurora = "Updated ${nowLabel()}")
  }

  fun fetchNearestMetar(place: WidgetPlace): WidgetMetar? {
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
    val place = readPlace(context) ?: return null
    val records = readTodayRecordsCache(context)
    val cached = readClimoCache(context, place)
    if (cached != null) return cached.withRecords(records)

    val url = "$OMNIWX_API_BASE/api/almanac/climo?lat=${place.lat}&lon=${place.lon}"
    val root = fetchJsonObject(url, "OMNIwx Alpha Android Widget")
    return climoFromJson(place, root)?.withRecords(records)
  }

  fun weatherIconBitmap(code: Int): Bitmap {
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
    val highs = climo?.monthlyHighsF.orEmpty().mapNotNull { it?.takeIf { value -> value.isFinite() } }
    val lows = climo?.monthlyLowsF.orEmpty().mapNotNull { it?.takeIf { value -> value.isFinite() } }
    if (highs.isEmpty() || lows.isEmpty()) return "Seasonal range --"
    val winterLow = lows.minOrNull() ?: return "Seasonal range --"
    val summerHigh = highs.maxOrNull() ?: return "Seasonal range --"
    return "Seasonal spread ${(summerHigh - winterLow).roundToInt()}°"
  }

  fun radarSnapshotBitmap(place: WidgetPlace?, weather: WidgetWeather?): Bitmap {
    place?.let { fetchRadarTileComposite(it) }?.let { return it }

    val bitmap = Bitmap.createBitmap(720, 360, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val bg = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(5, 17, 36)
      style = Paint.Style.FILL
    }
    canvas.drawRect(0f, 0f, 720f, 360f, bg)
    val grid = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(56, 189, 248)
      alpha = 54
      strokeWidth = 2f
    }
    for (x in 0..720 step 72) canvas.drawLine(x.toFloat(), 0f, x.toFloat(), 360f, grid)
    for (y in 0..360 step 60) canvas.drawLine(0f, y.toFloat(), 720f, y.toFloat(), grid)
    val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(34, 211, 238)
      alpha = 92
      style = Paint.Style.STROKE
      strokeWidth = 4f
    }
    val cx = 360f
    val cy = 180f
    listOf(54f, 108f, 162f).forEach { canvas.drawCircle(cx, cy, it, ring) }
    val dot = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(56, 189, 248)
      style = Paint.Style.FILL
    }
    canvas.drawCircle(cx, cy, 12f, dot)
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
    } else {
      val clear = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(148, 163, 184)
        alpha = 92
        textSize = 28f
        typeface = android.graphics.Typeface.DEFAULT_BOLD
      }
      canvas.drawText("No nearby precip signal", 226f, 320f, clear)
    }
    return bitmap
  }

  private fun fetchRadarTileComposite(place: WidgetPlace): Bitmap? {
    return runCatching {
      val bitmap = Bitmap.createBitmap(720, 360, Bitmap.Config.ARGB_8888)
      val canvas = Canvas(bitmap)
      val background = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(5, 17, 36)
        style = Paint.Style.FILL
      }
      canvas.drawRect(0f, 0f, 720f, 360f, background)

      val zoom = 7
      val tileSize = 256.0
      val center = lonLatToTilePoint(place.lon, place.lat, zoom)
      val centerPxX = center.x * tileSize
      val centerPxY = center.y * tileSize
      val topLeftPxX = centerPxX - 360.0
      val topLeftPxY = centerPxY - 180.0
      val minTileX = kotlin.math.floor(topLeftPxX / tileSize).toInt()
      val maxTileX = kotlin.math.floor((topLeftPxX + 720.0) / tileSize).toInt()
      val minTileY = kotlin.math.floor(topLeftPxY / tileSize).toInt()
      val maxTileY = kotlin.math.floor((topLeftPxY + 360.0) / tileSize).toInt()
      val tileMax = 1 shl zoom

      fun drawTileLayer(template: String, alpha: Int) {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply {
          this.alpha = alpha
        }
        for (tileX in minTileX..maxTileX) {
          for (tileY in minTileY..maxTileY) {
            if (tileY < 0 || tileY >= tileMax) continue
            val wrappedX = ((tileX % tileMax) + tileMax) % tileMax
            val url = template
              .replace("{z}", zoom.toString())
              .replace("{x}", wrappedX.toString())
              .replace("{y}", tileY.toString())
            val tile = fetchBitmap(url) ?: continue
            val left = ((tileX * tileSize) - topLeftPxX).toFloat()
            val top = ((tileY * tileSize) - topLeftPxY).toFloat()
            canvas.drawBitmap(tile, null, Rect(left.toInt(), top.toInt(), (left + 256f).toInt(), (top + 256f).toInt()), paint)
          }
        }
      }

      drawTileLayer("https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", 235)
      drawTileLayer("https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png", 230)

      val wash = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.argb(38, 2, 6, 23)
        style = Paint.Style.FILL
      }
      canvas.drawRect(0f, 0f, 720f, 360f, wash)

      val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(34, 211, 238)
        alpha = 120
        style = Paint.Style.STROKE
        strokeWidth = 4f
      }
      val cx = 360f
      val cy = 180f
      listOf(54f, 108f, 162f).forEach { canvas.drawCircle(cx, cy, it, ring) }
      val dot = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(56, 189, 248)
        style = Paint.Style.FILL
      }
      canvas.drawCircle(cx, cy, 13f, dot)
      val halo = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(56, 189, 248)
        alpha = 78
        style = Paint.Style.STROKE
        strokeWidth = 5f
      }
      canvas.drawCircle(cx, cy, 22f, halo)

      val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        alpha = 218
        textSize = 25f
        typeface = android.graphics.Typeface.DEFAULT_BOLD
        setShadowLayer(5f, 0f, 2f, Color.rgb(2, 6, 23))
      }
      canvas.drawText(place.name.take(22), 386f, 188f, labelPaint)

      bitmap
    }.getOrNull()
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
      val base = cloud.optInt("base", -1)
      if (base >= 0 && (lowest == null || base < lowest!!)) lowest = base
    }
    return lowest?.let { "Ceiling ${it}00 ft" } ?: "Ceiling unlimited"
  }
}

private fun readAviationSelection(context: Context): JSONObject? {
  return readAsyncStorageValue(context, AVIATION_WIDGET_SELECTION_KEY)?.let { raw ->
    runCatching { JSONObject(raw) }.getOrNull()
  }
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

private fun countLabel(counts: JSONObject?, key: String, hazardText: String, fallbackToken: String): String {
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
  val lat = json.optDouble("lat", Double.NaN)
  val lon = json.optDouble("lon", Double.NaN)
  if (!lat.isFinite() || !lon.isFinite()) return null
  val rawName = json.optString("name", "").ifBlank { "OMNIwx location" }
  val name = if (looksLikeCoordinateLabel(rawName)) "Current Location" else rawName
  return WidgetPlace(name = name, lat = lat, lon = lon)
}

private fun readClimoCache(context: Context, place: WidgetPlace): WidgetClimatology? {
  val key = "$CLIMO_CACHE_PREFIX:${String.format(Locale.US, "%.3f", place.lat)},${String.format(Locale.US, "%.3f", place.lon)}"
  return readAsyncStorageValue(context, key)?.let { raw ->
    runCatching { climoFromJson(place, JSONObject(raw)) }.getOrNull()
  }
}

private fun readSkyScoreCache(context: Context, place: WidgetPlace): WidgetSkyScore? {
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
