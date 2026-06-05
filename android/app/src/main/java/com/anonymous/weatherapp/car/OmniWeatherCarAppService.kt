package com.anonymous.weatherapp.car

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
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
import android.os.Handler
import android.os.Looper
import androidx.car.app.AppManager
import androidx.car.app.CarAppService
import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.Session
import androidx.car.app.SessionInfo
import androidx.car.app.SurfaceCallback
import androidx.car.app.SurfaceContainer
import androidx.car.app.model.Action
import androidx.car.app.model.ActionStrip
import androidx.car.app.model.CarIcon
import androidx.car.app.model.GridItem
import androidx.car.app.model.GridTemplate
import androidx.car.app.model.ItemList
import androidx.car.app.model.ListTemplate
import androidx.car.app.model.Pane
import androidx.car.app.model.PaneTemplate
import androidx.car.app.model.Row
import androidx.car.app.model.Template
import androidx.car.app.navigation.model.MapController
import androidx.car.app.navigation.model.MapWithContentTemplate
import androidx.car.app.validation.HostValidator
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.IconCompat
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import java.net.HttpURLConnection
import java.net.UnknownHostException
import java.net.URL
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import kotlin.concurrent.thread
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
private const val DEFAULT_CITY_STORAGE_KEY = "omniwx:profile:defaultCity"
private const val RAINVIEWER_TIMELINE_URL = "https://api.rainviewer.com/public/weather-maps.json"
private const val OMNIWX_RADAR_WORKER_BASE = "https://omniwx-api.omniwx.workers.dev"

