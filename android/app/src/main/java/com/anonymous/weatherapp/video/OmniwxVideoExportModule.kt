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
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

class OmniwxVideoExportModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "OmniwxVideoExport"

  @ReactMethod
  fun exportAnimation(options: ReadableMap, promise: Promise) {
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

        val prepared = frames.map { frame ->
          PreparedFrame(
            label = frame.label,
            bitmaps = frame.urls.mapNotNull { downloadBitmap(it) },
            expectedBitmapCount = frame.urls.size,
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
    val out = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG or Paint.DITHER_FLAG).apply { alpha = 255 }

    canvas.drawColor(Color.rgb(5, 10, 22))
    drawExportGrid(canvas, width, height)
    frame.bitmaps.forEach { drawBitmapFit(canvas, it, width, height, paint) }
    return out
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

  private fun argbBitmapToYuv420(bitmap: Bitmap, width: Int, height: Int, colorFormat: Int, out: ByteArray) {
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

  private fun downloadBitmap(url: String): Bitmap? {
    val conn = (URL(url).openConnection() as HttpURLConnection).apply {
      connectTimeout = 12_000
      readTimeout = 18_000
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
    if (array == null) return emptyList()
    val list = mutableListOf<ExportFrame>()
    for (i in 0 until array.size()) {
      val item = array.getMap(i) ?: continue
      val urlsArray = item.getArray("urls") ?: continue
      val urls = mutableListOf<String>()
      for (j in 0 until urlsArray.size()) {
        urlsArray.getString(j)?.takeIf { it.isNotBlank() }?.let { urls.add(it) }
      }
      if (urls.isNotEmpty()) {
        list.add(ExportFrame(label = item.optString("label", "Frame ${i + 1}"), urls = urls))
      }
    }
    return list
  }
}

private data class ExportFrame(val label: String, val urls: List<String>)
private data class PreparedFrame(val label: String, val bitmaps: List<Bitmap>, val expectedBitmapCount: Int)

private fun ReadableMap.optInt(name: String, fallback: Int): Int =
  if (hasKey(name) && !isNull(name)) getInt(name) else fallback

private fun ReadableMap.optDouble(name: String, fallback: Double): Double =
  if (hasKey(name) && !isNull(name)) getDouble(name) else fallback

private fun ReadableMap.optString(name: String, fallback: String): String =
  if (hasKey(name) && !isNull(name)) getString(name) ?: fallback else fallback

private fun normalizedEven(value: Int, minValue: Int, maxValue: Int): Int {
  val clamped = value.coerceIn(minValue, maxValue)
  return if (clamped % 2 == 0) clamped else clamped - 1
}

private fun frameTimeUs(frameIndex: Long, fps: Int): Long = frameIndex * 1_000_000L / fps
