package com.anonymous.weatherapp.video

import android.content.ContentValues
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.Rect
import android.graphics.RectF
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.anonymous.weatherapp.R
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Callable
import java.util.concurrent.ExecutorCompletionService
import java.util.concurrent.Executors
import kotlin.concurrent.thread
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/*
 * Native MP4 exporter for radar/satellite animation loops.
 *
 * The phone map can animate frames with React Native/MapLibre, but exporting a
 * playable video is a native-media job. This module is called from JS through
 * NativeModules.OmniwxVideoExport and returns a MediaStore URI after encoding.
 *
 * Pipeline:
 *   JS sends frame labels + image URLs
 *   -> Kotlin downloads each image
 *   -> composeFrame draws OMNIwx chrome + weather imagery
 *   -> MediaCodec encodes H.264 frames
 *   -> MediaMuxer writes MP4
 *   -> saveToMovies publishes it to the user's Movies collection
 */
class OmniwxVideoExportModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  private val brandMarkBitmap: Bitmap? by lazy {
    BitmapFactory.decodeResource(reactContext.resources, R.drawable.omniwx_mark)
  }

  override fun getName(): String = "OmniwxVideoExport"

  private fun emitProgress(
    jobId: String,
    stage: String,
    completed: Int,
    total: Int,
    message: String,
  ) {
    OmniwxVideoExportForegroundService.update(reactContext, message)
    // Export remains native-side while the user continues using the app. These
    // events only update non-blocking React Native progress UI.
    val payload = Arguments.createMap().apply {
      putString("jobId", jobId)
      putString("stage", stage)
      putInt("completed", completed)
      putInt("total", total)
      putString("message", message)
    }
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("omniwxVideoExportProgress", payload)
  }

  @ReactMethod
  fun exportAnimation(options: ReadableMap, promise: Promise) {
    // Encoding and network downloads must not run on React Native's JS thread.
    // The Promise is resolved/rejected when this background worker finishes.
    // This call originates from a button press, so Android permits starting
    // foreground work before the user backgrounds the app.
    OmniwxVideoExportForegroundService.start(reactContext)
    thread(name = "omniwx-video-export") {
      val jobId = options.optString("jobId", "export-${System.currentTimeMillis()}")
      var completed = false
      var completionMessage = "No video was saved. Open Maps to try again."
      try {
        val frames = readFrames(options.getArray("frames"))
        if (frames.size < 2) throw IllegalArgumentException("At least two animation frames are required.")

        emitProgress(jobId, "preparing", 0, frames.size, "Preparing source frames")

        val width = normalizedEven(options.optInt("width", 1280), 320, 1920)
        val height = normalizedEven(options.optInt("height", 720), 320, 1920)
        val fps = options.optInt("fps", 30).coerceIn(12, 30)
        val secondsPerSourceFrame = options.optDouble("secondsPerSourceFrame", 0.52).coerceIn(0.25, 2.0)
        val transitionSeconds = options.optDouble("transitionSeconds", 0.22).coerceIn(0.0, secondsPerSourceFrame)
        val minimumDurationSeconds = options.optDouble("minimumDurationSeconds", 12.0).coerceIn(4.0, 30.0)
        val title = options.optString("title", "OMNIwx")
        val subtitle = options.optString("subtitle", "Weather animation")
        val product = options.optString("productLabel", "Weather loop")

        // Require every URL/layer for a source frame to prepare. Some products
        // are composite layers; exporting partial layers would cause flashing or
        // misleading blank frames. Radar frames can now arrive as tile templates
        // so the MP4 uses the same time-resolved source as the on-map animation.
        // Geographic tiles do not change between timeline frames. Rendering them
        // once avoids hundreds of duplicate network requests during a five-hour
        // export. Source imagery still remains unique to each source timestamp.
        val staticMapLayers = prepareStaticMapLayers(width, height, frames.first())
        val preparedByIndex = arrayOfNulls<PreparedFrame>(frames.size)
        // The protected GeoColor renderer admits two full-disk source decodes
        // at a time. Matching that limit keeps a long, cold export from
        // queueing its own requests until the client-side timeout expires.
        val workerCount = min(2, max(1, Runtime.getRuntime().availableProcessors() / 2))
        val executor = Executors.newFixedThreadPool(workerCount)
        try {
          val completions = ExecutorCompletionService<Pair<Int, PreparedFrame?>>(executor)
          frames.forEachIndexed { index, frame ->
            completions.submit(Callable {
              // A transient bad source must only skip its own timestamp. It
              // cannot abort an otherwise useful chronological export.
              index to runCatching { prepareFrame(width, height, frame, staticMapLayers) }.getOrNull()
            })
          }
          repeat(frames.size) { completed ->
            val (index, prepared) = completions.take().get()
            preparedByIndex[index] = prepared
            emitProgress(jobId, "preparing", completed + 1, frames.size, "Preparing source frames")
          }
        } finally {
          executor.shutdownNow()
          staticMapLayers.recycle()
        }
        // Preserve the original source order even though preparation completes
        // concurrently. A video must never reorder its weather timeline.
        val prepared = preparedByIndex.filterNotNull()
        // A two-frame loop may technically encode, but it misrepresents a
        // multi-hour weather animation as flashing. Two thirds is enough for
        // a useful chronological story when a small number of source images
        // are transiently unavailable, without padding or replaying frames.
        val minimumPreparedFrames = max(3, kotlin.math.ceil(frames.size * (2.0 / 3.0)).toInt())
        if (prepared.size < minimumPreparedFrames) {
          throw IllegalStateException(
            "Only ${prepared.size} of ${frames.size} timeline frames were ready. " +
              "At least $minimumPreparedFrames ready frames are required for a smooth chronological video."
          )
        }

        val output = File(reactContext.cacheDir, "omniwx-export-${System.currentTimeMillis()}.mp4")
        encodeVideo(
          frames = prepared,
          output = output,
          width = width,
          height = height,
          fps = fps,
          secondsPerSourceFrame = secondsPerSourceFrame,
          transitionSeconds = transitionSeconds,
          minimumDurationSeconds = minimumDurationSeconds,
          title = title,
          subtitle = subtitle,
          product = product,
          onProgress = { completed, total ->
            emitProgress(jobId, "encoding", completed, total, "Rendering video")
          },
        )

        emitProgress(jobId, "saving", 0, 1, "Saving to Movies")
        val savedUri = saveToMovies(output)
        val result = Arguments.createMap().apply {
          putString("uri", savedUri.toString())
          putString("filePath", output.absolutePath)
          putInt("width", width)
          putInt("height", height)
          putInt("frameCount", prepared.size)
        }
        emitProgress(jobId, "complete", 1, 1, "Video saved")
        completed = true
        completionMessage = "Your animation is ready in Movies/OMNIwx."
        promise.resolve(result)
      } catch (t: Throwable) {
        completionMessage = t.message ?: "Video export failed."
        emitProgress(jobId, "failed", 0, 1, completionMessage)
        promise.reject("OMNIWX_VIDEO_EXPORT_FAILED", completionMessage, t)
      } finally {
        OmniwxVideoExportForegroundService.finish(reactContext, completed, completionMessage)
      }
    }
  }

  private fun encodeVideo(
    frames: List<PreparedFrame>,
    output: File,
    width: Int,
    height: Int,
    fps: Int,
    secondsPerSourceFrame: Double,
    transitionSeconds: Double,
    minimumDurationSeconds: Double,
    title: String,
    subtitle: String,
    product: String,
    onProgress: (completed: Int, total: Int) -> Unit,
  ) {
    // Android's broadly compatible MP4 choice is H.264/AVC. We manually feed
    // YUV420 frames to the codec rather than using a Surface so we can draw the
    // exact same composition for radar, infrared, and true color exports.
    val mime = MediaFormat.MIMETYPE_VIDEO_AVC
    val colorFormat = selectAvcColorFormat()
    val format = MediaFormat.createVideoFormat(mime, width, height).apply {
      setInteger(MediaFormat.KEY_COLOR_FORMAT, colorFormat)
      setInteger(MediaFormat.KEY_BIT_RATE, (width * height * 5.2).roundToInt().coerceAtLeast(2_400_000))
      setInteger(MediaFormat.KEY_FRAME_RATE, fps)
      setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
      runCatching { setInteger(MediaFormat.KEY_PROFILE, MediaCodecInfo.CodecProfileLevel.AVCProfileBaseline) }
      runCatching { setInteger(MediaFormat.KEY_LEVEL, MediaCodecInfo.CodecProfileLevel.AVCLevel31) }
    }
    val codec = MediaCodec.createEncoderByType(mime)
    val muxer = MediaMuxer(output.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    val bufferInfo = MediaCodec.BufferInfo()
    var trackIndex = -1
    var muxerStarted = false
    var presentationFrame = 0L

    try {
      codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
      codec.start()

      // A recording must progress through the selected weather window once.
      // Padding a short catalog by looping it made sparse five-hour satellite
      // exports jump from their newest scene back to the oldest scene. Extend
      // each real frame instead, which keeps the video chronological and lets
      // the caller request a minimum useful duration without fabricated loops.
      val effectiveSecondsPerSourceFrame = max(
        secondsPerSourceFrame,
        minimumDurationSeconds / frames.size.coerceAtLeast(1).toDouble(),
      )
      val holdFrames = max(1, (effectiveSecondsPerSourceFrame * fps).roundToInt())
      val transitionFrames = min(holdFrames - 1, (transitionSeconds * fps).roundToInt())
      val solidFrames = max(1, holdFrames - transitionFrames)
      frames.forEachIndexed { index, current ->
          // Do not wrap the last scene back to the first. A recording is a
          // forward pass through the selected time range, not a GIF loop.
          val next = frames.getOrNull(index + 1)
          repeat(solidFrames) {
            val bitmap = composeFrame(width, height, current, null, 0f, title, subtitle, product)
            presentationFrame = queueBitmap(codec, bitmap, width, height, colorFormat, presentationFrame, fps, bufferInfo) {
              drainEncoder(codec, muxer, bufferInfo, false) {
                if (!muxerStarted) {
                  trackIndex = muxer.addTrack(codec.outputFormat)
                  muxer.start()
                  muxerStarted = true
                }
                trackIndex
              }
            }
            bitmap.recycle()
          }
          for (step in 1..(if (next == null) 0 else transitionFrames)) {
            val blend = step.toFloat() / (transitionFrames + 1).toFloat()
            val bitmap = composeFrame(width, height, current, next, blend, title, subtitle, product)
            presentationFrame = queueBitmap(codec, bitmap, width, height, colorFormat, presentationFrame, fps, bufferInfo) {
              drainEncoder(codec, muxer, bufferInfo, false) {
                if (!muxerStarted) {
                  trackIndex = muxer.addTrack(codec.outputFormat)
                  muxer.start()
                  muxerStarted = true
                }
                trackIndex
              }
            }
            bitmap.recycle()
          }
          onProgress(index + 1, frames.size)
        }

      val inputIndex = codec.dequeueInputBuffer(10_000)
      if (inputIndex >= 0) {
        codec.queueInputBuffer(inputIndex, 0, 0, frameTimeUs(presentationFrame, fps), MediaCodec.BUFFER_FLAG_END_OF_STREAM)
      }
      drainEncoder(codec, muxer, bufferInfo, true) {
        if (!muxerStarted) {
          trackIndex = muxer.addTrack(codec.outputFormat)
          muxer.start()
          muxerStarted = true
        }
        trackIndex
      }
    } finally {
      runCatching { codec.stop() }
      codec.release()
      runCatching { muxer.stop() }
      muxer.release()
      frames.forEach { runCatching { it.scene.recycle() } }
    }
  }

  private fun prepareFrame(
    width: Int,
    height: Int,
    frame: ExportFrame,
    staticMapLayers: StaticMapLayers,
  ): PreparedFrame? {
    val underlayBitmaps = frame.underlayUrls.mapNotNull {
      downloadBitmap(it, connectTimeoutMs = 10_000, readTimeoutMs = 35_000, attempts = 4)
    }
    if (underlayBitmaps.size != frame.underlayUrls.size) {
      underlayBitmaps.forEach { runCatching { it.recycle() } }
      return null
    }

    val tileScene = renderTileScene(width, height, frame, underlayBitmaps, frame.underlayOpacities)
    underlayBitmaps.forEach { runCatching { it.recycle() } }

    val urlBitmaps = frame.urls.mapNotNull {
      downloadBitmap(it, connectTimeoutMs = 10_000, readTimeoutMs = 35_000, attempts = 4)
    }
    val sourceBitmaps = listOfNotNull(tileScene) + urlBitmaps
    val expectedCount = frame.urls.size + if (frame.tileTemplate != null) 1 else 0
    val windOnlyFrame = expectedCount == 0 && frame.windSegments.isNotEmpty() && !frame.basemapTemplate.isNullOrBlank()
    if ((!windOnlyFrame && sourceBitmaps.isEmpty()) || sourceBitmaps.size != expectedCount) {
      sourceBitmaps.forEach { runCatching { it.recycle() } }
      return null
    }

    return try {
      val scene = composeSatelliteScene(
        width,
        height,
        RenderSourceFrame(
          bitmaps = sourceBitmaps,
          bitmapOpacities = (if (tileScene != null) listOf(1.0) else emptyList()) + frame.urlOpacities,
          basemapTemplate = frame.basemapTemplate,
          basemapBoundaryTemplate = frame.basemapBoundaryTemplate,
          basemapBoundaryOpacity = frame.basemapBoundaryOpacity,
          basemapOverlayTemplate = frame.basemapOverlayTemplate,
          basemapOverlayOpacity = frame.basemapOverlayOpacity,
          region = frame.region,
          zoom = frame.zoom,
          windSegments = frame.windSegments,
          windOpacity = frame.windOpacity,
        ),
        staticMapLayers,
      )
      PreparedFrame(label = frame.label, scene = scene)
    } finally {
      sourceBitmaps.forEach { runCatching { it.recycle() } }
    }
  }

  private fun queueBitmap(
    codec: MediaCodec,
    bitmap: Bitmap,
    width: Int,
    height: Int,
    colorFormat: Int,
    frameIndex: Long,
    fps: Int,
    bufferInfo: MediaCodec.BufferInfo,
    onDrain: () -> Unit,
  ): Long {
    // MediaCodec wants raw YUV bytes, not Android Bitmap pixels. Convert ARGB
    // into the selected YUV420 layout, queue it with a presentation timestamp,
    // then drain any encoded output now available.
    val inputIndex = codec.dequeueInputBuffer(10_000)
    if (inputIndex < 0) return frameIndex
    val input = codec.getInputBuffer(inputIndex) ?: return frameIndex
    input.clear()
    val yuv = ByteArray(width * height * 3 / 2)
    argbBitmapToYuv420(bitmap, width, height, colorFormat, yuv)
    input.put(yuv)
    codec.queueInputBuffer(inputIndex, 0, width * height * 3 / 2, frameTimeUs(frameIndex, fps), 0)
    onDrain()
    return frameIndex + 1
  }

  private fun drainEncoder(
    codec: MediaCodec,
    muxer: MediaMuxer?,
    bufferInfo: MediaCodec.BufferInfo,
    endOfStream: Boolean,
    ensureTrack: () -> Int,
  ) {
    // Encoders produce output asynchronously. This loop pulls encoded chunks and
    // writes them into the MP4 muxer. The muxer cannot start until the codec
    // reports its output format, which is why ensureTrack() is deferred.
    while (true) {
      val status = codec.dequeueOutputBuffer(bufferInfo, if (endOfStream) 10_000 else 0)
      when {
        status == MediaCodec.INFO_TRY_AGAIN_LATER -> return
        status == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
          ensureTrack()
        }
        status >= 0 -> {
          val output = codec.getOutputBuffer(status)
          if ((bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) {
            bufferInfo.size = 0
          }
          if (bufferInfo.size > 0 && muxer != null && output != null) {
            val trackIndex = ensureTrack()
            output.position(bufferInfo.offset)
            output.limit(bufferInfo.offset + bufferInfo.size)
            muxer.writeSampleData(trackIndex, output, bufferInfo)
          }
          val flags = bufferInfo.flags
          codec.releaseOutputBuffer(status, false)
          if ((flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) return
        }
      }
    }
  }

  private fun composeFrame(
    width: Int,
    height: Int,
    current: PreparedFrame,
    next: PreparedFrame?,
    blend: Float,
    title: String,
    subtitle: String,
    product: String,
  ): Bitmap {
    // Compose one final video frame. Source scenes are pre-rendered once before
    // encoding, so holds/transitions only redraw cached bitmaps instead of
    // re-downloading map tiles for every output frame.
    val out = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG or Paint.DITHER_FLAG)

    canvas.drawColor(Color.rgb(5, 10, 22))
    drawExportGrid(canvas, width, height)

    if (next != null && blend > 0f) {
      canvas.drawBitmap(current.scene, 0f, 0f, paint.apply { alpha = (255 * (1f - blend)).roundToInt() })
      canvas.drawBitmap(next.scene, 0f, 0f, paint.apply { alpha = (255 * blend).roundToInt() })
    } else {
      canvas.drawBitmap(current.scene, 0f, 0f, paint.apply { alpha = 255 })
    }

    paint.alpha = 255
    drawExportChrome(canvas, width, height, title, subtitle, product, current.label)
    return out
  }

  private fun composeSatelliteScene(
    width: Int,
    height: Int,
    frame: RenderSourceFrame,
    staticMapLayers: StaticMapLayers,
  ): Bitmap {
    // A source frame may include more than one bitmap layer. Draw every layer
    // with aspect-fit rules so radar/satellite products keep their shape.
    val out = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG or Paint.DITHER_FLAG).apply { alpha = 255 }

    canvas.drawColor(Color.rgb(5, 10, 22))
    drawExportGrid(canvas, width, height)
    staticMapLayers.base?.let { canvas.drawBitmap(it, 0f, 0f, paint) }
    frame.bitmaps.forEachIndexed { index, bitmap ->
      val opacity = frame.bitmapOpacities.getOrNull(index)?.coerceIn(0.0, 1.0) ?: 1.0
      drawBitmapFit(canvas, bitmap, width, height, paint.apply { alpha = (opacity * 255.0).roundToInt() })
    }
    paint.alpha = 255
    staticMapLayers.boundaries?.let { canvas.drawBitmap(it, 0f, 0f, paint) }
    staticMapLayers.labels?.let { canvas.drawBitmap(it, 0f, 0f, paint) }
    drawWindSegments(canvas, frame.windSegments, frame.windOpacity)
    return out
  }

  private fun prepareStaticMapLayers(width: Int, height: Int, frame: ExportFrame): StaticMapLayers =
    StaticMapLayers(
      base = renderStaticTileLayer(width, height, frame.basemapTemplate, frame.region, frame.zoom, 245),
      boundaries = renderBoundaryDataLayer(width, height, frame.boundaryDataUrls, frame.region, frame.zoom),
      labels = renderStaticTileLayer(
        width,
        height,
        frame.basemapOverlayTemplate,
        frame.region,
        frame.zoom,
        ((frame.basemapOverlayOpacity ?: 0.92) * 255.0).roundToInt(),
      ),
    )

  private fun renderStaticTileLayer(
    width: Int,
    height: Int,
    tileTemplate: String?,
    region: ExportRegion?,
    zoom: Double?,
    alpha: Int,
  ): Bitmap? {
    if (tileTemplate.isNullOrBlank() || region == null) return null
    return Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also { out ->
      val canvas = Canvas(out)
      canvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
      drawTileTemplateLayer(canvas, width, height, tileTemplate, region, zoom, alpha)
    }
  }

  private fun renderBoundaryDataLayer(
    width: Int,
    height: Int,
    urls: List<String>,
    region: ExportRegion?,
    zoom: Double?,
  ): Bitmap? {
    if (urls.isEmpty() || region == null) return null
    val out = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    canvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
    urls.forEachIndexed { index, url ->
      val payload = downloadText(url, connectTimeoutMs = 4_000, readTimeoutMs = 7_000) ?: return@forEachIndexed
      drawBoundaryFeatures(canvas, payload, region, zoom, index == 0)
    }
    return out
  }

  private fun drawBoundaryFeatures(
    canvas: Canvas,
    payload: String,
    region: ExportRegion,
    zoom: Double?,
    countryLayer: Boolean,
  ) {
    val features = runCatching { JSONObject(payload).optJSONArray("features") }.getOrNull() ?: return
    val z = (zoom ?: approxZoom(region.longitudeDelta)).roundToInt().coerceIn(1, 13)
    val tileSize = 256
    val west = region.longitude - region.longitudeDelta / 2.0
    val east = region.longitude + region.longitudeDelta / 2.0
    val north = (region.latitude + region.latitudeDelta / 2.0).coerceIn(-85.0, 85.0)
    val south = (region.latitude - region.latitudeDelta / 2.0).coerceIn(-85.0, 85.0)
    val westWorld = lonToWorldPixel(west, z, tileSize)
    val eastWorld = lonToWorldPixel(east, z, tileSize)
    val northWorld = latToWorldPixel(north, z, tileSize)
    val southWorld = latToWorldPixel(south, z, tileSize)
    val leftWorld = min(westWorld, eastWorld)
    val topWorld = min(northWorld, southWorld)
    val spanX = max(1.0, kotlin.math.abs(eastWorld - westWorld))
    val spanY = max(1.0, kotlin.math.abs(southWorld - northWorld))
    // Satellite export images fill this exact Mercator bbox. Match that pixel
    // transform rather than re-centering from latitude/longitude deltas, whose
    // arithmetic latitude midpoint diverges from the Mercator midpoint.
    val scaleX = canvas.width / spanX
    val scaleY = canvas.height / spanY
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.DITHER_FLAG).apply {
      style = Paint.Style.STROKE
      strokeJoin = Paint.Join.ROUND
      strokeCap = Paint.Cap.ROUND
      color = if (countryLayer) Color.argb(225, 210, 240, 252) else Color.argb(170, 174, 222, 240)
      strokeWidth = if (countryLayer) 2.2f else 1.35f
    }
    for (featureIndex in 0 until features.length()) {
      val geometry = features.optJSONObject(featureIndex)?.optJSONObject("geometry") ?: continue
      val rings = geometry.optJSONArray("rings") ?: continue
      drawBoundaryRings(canvas, rings, z, tileSize, leftWorld, topWorld, scaleX, scaleY, paint)
    }
  }

  private fun drawBoundaryRings(
    canvas: Canvas,
    rings: JSONArray,
    zoom: Int,
    tileSize: Int,
    leftWorld: Double,
    topWorld: Double,
    scaleX: Double,
    scaleY: Double,
    paint: Paint,
  ) {
    for (ringIndex in 0 until rings.length()) {
      val ring = rings.optJSONArray(ringIndex) ?: continue
      val path = android.graphics.Path()
      for (pointIndex in 0 until ring.length()) {
        val point = ring.optJSONArray(pointIndex) ?: continue
        val lon = point.optDouble(0, Double.NaN)
        val lat = point.optDouble(1, Double.NaN)
        if (!lon.isFinite() || !lat.isFinite()) continue
        val world = lonLatToWorldPixel(lon, lat, zoom, tileSize)
        val x = ((world.first - leftWorld) * scaleX).toFloat()
        val y = ((world.second - topWorld) * scaleY).toFloat()
        if (pointIndex == 0) path.moveTo(x, y) else path.lineTo(x, y)
      }
      canvas.drawPath(path, paint)
    }
  }

  private fun drawWindSegments(canvas: Canvas, segments: List<WindSegment>, opacity: Double?) {
    if (segments.isEmpty()) return
    val layerOpacity = (opacity ?: 0.72).coerceIn(0.08, 0.95).toFloat()
    val shadow = Paint(Paint.ANTI_ALIAS_FLAG or Paint.DITHER_FLAG).apply {
      style = Paint.Style.STROKE
      strokeCap = Paint.Cap.ROUND
      strokeWidth = 3.2f
      color = Color.argb((55 * layerOpacity).roundToInt(), 8, 13, 24)
    }
    val streak = Paint(Paint.ANTI_ALIAS_FLAG or Paint.DITHER_FLAG).apply {
      style = Paint.Style.STROKE
      strokeCap = Paint.Cap.ROUND
    }

    segments.forEach { segment ->
      val intensity = segment.intensity.coerceIn(0.08, 1.0).toFloat()
      shadow.color = Color.argb((55 * layerOpacity * intensity).roundToInt(), 8, 13, 24)
      canvas.drawLine(segment.x1, segment.y1, segment.x2, segment.y2, shadow)
      val fast = segment.speed >= 13.0
      val medium = segment.speed >= 7.0
      streak.strokeWidth = (if (fast) 1.7f else if (medium) 1.45f else 1.15f) * (0.62f + intensity * 0.38f)
      streak.color =
        if (fast) Color.argb((190 * layerOpacity * intensity).roundToInt(), 240, 249, 255)
        else if (medium) Color.argb((165 * layerOpacity * intensity).roundToInt(), 186, 230, 253)
        else Color.argb((125 * layerOpacity * intensity).roundToInt(), 147, 197, 253)
      canvas.drawLine(segment.x1, segment.y1, segment.x2, segment.y2, streak)
      if (intensity > 0.92f) {
        val head = Paint(Paint.ANTI_ALIAS_FLAG).apply {
          style = Paint.Style.FILL
          color = Color.argb((205 * layerOpacity).roundToInt(), 248, 250, 252)
        }
        canvas.drawCircle(segment.x2, segment.y2, if (fast) 1.7f else 1.25f, head)
      }
    }
  }

  private fun renderTileScene(
    width: Int,
    height: Int,
    frame: ExportFrame,
    underlays: List<Bitmap> = emptyList(),
    underlayOpacities: List<Double> = emptyList(),
  ): Bitmap? {
    val template = frame.tileTemplate ?: return null
    val region = frame.region ?: return null
    val z = (frame.zoom ?: approxZoom(region.longitudeDelta)).roundToInt().coerceIn(1, 12)
    val tileSize = 256
    val worldSize = tileSize * (1 shl z).toDouble()
    val center = lonLatToWorldPixel(region.longitude, region.latitude, z, tileSize)
    val west = region.longitude - region.longitudeDelta / 2.0
    val east = region.longitude + region.longitudeDelta / 2.0
    val north = (region.latitude + region.latitudeDelta / 2.0).coerceIn(-85.0, 85.0)
    val south = (region.latitude - region.latitudeDelta / 2.0).coerceIn(-85.0, 85.0)
    val westPx = lonToWorldPixel(west, z, tileSize)
    val eastPx = lonToWorldPixel(east, z, tileSize)
    val northPy = latToWorldPixel(north, z, tileSize)
    val southPy = latToWorldPixel(south, z, tileSize)
    val spanX = max(1.0, kotlin.math.abs(eastPx - westPx))
    val spanY = max(1.0, kotlin.math.abs(southPy - northPy))
    val scale = min(width / spanX, height / spanY)
    val leftWorld = center.first - width / (2.0 * scale)
    val topWorld = center.second - height / (2.0 * scale)
    val rightWorld = center.first + width / (2.0 * scale)
    val bottomWorld = center.second + height / (2.0 * scale)
    val minTileX = floor(leftWorld / tileSize).toInt() - 1
    val maxTileX = floor(rightWorld / tileSize).toInt() + 1
    val minTileY = max(0, floor(topWorld / tileSize).toInt() - 1)
    val maxTileY = min((1 shl z) - 1, floor(bottomWorld / tileSize).toInt() + 1)

    val out = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG or Paint.DITHER_FLAG)
    canvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
    underlays.forEachIndexed { index, bitmap ->
      val opacity = underlayOpacities.getOrNull(index)?.coerceIn(0.0, 1.0) ?: 1.0
      drawBitmapFit(canvas, bitmap, width, height, paint.apply { alpha = (opacity * 255.0).roundToInt() })
    }
    drawTileTemplateLayer(canvas, width, height, template, region, frame.zoom, ((frame.opacity ?: 0.9) * 255.0).roundToInt())
    paint.alpha = 255
    return out
  }

  private fun drawTileTemplateLayer(
    canvas: Canvas,
    width: Int,
    height: Int,
    tileTemplate: String?,
    region: ExportRegion?,
    zoom: Double?,
    alpha: Int,
  ) {
    if (tileTemplate.isNullOrBlank() || region == null) return
    val isLabelOverlay = tileTemplate.contains("only_labels", ignoreCase = true)
    val zBase = (zoom ?: approxZoom(region.longitudeDelta)).roundToInt()
    // Exported place labels look softer and larger than the live map if we
    // render them at the exact same tile zoom and then scale the bitmap up.
    // Bias label-only overlays one zoom step higher so the text starts from a
    // denser raster, then draw without bitmap filtering to keep edges sharper.
    val z = (zBase + if (isLabelOverlay) 1 else 0).coerceIn(1, 13)
    val tileSize = 256
    val center = lonLatToWorldPixel(region.longitude, region.latitude, z, tileSize)
    val west = region.longitude - region.longitudeDelta / 2.0
    val east = region.longitude + region.longitudeDelta / 2.0
    val north = (region.latitude + region.latitudeDelta / 2.0).coerceIn(-85.0, 85.0)
    val south = (region.latitude - region.latitudeDelta / 2.0).coerceIn(-85.0, 85.0)
    val westPx = lonToWorldPixel(west, z, tileSize)
    val eastPx = lonToWorldPixel(east, z, tileSize)
    val northPy = latToWorldPixel(north, z, tileSize)
    val southPy = latToWorldPixel(south, z, tileSize)
    val spanX = max(1.0, kotlin.math.abs(eastPx - westPx))
    val spanY = max(1.0, kotlin.math.abs(southPy - northPy))
    val scale = min(width / spanX, height / spanY)
    val leftWorld = center.first - width / (2.0 * scale)
    val topWorld = center.second - height / (2.0 * scale)
    val rightWorld = center.first + width / (2.0 * scale)
    val bottomWorld = center.second + height / (2.0 * scale)
    val minTileX = floor(leftWorld / tileSize).toInt() - 1
    val maxTileX = floor(rightWorld / tileSize).toInt() + 1
    val minTileY = max(0, floor(topWorld / tileSize).toInt() - 1)
    val maxTileY = min((1 shl z) - 1, floor(bottomWorld / tileSize).toInt() + 1)
    val paintFlags =
      if (isLabelOverlay) Paint.ANTI_ALIAS_FLAG or Paint.DITHER_FLAG
      else Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG or Paint.DITHER_FLAG
    val paint = Paint(paintFlags).apply {
      this.alpha = alpha.coerceIn(0, 255)
    }

    for (ty in minTileY..maxTileY) {
      for (txRaw in minTileX..maxTileX) {
        val tx = ((txRaw % (1 shl z)) + (1 shl z)) % (1 shl z)
        val url = tileTemplate
          .replace("{z}", z.toString())
          .replace("{x}", tx.toString())
          .replace("{y}", ty.toString())
        val tile = downloadBitmap(url, connectTimeoutMs = 2_500, readTimeoutMs = 3_500) ?: continue
        val left = ((txRaw * tileSize) - leftWorld) * scale
        val top = ((ty * tileSize) - topWorld) * scale
        val dst = RectF(
          left.toFloat(),
          top.toFloat(),
          (left + tileSize * scale).toFloat(),
          (top + tileSize * scale).toFloat(),
        )
        canvas.drawBitmap(tile, null, dst, paint)
        tile.recycle()
      }
    }
  }

  private fun drawExportGrid(canvas: Canvas, width: Int, height: Int) {
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeWidth = 1.2f
      color = Color.argb(48, 96, 165, 250)
    }
    val step = max(72f, min(width, height) / 8f)
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
  }

  private fun drawExportChrome(canvas: Canvas, width: Int, height: Int, title: String, subtitle: String, product: String, frameLabel: String) {
    // Minimal branding/context baked into the video. This avoids needing a
    // separate subtitle track and makes screen-recordable/shared clips readable.
    val panelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.argb(190, 2, 6, 23)
      style = Paint.Style.FILL
    }
    val titlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.WHITE
      textSize = width * 0.032f
      typeface = android.graphics.Typeface.DEFAULT_BOLD
    }
    val smallPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(203, 213, 225)
      textSize = width * 0.018f
      typeface = android.graphics.Typeface.DEFAULT_BOLD
    }
    val cyanPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(34, 211, 238)
      textSize = width * 0.017f
      typeface = android.graphics.Typeface.DEFAULT_BOLD
    }
    val timeCaptionPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(148, 163, 184)
      textSize = width * 0.011f
      typeface = android.graphics.Typeface.DEFAULT_BOLD
      letterSpacing = 0.08f
    }
    val timeValuePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.rgb(103, 232, 249)
      textSize = width * 0.022f
      typeface = android.graphics.Typeface.DEFAULT_BOLD
    }

    val pad = width * 0.025f
    val top = pad
    canvas.drawRoundRect(RectF(pad, top, width - pad, top + height * 0.105f), 24f, 24f, panelPaint)
    val mark = brandMarkBitmap
    if (mark != null) {
      val markSize = min(width * 0.082f, height * 0.056f)
      val markLeft = pad + 24f
      val markTop = top + height * 0.024f
      canvas.drawBitmap(mark, null, RectF(markLeft, markTop, markLeft + markSize, markTop + markSize), Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG or Paint.DITHER_FLAG))
    } else {
      canvas.drawText(title, pad + 24f, top + height * 0.043f, titlePaint)
    }
    canvas.drawText(subtitle, pad + 24f, top + height * 0.084f, smallPaint)
    // Keep the source-frame clock separate from product text so an exported
    // video remains legible when shared without its surrounding app UI.
    val timeWidth = min(width * 0.23f, 220f)
    val timeHeight = height * 0.066f
    val timeLeft = width - pad - 24f - timeWidth
    val timeTop = top + height * 0.018f
    val timePanel = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(156, 15, 23, 42) }
    canvas.drawRoundRect(RectF(timeLeft, timeTop, timeLeft + timeWidth, timeTop + timeHeight), 16f, 16f, timePanel)
    canvas.drawText("FRAME TIME", timeLeft + 14f, timeTop + timeHeight * 0.34f, timeCaptionPaint)
    canvas.drawText(frameLabel, timeLeft + 14f, timeTop + timeHeight * 0.76f, timeValuePaint)
    val productText = product.uppercase(Locale.US)
    val productWidth = cyanPaint.measureText(productText)
    canvas.drawText(productText, width - pad - 24f - productWidth, top + height * 0.094f, cyanPaint)

    canvas.drawRoundRect(RectF(pad, height - pad - 48f, width - pad, height - pad), 20f, 20f, panelPaint)
    canvas.drawText("OMNIwx", pad + 24f, height - pad - 17f, smallPaint)
    val scaleText = "Animated weather loop"
    canvas.drawText(scaleText, width - pad - 24f - smallPaint.measureText(scaleText), height - pad - 17f, smallPaint)
  }

  private fun drawBitmapFit(canvas: Canvas, bitmap: Bitmap, width: Int, height: Int, paint: Paint) {
    // Preserve source aspect ratio. If this becomes "fill" instead of "fit",
    // infrared/true-color products can look stretched in portrait exports.
    val srcRatio = bitmap.width.toFloat() / bitmap.height.toFloat()
    val dstRatio = width.toFloat() / height.toFloat()
    val dst = if (srcRatio > dstRatio) {
      val fitH = (width / srcRatio).roundToInt()
      val top = (height - fitH) / 2
      Rect(0, top, width, top + fitH)
    } else {
      val fitW = (height * srcRatio).roundToInt()
      val left = (width - fitW) / 2
      Rect(left, 0, left + fitW, height)
    }
    canvas.drawBitmap(bitmap, null, dst, paint)
  }

  private fun approxZoom(lonDelta: Double): Double =
    (ln(360.0 / lonDelta.coerceAtLeast(0.0001)) / ln(2.0)).coerceIn(1.0, 12.0)

  private fun lonToWorldPixel(lon: Double, z: Int, tileSize: Int): Double {
    val worldSize = tileSize * (1 shl z).toDouble()
    return ((lon + 180.0) / 360.0) * worldSize
  }

  private fun latToWorldPixel(lat: Double, z: Int, tileSize: Int): Double {
    val clipped = lat.coerceIn(-85.05112878, 85.05112878)
    val sinLat = kotlin.math.sin(Math.toRadians(clipped))
    val worldSize = tileSize * (1 shl z).toDouble()
    return (0.5 - ln((1.0 + sinLat) / (1.0 - sinLat)) / (4.0 * Math.PI)) * worldSize
  }

  private fun lonLatToWorldPixel(lon: Double, lat: Double, z: Int, tileSize: Int): Pair<Double, Double> =
    Pair(lonToWorldPixel(lon, z, tileSize), latToWorldPixel(lat, z, tileSize))

  private fun argbBitmapToYuv420(bitmap: Bitmap, width: Int, height: Int, colorFormat: Int, out: ByteArray) {
    // H.264 encoders typically want YUV420, not ARGB. This is a straightforward
    // RGB -> YUV conversion with chroma sampled once for each 2x2 pixel block.
    val pixels = IntArray(width * height)
    bitmap.getPixels(pixels, 0, width, 0, 0, width, height)
    val frameSize = width * height
    var yIndex = 0
    var uIndex = frameSize
    var vIndex = frameSize + frameSize / 4
    var uvIndex = frameSize
    val semiPlanar =
      colorFormat == MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420SemiPlanar ||
        colorFormat == MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420PackedSemiPlanar
    for (j in 0 until height) {
      for (i in 0 until width) {
        val c = pixels[j * width + i]
        val r = (c shr 16) and 0xff
        val g = (c shr 8) and 0xff
        val b = c and 0xff
        val y = ((66 * r + 129 * g + 25 * b + 128) shr 8) + 16
        out[yIndex++] = y.coerceIn(0, 255).toByte()
        if (j % 2 == 0 && i % 2 == 0) {
          val u = ((-38 * r - 74 * g + 112 * b + 128) shr 8) + 128
          val v = ((112 * r - 94 * g - 18 * b + 128) shr 8) + 128
          if (semiPlanar) {
            out[uvIndex++] = u.coerceIn(0, 255).toByte()
            out[uvIndex++] = v.coerceIn(0, 255).toByte()
          } else {
            out[uIndex++] = u.coerceIn(0, 255).toByte()
            out[vIndex++] = v.coerceIn(0, 255).toByte()
          }
        }
      }
    }
  }

  private fun selectAvcColorFormat(): Int {
    // Devices advertise different YUV layouts. Pick the first common format the
    // available AVC encoder supports, then fall back to flexible YUV420.
    val preferred = listOf(
      MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Planar,
      MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420SemiPlanar,
      MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible,
      MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420PackedPlanar,
      MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420PackedSemiPlanar,
    )
    val infos = MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos
    for (info in infos) {
      if (!info.isEncoder) continue
      if (!info.supportedTypes.any { it.equals(MediaFormat.MIMETYPE_VIDEO_AVC, ignoreCase = true) }) continue
      val caps = runCatching { info.getCapabilitiesForType(MediaFormat.MIMETYPE_VIDEO_AVC) }.getOrNull() ?: continue
      preferred.firstOrNull { desired -> caps.colorFormats.contains(desired) }?.let { return it }
    }
    return MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible
  }

  private fun saveToMovies(source: File): Uri {
    // Android 10+ requires MediaStore scoped-storage writes. Older Android
    // versions can write directly into Movies/OMNIwx.
    val fileName = "OMNIwx-${SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())}.mp4"
    val resolver = reactContext.contentResolver
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val values = ContentValues().apply {
        put(MediaStore.Video.Media.DISPLAY_NAME, fileName)
        put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
        put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/OMNIwx")
        put(MediaStore.Video.Media.IS_PENDING, 1)
      }
      val uri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
        ?: throw IllegalStateException("Could not create video in MediaStore.")
      resolver.openOutputStream(uri)?.use { out ->
        FileInputStream(source).use { input -> input.copyTo(out) }
      } ?: throw IllegalStateException("Could not write exported video.")
      values.clear()
      values.put(MediaStore.Video.Media.IS_PENDING, 0)
      resolver.update(uri, values, null, null)
      return uri
    }

    val movies = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES), "OMNIwx")
    movies.mkdirs()
    val dest = File(movies, fileName)
    FileInputStream(source).use { input -> FileOutputStream(dest).use { output -> input.copyTo(output) } }
    return Uri.fromFile(dest)
  }

  private fun downloadBitmap(
    url: String,
    connectTimeoutMs: Int = 12_000,
    readTimeoutMs: Int = 18_000,
    attempts: Int = 1,
  ): Bitmap? {
    // Renderer cold starts and transient upstream misses are recoverable. Keep
    // retries limited and sequential so a long satellite export cannot turn
    // into an uncontrolled burst of costly renderer requests.
    repeat(attempts.coerceIn(1, 3)) { attempt ->
      var conn: HttpURLConnection? = null
      var retryAfterMs = if (attempt == 0) 0L else 1_200L * attempt
      try {
        conn = (URL(url).openConnection() as HttpURLConnection).apply {
          connectTimeout = connectTimeoutMs
          readTimeout = readTimeoutMs
          requestMethod = "GET"
          setRequestProperty("User-Agent", "OMNIwx Video Export")
          setRequestProperty("Accept", "image/png,image/jpeg,image/*")
        }
        val responseCode = conn.responseCode
        if (responseCode in 200..299) return BitmapFactory.decodeStream(conn.inputStream)
        if (responseCode !in setOf(408, 429, 500, 502, 503, 504)) return null
        conn.getHeaderField("Retry-After")?.toLongOrNull()?.let { seconds ->
          retryAfterMs = (seconds * 1_000L).coerceIn(1_000L, 5_000L)
        }
      } catch (_: Exception) {
        // The bounded retry below handles transient socket and decode failures.
      } finally {
        conn?.disconnect()
      }
      if (attempt + 1 < attempts.coerceIn(1, 3)) Thread.sleep(retryAfterMs)
    }
    return null
  }

  private fun downloadText(
    url: String,
    connectTimeoutMs: Int,
    readTimeoutMs: Int,
  ): String? {
    var conn: HttpURLConnection? = null
    return try {
      conn = (URL(url).openConnection() as HttpURLConnection).apply {
        connectTimeout = connectTimeoutMs
        readTimeout = readTimeoutMs
        requestMethod = "GET"
        setRequestProperty("User-Agent", "OMNIwx Video Export")
        setRequestProperty("Accept", "application/json")
      }
      if (conn.responseCode !in 200..299) null else conn.inputStream.bufferedReader().use { it.readText() }
    } catch (_: Exception) {
      null
    } finally {
      conn?.disconnect()
    }
  }

  private fun readFrames(array: ReadableArray?): List<ExportFrame> {
    // Defensive parser for the JS bridge payload. Bad/empty frames are skipped
    // here so the encoder only sees frames with at least one image URL or a
    // renderable radar tile template.
    if (array == null) return emptyList()
    val list = mutableListOf<ExportFrame>()
    for (i in 0 until array.size()) {
      val item = array.getMap(i) ?: continue
      val urlsArray = item.getArray("urls")
      val urls = mutableListOf<String>()
      if (urlsArray != null) {
        for (j in 0 until urlsArray.size()) {
          urlsArray.getString(j)?.takeIf { it.isNotBlank() }?.let { urls.add(it) }
        }
      }
      val urlOpacities = item.getDoubleList("urlOpacities")
      val boundaryDataUrls = item.getStringList("boundaryDataUrls")
      val underlayUrlsArray = item.getArray("underlayUrls")
      val underlayUrls = mutableListOf<String>()
      if (underlayUrlsArray != null) {
        for (j in 0 until underlayUrlsArray.size()) {
          underlayUrlsArray.getString(j)?.takeIf { it.isNotBlank() }?.let { underlayUrls.add(it) }
        }
      }
      val underlayOpacities = item.getDoubleList("underlayOpacities")
      val tileTemplate = item.optNullableString("tileTemplate")
      val windSegmentsArray = item.getArray("windSegments")
      val windSegments = mutableListOf<WindSegment>()
      if (windSegmentsArray != null) {
        for (j in 0 until windSegmentsArray.size()) {
          val segment = windSegmentsArray.getMap(j) ?: continue
          val x1 = segment.optNullableDouble("x1") ?: continue
          val y1 = segment.optNullableDouble("y1") ?: continue
          val x2 = segment.optNullableDouble("x2") ?: continue
          val y2 = segment.optNullableDouble("y2") ?: continue
          val speed = segment.optNullableDouble("speed") ?: 0.0
          val intensity = segment.optNullableDouble("intensity") ?: 1.0
          windSegments.add(WindSegment(x1.toFloat(), y1.toFloat(), x2.toFloat(), y2.toFloat(), speed, intensity))
        }
      }
      if (urls.isNotEmpty() || underlayUrls.isNotEmpty() || !tileTemplate.isNullOrBlank() || windSegments.isNotEmpty()) {
        list.add(
          ExportFrame(
            label = item.optString("label", "Frame ${i + 1}"),
            urls = urls,
            urlOpacities = urlOpacities,
            boundaryDataUrls = boundaryDataUrls,
            underlayUrls = underlayUrls,
            underlayOpacities = underlayOpacities,
            tileTemplate = tileTemplate,
            basemapTemplate = item.optNullableString("basemapTemplate"),
            basemapBoundaryTemplate = item.optNullableString("basemapBoundaryTemplate"),
            basemapBoundaryOpacity = item.optNullableDouble("basemapBoundaryOpacity"),
            basemapOverlayTemplate = item.optNullableString("basemapOverlayTemplate"),
            basemapOverlayOpacity = item.optNullableDouble("basemapOverlayOpacity"),
            region = item.getMap("region")?.toExportRegion(),
            zoom = item.optNullableDouble("zoom"),
            opacity = item.optNullableDouble("opacity"),
            windSegments = windSegments,
            windOpacity = item.optNullableDouble("windOpacity"),
          )
        )
      }
    }
    return list
  }
}