class OmniWeatherCarAppService : CarAppService() {
  override fun createHostValidator(): HostValidator {
    return HostValidator.ALLOW_ALL_HOSTS_VALIDATOR
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

    synchronized(this) {
      if (loaded && !force) {
        return
      } else {
        callbacks.add(onDone)
        if (!loading) {
          loading = true
          error = null
          shouldStart = true
        }
      }
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
    if (force || (!repository.loaded && !repository.loading)) {
      repository.load(force) { invalidate() }
    }
  }

  protected fun refreshAction(): Action {
    return Action.Builder()
      .setTitle("Refresh")
      .setOnClickListener {
        repository.load(force = true) { invalidate() }
        invalidate()
      }
      .build()
  }

  protected fun closeAction(): Action {
    return Action.Builder()
      .setTitle("Close")
      .setOnClickListener { screenManager.pop() }
      .build()
  }

  protected fun homeAction(): Action {
    return Action.Builder()
      .setTitle("Home")
      .setOnClickListener { screenManager.popToRoot() }
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

  protected fun safeErrorTemplate(title: String, headerAction: Action = Action.BACK): Template {
    val pane = Pane.Builder()
      .addRow(
        Row.Builder()
          .setTitle("OMNIwx needs a quick refresh")
          .addText("Open OMNIwx on your phone once, then try Android Auto again.")
          .build()
      )
      .build()

    return PaneTemplate.Builder(pane)
      .setTitle(title)
      .setHeaderAction(headerAction)
      .setActionStrip(ActionStrip.Builder().addAction(homeAction()).addAction(refreshAction()).build())
      .build()
  }

  protected fun safeTemplate(title: String, fallbackHeaderAction: Action = Action.BACK, block: () -> Template): Template {
    return try {
      block()
    } catch (_: Throwable) {
      safeErrorTemplate(title, fallbackHeaderAction)
    }
  }
}

private class OmniWeatherHomeScreen(carContext: CarContext, repository: CarWeatherRepository) : OmniWeatherBaseScreen(carContext, repository) {
  override fun onGetTemplate(): Template {
    return safeTemplate("OMNIwx", Action.APP_ICON) {
      ensureLoaded()
      val current = repository.report

      if (current != null) {
        val list = ItemList.Builder()
        list.addItem(Row.Builder()
          .setTitle("Current")
          .addText("${current.temperatureF.roundLabel()}F - ${weatherCodeLabel(current.weatherCode)} - feels ${current.feelsLikeF.roundLabel()}F")
          .addText("Wind ${windDirectionLabel(current.windDirectionDeg)} ${current.windMph.roundLabel()} mph - precip ${current.precipChancePct.roundLabel()}%")
          .setOnClickListener { screenManager.push(OmniWeatherHourlyScreen(carContext, repository)) }
          .build())
        list.addItem(Row.Builder()
          .setTitle("Next 24 hours")
          .addText(current.hourlyHomeSummary())
          .addText(current.hourlyTrendSummary())
          .setOnClickListener { screenManager.push(OmniWeatherHourlyScreen(carContext, repository)) }
          .build())
        list.addItem(Row.Builder()
          .setTitle("5-day outlook")
          .addText(current.forecastHomeSummary())
          .addText("Tap for daily highs, lows, and precip")
          .setOnClickListener { screenManager.push(OmniWeatherFiveDayScreen(carContext, repository)) }
          .build())
        list.addItem(Row.Builder()
          .setTitle("Alerts")
          .addText(current.alertTitle ?: "No active alerts")
          .addText(current.alertSubtitle ?: "No NWS alerts found near ${current.placeName}.")
          .setOnClickListener { screenManager.push(OmniWeatherAlertsScreen(carContext, repository)) }
          .build())
        list.addItem(Row.Builder()
          .setTitle("Nearby radar")
          .addText("Nearest NEXRAD ${current.nearestRadar.id} - ${current.nearestRadarDistanceMi.roundLabel()} mi")
          .addText("Driver-safe weather summary")
          .setOnClickListener { screenManager.push(OmniWeatherMapScreen(carContext, repository)) }
          .build())
        list.addItem(Row.Builder()
          .setTitle("SkyScore")
          .addText("${current.skyScore?.score ?: "--"} - ${current.skyScore?.label ?: "Pending"}")
          .addText(current.skyScore?.summary ?: "Tap for observing conditions")
          .setOnClickListener { screenManager.push(OmniWeatherSkyScoreScreen(carContext, repository)) }
          .build())

        return@safeTemplate ListTemplate.Builder()
          .setSingleList(list.build())
          .setTitle("OMNIwx - ${current.placeName}")
          .setHeaderAction(Action.APP_ICON)
          .setActionStrip(ActionStrip.Builder().addAction(refreshAction()).build())
          .build()
      }

      val pane = Pane.Builder()
      if (repository.loading) {
        pane.addRow(Row.Builder().setTitle("Loading weather").addText("Connecting to your OMNIwx location.").build())
      } else if (repository.error != null) {
        pane.addRow(Row.Builder().setTitle("Weather is still connecting").addText(repository.error ?: "Tap Refresh after the car connection settles.").build())
      } else {
        pane.addRow(Row.Builder().setTitle("Location unavailable").addText("Open OMNIwx once on your phone or allow location access.").build())
      }
      PaneTemplate.Builder(pane.build())
        .setTitle("OMNIwx")
        .setHeaderAction(Action.APP_ICON)
        .setActionStrip(ActionStrip.Builder().addAction(refreshAction()).build())
        .build()
    }
  }
}

private class OmniWeatherFiveDayScreen(carContext: CarContext, repository: CarWeatherRepository) : OmniWeatherBaseScreen(carContext, repository) {
  override fun onGetTemplate(): Template {
    return safeTemplate("5-day Forecast") {
    ensureLoaded()
    loadingOrErrorTemplate("5-day Forecast")?.let { return@safeTemplate it }
    val current = repository.report!!
    val list = ItemList.Builder()
    if (current.daily.isEmpty()) {
      list.addItem(GridItem.Builder()
        .setTitle("Forecast")
        .setText("Loading")
        .setImage(carWeatherIcon(-1), GridItem.IMAGE_TYPE_ICON)
        .build())
    } else {
      current.daily.take(5).forEach { day ->
        list.addItem(GridItem.Builder()
        .setTitle("${day.label} ${day.highF.roundLabel()}/${day.lowF.roundLabel()}")
        .setText("${weatherCodeLabel(day.weatherCode)} - rain ${day.precipChancePct.roundLabel()}%")
        .setImage(carWeatherIcon(day.weatherCode), GridItem.IMAGE_TYPE_ICON)
        .build())
      }
    }
    GridTemplate.Builder()
      .setSingleList(list.build())
      .setTitle("5-day Forecast")
      .setHeaderAction(Action.BACK)
      .setActionStrip(ActionStrip.Builder().addAction(refreshAction()).build())
      .build()
    }
  }
}

private class OmniWeatherHourlyScreen(carContext: CarContext, repository: CarWeatherRepository) : OmniWeatherBaseScreen(carContext, repository) {
  override fun onGetTemplate(): Template {
    return safeTemplate("24-hour Forecast") {
    ensureLoaded()
    loadingOrErrorTemplate("24-hour Forecast")?.let { return@safeTemplate it }
    val current = repository.report!!
    val list = ItemList.Builder()
    val hours = listOf(0, 2, 4, 6, 9, 12).mapNotNull { current.hourly.getOrNull(it) }
    if (hours.isEmpty()) {
      list.addItem(GridItem.Builder()
        .setTitle("Hourly")
        .setText("Loading")
        .setImage(carWeatherIcon(-1), GridItem.IMAGE_TYPE_ICON)
        .build())
    } else {
      hours.forEach { hour ->
        list.addItem(GridItem.Builder()
        .setTitle("${hour.label} ${hour.temperatureF.roundLabel()}F")
        .setText("${weatherCodeLabel(hour.weatherCode)} - ${hour.precipChancePct.roundLabel()}% - ${hour.windMph.roundLabel()} mph")
        .setImage(carWeatherIcon(hour.weatherCode), GridItem.IMAGE_TYPE_ICON)
        .build())
      }
    }
    GridTemplate.Builder()
      .setSingleList(list.build())
      .setTitle("24-hour Forecast")
      .setHeaderAction(Action.BACK)
      .setActionStrip(ActionStrip.Builder().addAction(refreshAction()).build())
      .build()
    }
  }
}

private class OmniWeatherAlertsScreen(carContext: CarContext, repository: CarWeatherRepository) : OmniWeatherBaseScreen(carContext, repository) {
  override fun onGetTemplate(): Template {
    return safeTemplate("Alerts") {
    ensureLoaded()
    loadingOrErrorTemplate("Alerts")?.let { return@safeTemplate it }
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
    PaneTemplate.Builder(pane.build())
      .setTitle("Alerts")
      .setHeaderAction(Action.BACK)
      .setActionStrip(ActionStrip.Builder().addAction(refreshAction()).build())
      .build()
    }
  }
}

private class OmniWeatherSkyScoreScreen(carContext: CarContext, repository: CarWeatherRepository) : OmniWeatherBaseScreen(carContext, repository) {
  override fun onGetTemplate(): Template {
    return safeTemplate("SkyScore") {
    ensureLoaded()
    loadingOrErrorTemplate("SkyScore")?.let { return@safeTemplate it }
    val current = repository.report!!
    val sky = current.skyScore ?: placeholderSkyScoreFromWeather(current)
    val pane = Pane.Builder()
      .addRow(Row.Builder().setTitle("SkyScore ${sky.score} - ${sky.label}").addText(sky.bestWindow?.let { "Best window: $it" } ?: "Best window pending").build())
      .addRow(Row.Builder().setTitle("Why").addText(sky.summary ?: "Based on cloud cover, visibility, and current weather.").build())
      .addRow(Row.Builder().setTitle("Driver-safe note").addText("Open OMNIwx on phone for the full astronomy map.").build())
      .build()
    PaneTemplate.Builder(pane)
      .setTitle("SkyScore")
      .setHeaderAction(Action.BACK)
      .setActionStrip(ActionStrip.Builder().addAction(refreshAction()).build())
      .build()
    }
  }
}

private class OmniWeatherMapScreen(carContext: CarContext, repository: CarWeatherRepository) : OmniWeatherBaseScreen(carContext, repository) {
  @Volatile private var fetchInFlight = false
  @Volatile private var radarTiles: List<RadarTileBitmap> = emptyList()
  @Volatile private var radarTimestamp: String? = null
  @Volatile private var radarError: String? = null
  private val tileLock = Any()

  override fun onGetTemplate(): Template {
    return safeTemplate("Radar Snapshot") {
      ensureLoaded()
      loadingOrErrorTemplate("Radar Snapshot")?.let { return@safeTemplate it }
      val current = repository.report!!
      fetchRadarIfNeeded(force = false)

      val tilesSnapshot = synchronized(tileLock) { radarTiles.toList() }
      val timestampSnapshot = synchronized(tileLock) { radarTimestamp }
      val errorSnapshot = synchronized(tileLock) { radarError }
      val radarStatus = when {
        tilesSnapshot.isNotEmpty() -> timestampSnapshot ?: "latest radar"
        fetchInFlight -> "loading latest radar"
        errorSnapshot != null -> errorSnapshot
        else -> "radar snapshot pending"
      }

      val list = ItemList.Builder()
      list.addItem(
        GridItem.Builder()
          .setTitle("Radar near ${current.placeName}")
          .setText("${current.nearestRadar.id} - ${current.nearestRadarDistanceMi.roundLabel()} mi - $radarStatus")
          .setImage(carRadarSnapshotIcon(current, tilesSnapshot, fetchInFlight, errorSnapshot), GridItem.IMAGE_TYPE_LARGE)
          .build()
      )
      list.addItem(
        GridItem.Builder()
          .setTitle("${current.temperatureF.roundLabel()}F ${weatherCodeLabel(current.weatherCode)}")
          .setText("Wind ${windDirectionLabel(current.windDirectionDeg)} ${current.windMph.roundLabel()} mph")
          .setImage(carWeatherIcon(current.weatherCode), GridItem.IMAGE_TYPE_ICON)
          .build()
      )
      list.addItem(
        GridItem.Builder()
          .setTitle(current.alertTitle ?: "No active alerts")
          .setText(current.alertSubtitle ?: "Tap Refresh for latest radar")
          .setImage(carAlertIcon(current.alertTitle != null), GridItem.IMAGE_TYPE_ICON)
          .build()
      )

      GridTemplate.Builder()
        .setSingleList(list.build())
        .setTitle("Radar Snapshot")
        .setHeaderAction(Action.BACK)
        .setActionStrip(ActionStrip.Builder().addAction(radarRefreshAction()).build())
        .build()
    }
  }

  private fun radarRefreshAction(): Action {
    return Action.Builder()
      .setTitle("Refresh")
      .setOnClickListener {
        repository.load(force = true) {
          fetchRadarIfNeeded(force = true)
          invalidate()
        }
        fetchRadarIfNeeded(force = true)
        invalidate()
      }
      .build()
  }

  private fun fetchRadarIfNeeded(force: Boolean) {
    val report = repository.report ?: return
    if (fetchInFlight) return
    if (!force && synchronized(tileLock) { radarTiles.isNotEmpty() }) return

    fetchInFlight = true
    thread(name = "omniwx-car-radar-card") {
      try {
        val ts = latestRainViewerTimestamp()
        val tiles = fetchRadarTileMosaic(report.latitude, report.longitude, ts)
        synchronized(tileLock) {
          radarTiles = tiles
          radarTimestamp = radarAgeLabel(ts)
          radarError = if (tiles.isEmpty()) "radar tiles unavailable" else null
        }
      } catch (_: Throwable) {
        synchronized(tileLock) {
          radarError = "radar unavailable"
        }
      } finally {
        fetchInFlight = false
        Handler(Looper.getMainLooper()).post { invalidate() }
      }
    }
  }
}

private object EmptyCarSurfaceCallback : SurfaceCallback

private class CarRadarSurfaceRenderer(private val repository: CarWeatherRepository) : SurfaceCallback {
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.WHITE
    textSize = 30f
    typeface = android.graphics.Typeface.DEFAULT_BOLD
  }
  private val smallTextPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.rgb(203, 213, 225)
    textSize = 22f
  }

