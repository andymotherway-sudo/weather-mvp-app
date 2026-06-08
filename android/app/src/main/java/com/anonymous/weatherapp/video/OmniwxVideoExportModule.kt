package com.anonymous.weatherapp.video

import android.content.ContentValues
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
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
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
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
  override fun getName(): String = "OmniwxVideoExport"

  @ReactMethod
  fun exportAnimation(options: ReadableMap, promise: Promise) {
    // Encoding and network downloads must not run on React Native's JS thread.
    // The Promise is resolved/rejected when this background worker finishes.
    thread(name = "omniwx-video-export") {
      try {
        val frames = readFrames(options.getArray("frames"))
        if (frames.size < 2) throw IllegalArgumentException("At least two animation frames are required.")

        val width = normalizedEven(options.optInt("width", 1280), 320, 1920)
        val height = normalizedEven(options.optInt("height", 720), 320, 1920)
        val fps = options.optInt("fps", 30).coerceIn(12, 30)
        val secondsPerSourceFrame = options.optDouble("secondsPerSourceFrame", 0.52).coerceIn(0.25, 2.0)
        val transitionSeconds = options.optDouble("transitionSeconds", 0.22).coerceIn(0.0, secondsPerSourceFrame)
        val title = options.optString("title", "OMNIwx")
        val subtitle = options.optString("subtitle", "Weather animation")
        val product = options.optString("productLabel", "Weather loop")

        // Require every URL/layer for a source frame to prepare. Some products
        // are composite layers; exporting partial layers would cause flashing or
        // misleading blank frames. Radar frames can now arrive as tile templates
        // so the MP4 uses the same time-resolved source as the on-map animation.
        val prepared = frames.map { frame ->
          val underlayBitmaps = frame.underlayUrls.mapNotNull { downloadBitmap(it, connectTimeoutMs = 7_000, readTimeoutMs = 10_000) }
          val tileScene =
            if (underlayBitmaps.size == frame.underlayUrls.size) renderTileScene(width, height, frame, underlayBitmaps) else null
          underlayBitmaps.forEach { runCatching { it.recycle() } }
          val urlBitmaps = frame.urls.mapNotNull { downloadBitmap(it, connectTimeoutMs = 7_000, readTimeoutMs = 10_000) }
          val bitmaps = listOfNotNull(tileScene) + urlBitmaps
          val expectedCount = frame.urls.size + if (frame.tileTemplate != null) 1 else 0
          PreparedFrame(
            label = frame.label,
            bitmaps = bitmaps,
            expectedBitmapCount = expectedCount,
            basemapTemplate = frame.basemapTemplate,
            basemapOverlayTemplate = frame.basemapOverlayTemplate,
            region = frame.region,
            zoom = frame.zoom,
          )
        }.filter { it.bitmaps.isNotEmpty() && it.bitmaps.size == it.expectedBitmapCount }
        if (prepared.size < 2) throw IllegalStateException("Could not download enough frames to export video.")

        val output = File(reactContext.cacheDir, "omniwx-export-${System.currentTimeMillis()}.mp4")
        encodeVideo(
          frames = prepared,
          output = output,
          width = width,
          height = height,
          fps = fps,
          secondsPerSourceFrame = secondsPerSourceFrame,
          transitionSeconds = transitionSeconds,
          title = title,
          subtitle = subtitle,
          product = product,
        )

        val savedUri = saveToMovies(output)
        val result = Arguments.createMap().apply {
          putString("uri", savedUri.toString())
          putString("filePath", output.absolutePath)
          putInt("width", width)
          putInt("height", height)
          putInt("frameCount", prepared.size)
        }
        promise.resolve(result)
      } catch (t: Throwable) {
        promise.reject("OMNIWX_VIDEO_EXPORT_FAILED", t.message ?: "Video export failed.", t)
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
    title: String,
    subtitle: String,
    product: String,
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

      val holdFrames = max(1, (secondsPerSourceFrame * fps).roundToInt())
      val transitionFrames = min(holdFrames - 1, (transitionSeconds * fps).roundToInt())
      val solidFrames = max(1, holdFrames - transitionFrames)

      frames.forEachIndexed { index, current ->
        // Forward loop: after the last frame, blend back to the first. This
        // matches user expectation better than ping-pong playback for weather.
        val next = frames[(index + 1) % frames.size]
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
        for (step in 1..transitionFrames) {
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
      frames.flatMap { it.bitmaps }.forEach { runCatching { it.recycle() } }
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
    // Compose one final video frame. "Scene" is the weather imagery; "chrome"
    // is the OMNIwx title/footer overlay. During transitions we render both
    // current and next scenes and alpha-blend them.
    val out = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG or Paint.DITHER_FLAG)

    canvas.drawColor(Color.rgb(5, 10, 22))
    drawExportGrid(canvas, width, height)

    val currentScene = composeSatelliteScene(width, height, current)
    if (next != null && blend > 0f) {
      val nextScene = composeSatelliteScene(width, height, next)
      canvas.drawBitmap(currentScene, 0f, 0f, paint.apply { alpha = (255 * (1f - blend)).roundToInt() })
      canvas.drawBitmap(nextScene, 0f, 0f, paint.apply { alpha = (255 * blend).roundToInt() })
      nextScene.recycle()
    } else {
      canvas.drawBitmap(currentScene, 0f, 0f, paint.apply { alpha = 255 })
    }
    currentScene.recycle()

    paint.alpha = 255
    drawExportChrome(canvas, width, height, title, subtitle, product, current.label)
    return out
  }

  private fun composeSatelliteScene(width: Int, height: Int, frame: PreparedFrame): Bitmap {
    // A source frame may include more than one bitmap layer. Draw every layer
    // with aspect-fit rules so radar/satellite products keep their shape.
    val out = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG or Paint.DITHER_FLAG).apply { alpha = 255 }

    canvas.drawColor(Color.rgb(5, 10, 22))
    drawExportGrid(canvas, width, height)
    drawTileTemplateLayer(canvas, width, height, frame.basemapTemplate, frame.region, frame.zoom, 245)
    frame.bitmaps.forEach { drawBitmapFit(canvas, it, width, height, paint) }
    drawTileTemplateLayer(canvas, width, height, frame.basemapOverlayTemplate, frame.region, frame.zoom, 235)
    return out
  }

  private fun renderTileScene(width: Int, height: Int, frame: ExportFrame, underlays: List<Bitmap> = emptyList()): Bitmap? {
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
    canvas.drawColor(Color.rgb(5, 10, 22))
    drawExportGrid(canvas, width, height)

    drawTileTemplateLayer(canvas, width, height, frame.basemapTemplate, region, frame.zoom, 245)
    underlays.forEach { drawBitmapFit(canvas, it, width, height, paint.apply { alpha = 255 }) }
    drawTileTemplateLayer(canvas, width, height, template, region, frame.zoom, ((frame.opacity ?: 0.9) * 255.0).roundToInt())
    drawTileTemplateLayer(canvas, width, height, frame.basemapOverlayTemplate, region, frame.zoom, 235)
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
    val z = (zoom ?: approxZoom(region.longitudeDelta)).roundToInt().coerceIn(1, 12)
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
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG or Paint.DITHER_FLAG).apply {
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

    val pad = width * 0.025f
    val top = pad
    canvas.drawRoundRect(RectF(pad, top, width - pad, top + height * 0.105f), 24f, 24f, panelPaint)
    canvas.drawText(title, pad + 24f, top + height * 0.043f, titlePaint)
    canvas.drawText(subtitle, pad + 24f, top + height * 0.078f, smallPaint)
    val rightLabel = "$product  •  $frameLabel"
    val rightWidth = cyanPaint.measureText(rightLabel)
    canvas.drawText(rightLabel, width - pad - 24f - rightWidth, top + height * 0.062f, cyanPaint)

    canvas.drawRoundRect(RectF(pad, height - pad - 48f, width - pad, height - pad), 20f, 20f, panelPaint)
    canvas.drawText("OMNIwx cinematic export", pad + 24f, height - pad - 17f, smallPaint)
    val scaleText = "cached frames • crossfaded MP4"
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

  private fun downloadBitmap(url: String, connectTimeoutMs: Int = 12_000, readTimeoutMs: Int = 18_000): Bitmap? {
    // Fail a single URL by returning null; exportAnimation decides whether there
    // are still enough complete frames to proceed.
    val conn = (URL(url).openConnection() as HttpURLConnection).apply {
      connectTimeout = connectTimeoutMs
      readTimeout = readTimeoutMs
      requestMethod = "GET"
      setRequestProperty("User-Agent", "OMNIwx Alpha Video Export")
      setRequestProperty("Accept", "image/png,image/jpeg,image/*")
    }
    return try {
      if (conn.responseCode !in 200..299) return null
      BitmapFactory.decodeStream(conn.inputStream)
    } finally {
      conn.disconnect()
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
      val underlayUrlsArray = item.getArray("underlayUrls")
      val underlayUrls = mutableListOf<String>()
      if (underlayUrlsArray != null) {
        for (j in 0 until underlayUrlsArray.size()) {
          underlayUrlsArray.getString(j)?.takeIf { it.isNotBlank() }?.let { underlayUrls.add(it) }
        }
      }
      val tileTemplate = item.optNullableString("tileTemplate")
      if (urls.isNotEmpty() || underlayUrls.isNotEmpty() || !tileTemplate.isNullOrBlank()) {
        list.add(
          ExportFrame(
            label = item.optString("label", "Frame ${i + 1}"),
            urls = urls,
            underlayUrls = underlayUrls,
            tileTemplate = tileTemplate,
            basemapTemplate = item.optNullableString("basemapTemplate"),
            basemapOverlayTemplate = item.optNullableString("basemapOverlayTemplate"),
            region = item.getMap("region")?.toExportRegion(),
            zoom = item.optNullableDouble("zoom"),
            opacity = item.optNullableDouble("opacity"),
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
  val underlayUrls: List<String> = emptyList(),
  val tileTemplate: String? = null,
  val basemapTemplate: String? = null,
  val basemapOverlayTemplate: String? = null,
  val region: ExportRegion? = null,
  val zoom: Double? = null,
  val opacity: Double? = null,
)
private data class PreparedFrame(
  val label: String,
  val bitmaps: List<Bitmap>,
  val expectedBitmapCount: Int,
  val basemapTemplate: String? = null,
  val basemapOverlayTemplate: String? = null,
  val region: ExportRegion? = null,
  val zoom: Double? = null,
)

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