private data class ExportRegion(
  val latitude: Double,
  val longitude: Double,
  val latitudeDelta: Double,
  val longitudeDelta: Double,
)

private data class ExportFrame(
  val label: String,
  val urls: List<String>,
  val urlOpacities: List<Double> = emptyList(),
  val boundaryDataUrls: List<String> = emptyList(),
  val underlayUrls: List<String> = emptyList(),
  val underlayOpacities: List<Double> = emptyList(),
  val tileTemplate: String? = null,
  val basemapTemplate: String? = null,
  val basemapBoundaryTemplate: String? = null,
  val basemapBoundaryOpacity: Double? = null,
  val basemapOverlayTemplate: String? = null,
  val basemapOverlayOpacity: Double? = null,
  val region: ExportRegion? = null,
  val zoom: Double? = null,
  val opacity: Double? = null,
  val windSegments: List<WindSegment> = emptyList(),
  val windOpacity: Double? = null,
)

private data class RenderSourceFrame(
  val bitmaps: List<Bitmap>,
  val bitmapOpacities: List<Double> = emptyList(),
  val basemapTemplate: String? = null,
  val basemapBoundaryTemplate: String? = null,
  val basemapBoundaryOpacity: Double? = null,
  val basemapOverlayTemplate: String? = null,
  val basemapOverlayOpacity: Double? = null,
  val region: ExportRegion? = null,
  val zoom: Double? = null,
  val windSegments: List<WindSegment> = emptyList(),
  val windOpacity: Double? = null,
)