  @Volatile private var surface: SurfaceContainer? = null
  @Volatile private var fetchInFlight = false
  @Volatile private var radarTiles: List<RadarTileBitmap> = emptyList()
  @Volatile private var radarTimestamp: String? = null
  @Volatile private var radarError: String? = null
  private val tileLock = Any()

  override fun onSurfaceAvailable(surfaceContainer: SurfaceContainer) {
    surface = surfaceContainer
    draw()
    fetchRadarIfNeeded(force = false)
  }

  override fun onVisibleAreaChanged(visibleArea: Rect) {
    draw()
  }

  override fun onStableAreaChanged(stableArea: Rect) {
    draw()
  }

  override fun onSurfaceDestroyed(surfaceContainer: SurfaceContainer) {
    surface = null
    release()
  }

  fun requestRefresh() {
    fetchRadarIfNeeded(force = true)
  }

  fun release() {
    val oldTiles = synchronized(tileLock) {
      val old = radarTiles
      radarTiles = emptyList()
      radarTimestamp = null
      radarError = null
      old
    }
    oldTiles.forEach { runCatching { it.bitmap.recycle() } }
  }

  private fun fetchRadarIfNeeded(force: Boolean) {
    if (fetchInFlight || repository.report == null) return
    if (!force && synchronized(tileLock) { radarTiles.isNotEmpty() }) return
    fetchInFlight = true
    thread(name = "omniwx-car-radar") {
      try {
        val report = repository.report ?: return@thread
        val ts = latestRainViewerTimestamp()
        val tiles = fetchRadarTileMosaic(report.latitude, report.longitude, ts)
        val oldTiles = synchronized(tileLock) {
          val old = radarTiles
          radarTiles = tiles
          radarTimestamp = radarAgeLabel(ts)
          radarError = null
          old
        }
        oldTiles.forEach { runCatching { it.bitmap.recycle() } }
      } catch (e: Exception) {
        synchronized(tileLock) { radarError = "Radar unavailable" }
      } finally {
        fetchInFlight = false
        Handler(Looper.getMainLooper()).post { draw() }
      }
    }
  }

