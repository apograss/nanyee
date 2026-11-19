package de.nanyee.app

import android.content.res.AssetManager
import android.graphics.BitmapFactory
import android.util.Base64
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.nio.FloatBuffer
import kotlin.math.floor

internal fun captchaInput(pixels: IntArray, width: Int, height: Int): FloatArray {
    require(width > 0 && height > 0 && pixels.size == width * height)
    fun luminance(x: Int, y: Int): Float {
        val color = pixels[y * width + x]
        return (0.299f * (color ushr 16 and 255) + 0.587f * (color ushr 8 and 255) + 0.114f * (color and 255)) / 255f
    }
    return FloatArray(28 * 80) { index ->
        val x = ((index % 80 + 0.5f) * width / 80f - 0.5f).coerceIn(0f, (width - 1).toFloat())
        val y = ((index / 80 + 0.5f) * height / 28f - 0.5f).coerceIn(0f, (height - 1).toFloat())
        val x0 = floor(x).toInt(); val y0 = floor(y).toInt()
        val x1 = (x0 + 1).coerceAtMost(width - 1); val y1 = (y0 + 1).coerceAtMost(height - 1)
        val top = luminance(x0, y0) * (1 - (x - x0)) + luminance(x1, y0) * (x - x0)
        val bottom = luminance(x0, y1) * (1 - (x - x0)) + luminance(x1, y1) * (x - x0)
        top * (1 - (y - y0)) + bottom * (y - y0)
    }
}

internal fun decodeCaptcha(logits: FloatArray): String {
    require(logits.size == 40 && logits.all { it.isFinite() })
    return (0 until 4).joinToString("") { position ->
        (0 until 10).maxBy { logits[position * 10 + it] }.toString()
    }
}

internal class CaptchaOcr(private val assets: AssetManager) {
    private val lock = Mutex()
    private var session: OrtSession? = null

    suspend fun recognize(image: String): String = withContext(Dispatchers.Default) {
        lock.withLock {
            val bytes = Base64.decode(image.substringAfter(",", image), Base64.DEFAULT)
            val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: error("验证码图片无法读取")
            val input = try {
                require(bitmap.width * bitmap.height <= 1024 * 1024)
                val pixels = IntArray(bitmap.width * bitmap.height)
                bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
                captchaInput(pixels, bitmap.width, bitmap.height)
            } finally { bitmap.recycle() }
            val environment = OrtEnvironment.getEnvironment()
            val model = session ?: OrtSession.SessionOptions().use { options ->
                options.setIntraOpNumThreads(1)
                environment.createSession(assets.open("captcha_model.onnx").use { it.readBytes() }, options).also { session = it }
            }
            OnnxTensor.createTensor(environment, FloatBuffer.wrap(input), longArrayOf(1, 1, 28, 80)).use { tensor ->
                model.run(mapOf("image" to tensor)).use { result ->
                    val digits = result.get("digits").orElseThrow { IllegalStateException("验证码模型输出无效") } as OnnxTensor
                    require(digits.info.shape.contentEquals(longArrayOf(1, 4, 10)))
                    val values = FloatArray(40)
                    digits.floatBuffer.get(values)
                    decodeCaptcha(values)
                }
            }
        }
    }

    suspend fun close() = withContext(Dispatchers.Default) { lock.withLock { session?.close(); session = null } }
}