private data class WindSegment(
  val x1: Float,
  val y1: Float,
  val x2: Float,
  val y2: Float,
  val speed: Double,
  val intensity: Double,
)

private data class PreparedFrame(
  val label: String,
  val scene: Bitmap,
)

private data class StaticMapLayers(
  val base: Bitmap?,
  val boundaries: Bitmap?,
  val labels: Bitmap?,
) {
  fun recycle() {
    listOfNotNull(base, boundaries, labels).forEach { bitmap ->
      runCatching { bitmap.recycle() }
    }
  }
}

private fun ReadableMap.optInt(name: String, fallback: Int): Int =
  if (hasKey(name) && !isNull(name)) getInt(name) else fallback

private fun ReadableMap.optDouble(name: String, fallback: Double): Double =
  if (hasKey(name) && !isNull(name)) getDouble(name) else fallback

private fun ReadableMap.optString(name: String, fallback: String): String =
  if (hasKey(name) && !isNull(name)) getString(name) ?: fallback else fallback

private fun ReadableMap.optNullableString(name: String): String? =
  if (hasKey(name) && !isNull(name)) getString(name) else null

private fun ReadableMap.optNullableDouble(name: String): Double? =
  if (hasKey(name) && !isNull(name)) getDouble(name) else null

private fun ReadableMap.getDoubleList(name: String): List<Double> {
  val array = if (hasKey(name) && !isNull(name)) getArray(name) else null
  if (array == null) return emptyList()
  return buildList {
    for (index in 0 until array.size()) {
      runCatching { array.getDouble(index) }.getOrNull()?.let(::add)
    }
  }
}