  private fun draw() {
    val target = surface ?: return
    val targetSurface = target.surface ?: return
    val canvas = try {
      targetSurface.lockCanvas(null)
    } catch (_: Throwable) {
      return
    }

    try {
      drawRadarCanvas(canvas, target.width, target.height)
    } finally {
      runCatching { targetSurface.unlockCanvasAndPost(canvas) }
    }
  }

  private fun drawRadarCanvas(canvas: Canvas, width: Int, height: Int) {
    canvas.drawColor(Color.rgb(8, 13, 25))
    drawGrid(canvas, width, height)

    val report = repository.report
    if (report == null) {
      drawCenteredText(canvas, width, height, "Loading OMNIwx radar")
      return
    }

    val timestamp = synchronized(tileLock) {
      val tiles = radarTiles
      if (tiles.isEmpty()) {
        drawCenteredText(canvas, width, height, if (fetchInFlight) "Loading latest radar" else (radarError ?: "Radar snapshot pending"))
      } else {
        drawTiles(canvas, width, height, report, tiles)
      }
      radarTimestamp
    }

    drawLocationMarker(canvas, width / 2f, height / 2f)
    drawHeader(canvas, width, report, timestamp)
    drawLegend(canvas, width, height)
  }

  private fun drawTiles(canvas: Canvas, width: Int, height: Int, report: CarWeatherReport, tiles: List<RadarTileBitmap>) {
    val zoom = 7
    val tileSize = 512.0
    val centerWorld = latLonToWorldPixels(report.latitude, report.longitude, zoom, tileSize)
    val scale = 1.0
    val alphaPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { alpha = 215 }

    for (tile in tiles) {
      val tileLeftWorld = tile.x * tileSize
      val tileTopWorld = tile.y * tileSize
      val left = ((tileLeftWorld - centerWorld.first) * scale + width / 2.0).toFloat()
      val top = ((tileTopWorld - centerWorld.second) * scale + height / 2.0).toFloat()
      val right = (left + tile.bitmap.width * scale).toFloat()
      val bottom = (top + tile.bitmap.height * scale).toFloat()
      canvas.drawBitmap(tile.bitmap, null, android.graphics.RectF(left, top, right, bottom), alphaPaint)
    }
  }

