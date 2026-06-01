package com.anonymous.weatherapp.widget

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
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
  val aurora: String,
)

data class WidgetMetar(
  val station: String,
  val category: String,
  val wind: String,
  val visibility: String,
  val ceiling: String,
  val hazards: String,
  val updatedLabel: String,
)

data class WidgetAviationBriefing(
  val title: String,
  val category: String,
  val secondary: String,
  val tertiary: String,
  val footer: String,
)

data class WidgetClimatology(
  val place: WidgetPlace,
  val stationName: String,
  val normalHighF: Double?,
  val normalLowF: Double?,
  val normalPrecipIn: Double?,
  val annualPrecipIn: Double?,
  val updatedLabel: String,
)

object OmniwxWidgetData {
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
      aurora = "Aurora unavailable",
    )
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
      ?: return null

    return WidgetAviationBriefing(
      title = metar.station,
      category = metar.category,
      secondary = "${metar.wind} / ${metar.visibility}",
      tertiary = metar.ceiling,
      footer = "${metar.hazards}. ${metar.updatedLabel}",
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

  fun fetchClimatology(context: Context): WidgetClimatology? {
    val place = readPlace(context) ?: return null
    val cached = readClimoCache(context, place)
    if (cached != null) return cached

    val url = "$OMNIWX_API_BASE/api/almanac/climo?lat=${place.lat}&lon=${place.lon}"
    val root = fetchJsonObject(url, "OMNIwx Alpha Android Widget")
    return climoFromJson(place, root)
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
      category = category,
      wind = wind,
      visibility = "$vis sm",
      ceiling = ceilingLabel(json.optJSONArray("clouds")),
      hazards = hazardSummary(raw),
      updatedLabel = nowLabel(),
    )
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

private fun climoFromJson(place: WidgetPlace, root: JSONObject): WidgetClimatology? {
  val normals = root.optJSONArray("normals") ?: return null
  val month = Calendar.getInstance().get(Calendar.MONTH) + 1
  var normalHigh: Double? = null
  var normalLow: Double? = null
  for (idx in 0 until normals.length()) {
    val item = normals.optJSONObject(idx) ?: continue
    if (item.optInt("month", -1) != month) continue
    normalHigh = item.optNullableDouble("tmaxF")
    normalLow = item.optNullableDouble("tminF")
    break
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
    updatedLabel = nowLabel(),
  )
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