private fun ReadableMap.getStringList(name: String): List<String> {
  val array = if (hasKey(name) && !isNull(name)) getArray(name) else null
  if (array == null) return emptyList()
  return buildList {
    for (index in 0 until array.size()) {
      array.getString(index)?.takeIf { it.isNotBlank() }?.let(::add)
    }
  }
}

private fun ReadableMap.toExportRegion(): ExportRegion? {
  val lat = optNullableDouble("latitude") ?: return null
  val lon = optNullableDouble("longitude") ?: return null
  val latDelta = optNullableDouble("latitudeDelta") ?: return null
  val lonDelta = optNullableDouble("longitudeDelta") ?: return null
  if (!lat.isFinite() || !lon.isFinite() || !latDelta.isFinite() || !lonDelta.isFinite()) return null
  return ExportRegion(
    latitude = lat,
    longitude = lon,
    latitudeDelta = latDelta.coerceAtLeast(0.0001),
    longitudeDelta = lonDelta.coerceAtLeast(0.0001),
  )
}

private fun normalizedEven(value: Int, minValue: Int, maxValue: Int): Int {
  val clamped = value.coerceIn(minValue, maxValue)
  return if (clamped % 2 == 0) clamped else clamped - 1
}

private fun frameTimeUs(frameIndex: Long, fps: Int): Long = frameIndex * 1_000_000L / fps