  private fun drawGrid(canvas: Canvas, width: Int, height: Int) {
    paint.style = Paint.Style.STROKE
    paint.strokeWidth = 2f
    paint.color = Color.argb(70, 96, 165, 250)
    val step = 96f
    var x = 0f
    while (x <= width) {
      canvas.drawLine(x, 0f, x, height.toFloat(), paint)
      x += step
    }
    var y = 0f
    while (y <= height) {
      canvas.drawLine(0f, y, width.toFloat(), y, paint)
      y += step
    }

    paint.color = Color.argb(75, 34, 211, 238)
    canvas.drawCircle(width / 2f, height / 2f, minOf(width, height) * 0.22f, paint)
    canvas.drawCircle(width / 2f, height / 2f, minOf(width, height) * 0.38f, paint)
  }

  private fun drawHeader(canvas: Canvas, width: Int, report: CarWeatherReport, timestamp: String?) {
    paint.style = Paint.Style.FILL
    paint.color = Color.argb(205, 2, 6, 23)
    canvas.drawRoundRect(18f, 18f, width - 18f, 108f, 24f, 24f, paint)
    canvas.drawText("OMNIwx Radar - ${report.placeName}", 38f, 56f, textPaint)
    val subtitle = "${report.temperatureF.roundLabel()}F ${weatherCodeLabel(report.weatherCode)} - ${timestamp ?: "latest radar"}"
    canvas.drawText(subtitle, 38f, 88f, smallTextPaint)
  }

  private fun drawLegend(canvas: Canvas, width: Int, height: Int) {
    paint.style = Paint.Style.FILL
    paint.color = Color.argb(205, 2, 6, 23)
    canvas.drawRoundRect(18f, height - 82f, width - 18f, height - 18f, 20f, 20f, paint)
    drawLegendDot(canvas, 42f, height - 50f, Color.rgb(34, 197, 94), "Light")
    drawLegendDot(canvas, 150f, height - 50f, Color.rgb(234, 179, 8), "Moderate")
    drawLegendDot(canvas, 302f, height - 50f, Color.rgb(239, 68, 68), "Heavy")
    canvas.drawText("Static snapshot", width - 190f, height - 43f, smallTextPaint)
  }

  private fun drawLegendDot(canvas: Canvas, x: Float, y: Float, color: Int, label: String) {
    paint.color = color
    paint.style = Paint.Style.FILL
    canvas.drawCircle(x, y, 11f, paint)
    canvas.drawText(label, x + 18f, y + 8f, smallTextPaint)
  }

  private fun drawLocationMarker(canvas: Canvas, x: Float, y: Float) {
    paint.style = Paint.Style.FILL
    paint.color = Color.argb(80, 14, 165, 233)
    canvas.drawCircle(x, y, 34f, paint)
    paint.color = Color.WHITE
    canvas.drawCircle(x, y, 15f, paint)
    paint.color = Color.rgb(14, 165, 233)
    canvas.drawCircle(x, y, 9f, paint)
  }

  private fun drawCenteredText(canvas: Canvas, width: Int, height: Int, value: String) {
    val textWidth = textPaint.measureText(value)
    canvas.drawText(value, (width - textWidth) / 2f, height / 2f - 48f, textPaint)
  }
}

private data class RadarTileBitmap(
  val x: Int,
  val y: Int,
  val bitmap: Bitmap,
)

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

private fun latestRainViewerTimestamp(): Long {
  val conn = (URL(RAINVIEWER_TIMELINE_URL).openConnection() as HttpURLConnection).apply {
    connectTimeout = 7000
    readTimeout = 7000
    requestMethod = "GET"
    setRequestProperty("User-Agent", "OMNIwx Alpha Android Auto")
    setRequestProperty("Accept", "application/json")
  }

  return try {
    if (conn.responseCode !in 200..299) throw IllegalStateException("Radar timeline returned ${conn.responseCode}.")
    val body = conn.inputStream.bufferedReader().use { it.readText() }
    val radar = JSONObject(body).optJSONObject("radar")
    val past = radar?.optJSONArray("past") ?: JSONArray()
    val nowcast = radar?.optJSONArray("nowcast") ?: JSONArray()
    val combined = mutableListOf<Long>()
    for (idx in 0 until past.length()) {
      val t = past.optJSONObject(idx)?.optLong("time", 0L) ?: 0L
      if (t > 0L) combined.add(t)
    }
    for (idx in 0 until nowcast.length()) {
      val t = nowcast.optJSONObject(idx)?.optLong("time", 0L) ?: 0L
      if (t > 0L) combined.add(t)
    }
    combined.maxOrNull() ?: throw IllegalStateException("Radar timeline unavailable.")
  } finally {
    conn.disconnect()
  }
}

private fun fetchRadarTileMosaic(lat: Double, lon: Double, timestamp: Long): List<RadarTileBitmap> {
  val zoom = 7
  val centerTile = latLonToTile(lat, lon, zoom)
  val tiles = mutableListOf<RadarTileBitmap>()
  for (dy in -1..1) {
    for (dx in -1..1) {
      val x = centerTile.first + dx
      val y = centerTile.second + dy
      val bitmap = fetchRadarTileBitmap(zoom, x, y, timestamp) ?: continue
      tiles.add(RadarTileBitmap(x, y, bitmap))
    }
  }
  return tiles
}

private fun fetchRadarTileBitmap(zoom: Int, x: Int, y: Int, timestamp: Long): Bitmap? {
  val maxTile = 1 shl zoom
  if (y < 0 || y >= maxTile) return null
  val wrappedX = ((x % maxTile) + maxTile) % maxTile
  val url =
    "$OMNIWX_RADAR_WORKER_BASE/v1/radar/rainviewer/tiles/$zoom/$wrappedX/$y.png" +
      "?ts=$timestamp&size=512&color=2&smooth=1&snow=1"
  val conn = (URL(url).openConnection() as HttpURLConnection).apply {
    connectTimeout = 8000
    readTimeout = 8000
    requestMethod = "GET"
    setRequestProperty("User-Agent", "OMNIwx Alpha Android Auto")
    setRequestProperty("Accept", "image/png")
  }
  return try {
    if (conn.responseCode !in 200..299) return null
    BitmapFactory.decodeStream(conn.inputStream)
  } finally {
    conn.disconnect()
  }
}

private fun latLonToTile(lat: Double, lon: Double, zoom: Int): Pair<Int, Int> {
  val n = 1 shl zoom
  val latRad = Math.toRadians(lat.coerceIn(-85.05112878, 85.05112878))
  val x = floor((lon + 180.0) / 360.0 * n).toInt()
  val y = floor((1.0 - ln(Math.tan(latRad) + 1.0 / cos(latRad)) / Math.PI) / 2.0 * n).toInt()
  return Pair(x.coerceIn(0, n - 1), y.coerceIn(0, n - 1))
}

private fun latLonToWorldPixels(lat: Double, lon: Double, zoom: Int, tileSize: Double): Pair<Double, Double> {
  val n = (1 shl zoom) * tileSize
  val latRad = Math.toRadians(lat.coerceIn(-85.05112878, 85.05112878))
  val x = (lon + 180.0) / 360.0 * n
  val y = (1.0 - ln(Math.tan(latRad) + 1.0 / cos(latRad)) / Math.PI) / 2.0 * n
  return Pair(x, y)
}

private fun radarAgeLabel(timestamp: Long): String {
  val ageMinutes = ((System.currentTimeMillis() / 1000L - timestamp) / 60L).coerceAtLeast(0L)
  return when {
    ageMinutes < 2L -> "radar just updated"
    ageMinutes < 90L -> "radar ${ageMinutes} min old"
    else -> "latest radar"
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

private fun carRadarSnapshotIcon(
  report: CarWeatherReport,
  tiles: List<RadarTileBitmap>,
  loading: Boolean,
  error: String?
): CarIcon {
  val cardWidth = 480
  val cardHeight = 270
  val centerX = cardWidth / 2f
  val centerY = cardHeight / 2f
  val bitmap = Bitmap.createBitmap(cardWidth, cardHeight, Bitmap.Config.ARGB_8888)
  val canvas = Canvas(bitmap)
  val paint = Paint(Paint.ANTI_ALIAS_FLAG)
  val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.WHITE
    textSize = 24f
    typeface = android.graphics.Typeface.DEFAULT_BOLD
    setShadowLayer(5f, 0f, 2f, Color.rgb(2, 6, 23))
  }
  val small = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.rgb(203, 213, 225)
    textSize = 18f
    setShadowLayer(4f, 0f, 2f, Color.rgb(2, 6, 23))
  }

  canvas.drawColor(Color.rgb(5, 17, 36))
  paint.style = Paint.Style.STROKE
  paint.strokeWidth = 2f
  paint.color = Color.argb(54, 56, 189, 248)
  for (x in 0..cardWidth step 60) canvas.drawLine(x.toFloat(), 0f, x.toFloat(), cardHeight.toFloat(), paint)
  for (y in 0..cardHeight step 45) canvas.drawLine(0f, y.toFloat(), cardWidth.toFloat(), y.toFloat(), paint)

  if (tiles.isNotEmpty()) {
    val zoom = 7
    val tileSize = 512.0
    val centerWorld = latLonToWorldPixels(report.latitude, report.longitude, zoom, tileSize)
    val tilePaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply { alpha = 225 }
    tiles.forEach { tile ->
      val tileLeftWorld = tile.x * tileSize
      val tileTopWorld = tile.y * tileSize
      val left = ((tileLeftWorld - centerWorld.first) + centerX).toFloat()
      val top = ((tileTopWorld - centerWorld.second) + centerY).toFloat()
      canvas.drawBitmap(tile.bitmap, null, RectF(left, top, left + tile.bitmap.width, top + tile.bitmap.height), tilePaint)
    }
  } else {
    val message = when {
      loading -> "Loading latest radar"
      error != null -> "Radar unavailable"
      else -> "Radar snapshot pending"
    }
    val w = text.measureText(message)
    canvas.drawText(message, (cardWidth - w) / 2f, centerY + 5f, text)
  }

  paint.style = Paint.Style.STROKE
  paint.strokeWidth = 4f
  paint.color = Color.argb(112, 34, 211, 238)
  listOf(42f, 84f, 126f).forEach { canvas.drawCircle(centerX, centerY, it, paint) }

  paint.style = Paint.Style.FILL
  paint.color = Color.argb(95, 14, 165, 233)
  canvas.drawCircle(centerX, centerY, 28f, paint)
  paint.color = Color.WHITE
  canvas.drawCircle(centerX, centerY, 12f, paint)
  paint.color = Color.rgb(14, 165, 233)
  canvas.drawCircle(centerX, centerY, 7f, paint)

  paint.style = Paint.Style.FILL
  paint.color = Color.argb(210, 2, 6, 23)
  canvas.drawRoundRect(14f, 14f, cardWidth - 14f, 72f, 16f, 16f, paint)
  canvas.drawText("OMNIwx Radar - ${report.placeName.take(18)}", 28f, 39f, text)
  canvas.drawText("${report.nearestRadar.id} ${report.nearestRadarDistanceMi.roundLabel()} mi - static snapshot", 28f, 62f, small)

  paint.color = Color.argb(210, 2, 6, 23)
  canvas.drawRoundRect(14f, cardHeight - 50f, cardWidth - 14f, cardHeight - 14f, 14f, 14f, paint)
  drawMiniLegend(canvas, paint, small, 36f, cardHeight - 27f, Color.rgb(34, 197, 94), "Light")
  drawMiniLegend(canvas, paint, small, 126f, cardHeight - 27f, Color.rgb(234, 179, 8), "Mod")
  drawMiniLegend(canvas, paint, small, 224f, cardHeight - 27f, Color.rgb(239, 68, 68), "Heavy")

  return CarIcon.Builder(IconCompat.createWithBitmap(bitmap)).build()
}

private fun drawMiniLegend(canvas: Canvas, paint: Paint, text: Paint, x: Float, y: Float, color: Int, label: String) {
  paint.style = Paint.Style.FILL
  paint.color = color
  canvas.drawCircle(x, y - 6f, 8f, paint)
  canvas.drawText(label, x + 14f, y, text)
}

private fun carAlertIcon(active: Boolean): CarIcon {
  val bitmap = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888)
  val canvas = Canvas(bitmap)
  val paint = Paint(Paint.ANTI_ALIAS_FLAG)
  paint.style = Paint.Style.FILL
  paint.color = Color.rgb(15, 23, 42)
  canvas.drawCircle(48f, 48f, 43f, paint)
  paint.style = Paint.Style.STROKE
  paint.strokeWidth = 4f
  paint.color = if (active) Color.rgb(251, 146, 60) else Color.rgb(56, 189, 248)
  canvas.drawCircle(48f, 48f, 42f, paint)
  paint.style = Paint.Style.FILL
  paint.color = if (active) Color.rgb(251, 146, 60) else Color.rgb(34, 197, 94)
  val path = android.graphics.Path().apply {
    moveTo(48f, 18f)
    lineTo(78f, 72f)
    lineTo(18f, 72f)
    close()
  }
  canvas.drawPath(path, paint)
  paint.color = Color.WHITE
  canvas.drawRect(45f, 36f, 51f, 56f, paint)
  canvas.drawCircle(48f, 65f, 4f, paint)
  return CarIcon.Builder(IconCompat.createWithBitmap(bitmap)).build()
}

private fun carWeatherIcon(code: Int): CarIcon {
  val bitmap = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888)
  val canvas = Canvas(bitmap)
  val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.rgb(15, 23, 42)
    style = Paint.Style.FILL
  }
  val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.rgb(56, 189, 248)
    style = Paint.Style.STROKE
    strokeWidth = 4f
  }
  val accentPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = weatherIconColor(code)
    style = Paint.Style.FILL
  }
  val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = weatherIconColor(code)
    style = Paint.Style.STROKE
    strokeWidth = 5f
    strokeCap = Paint.Cap.ROUND
  }
  val whitePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.WHITE
    style = Paint.Style.FILL
  }

  canvas.drawCircle(48f, 48f, 43f, bgPaint)
  canvas.drawCircle(48f, 48f, 42f, ringPaint)

  when (code) {
    0 -> {
      canvas.drawCircle(48f, 48f, 15f, accentPaint)
      for (i in 0 until 8) {
        val angle = Math.toRadians((i * 45).toDouble())
        val x1 = 48f + (24f * cos(angle)).toFloat()
        val y1 = 48f + (24f * sin(angle)).toFloat()
        val x2 = 48f + (33f * cos(angle)).toFloat()
        val y2 = 48f + (33f * sin(angle)).toFloat()
        canvas.drawLine(x1, y1, x2, y2, linePaint)
      }
    }
    1, 2, 3 -> drawCloudIcon(canvas, whitePaint, accentPaint, code == 1 || code == 2)
    45, 48 -> {
      canvas.drawCircle(33f, 39f, 9f, whitePaint)
      canvas.drawCircle(49f, 37f, 13f, whitePaint)
      canvas.drawRoundRect(RectF(25f, 43f, 68f, 58f), 8f, 8f, whitePaint)
      listOf(64f, 72f).forEach { y -> canvas.drawLine(24f, y, 72f, y, linePaint) }
    }
    51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82 -> {
      drawCloudIcon(canvas, whitePaint, accentPaint, false)
      listOf(31f, 48f, 65f).forEach { x -> canvas.drawLine(x, 62f, x - 6f, 78f, linePaint) }
    }
    71, 73, 75, 77, 85, 86 -> {
      drawCloudIcon(canvas, whitePaint, accentPaint, false)
      listOf(32f, 48f, 64f).forEach { x ->
        canvas.drawCircle(x, 72f, 3.5f, accentPaint)
      }
    }
    95, 96, 99 -> {
      drawCloudIcon(canvas, whitePaint, accentPaint, false)
      val bolt = android.graphics.Path().apply {
        moveTo(50f, 56f)
        lineTo(39f, 76f)
        lineTo(50f, 73f)
        lineTo(44f, 88f)
        lineTo(61f, 66f)
        lineTo(50f, 69f)
        close()
      }
      canvas.drawPath(bolt, accentPaint)
    }
    else -> {
      canvas.drawCircle(48f, 48f, 15f, accentPaint)
      canvas.drawRoundRect(RectF(28f, 66f, 68f, 74f), 5f, 5f, whitePaint)
    }
  }

  return CarIcon.Builder(IconCompat.createWithBitmap(bitmap)).build()
}

private fun drawCloudIcon(canvas: Canvas, cloudPaint: Paint, accentPaint: Paint, showSun: Boolean) {
  if (showSun) canvas.drawCircle(34f, 34f, 12f, accentPaint)
  canvas.drawCircle(34f, 50f, 11f, cloudPaint)
  canvas.drawCircle(49f, 45f, 16f, cloudPaint)
  canvas.drawCircle(63f, 52f, 10f, cloudPaint)
  canvas.drawRoundRect(RectF(25f, 52f, 73f, 65f), 8f, 8f, cloudPaint)
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
