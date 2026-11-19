package de.nanyee.app

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.nio.FloatBuffer
import java.util.Base64

class EvaluationLiveListingTest {
    @Test fun silentLoginThenOnlyListPendingEvaluations() {
        val account = System.getenv("NANYEE_LIVE_ACCOUNT").orEmpty()
        val password = System.getenv("NANYEE_LIVE_PASSWORD").orEmpty()
        assumeTrue("Read-only listing requires both live credential environment variables", account.isNotBlank() && password.isNotBlank())
        val api = DirectSchoolApi()
        var attempts = 0
        var stage = "model initialization"
        try {
            runBlocking { withContext(Dispatchers.IO) {
                val env = OrtEnvironment.getEnvironment()
                val bytes = requireNotNull(javaClass.classLoader!!.getResourceAsStream("captcha_model.onnx")).use { it.readBytes() }
                OrtSession.SessionOptions().use { options ->
                    options.setIntraOpNumThreads(1)
                    env.createSession(bytes, options).use { model ->
                        stage = "silent login"
                        val result = silentLogin(api, account.trim(), password) { encoded ->
                            attempts++
                            val imageBytes = Base64.getDecoder().decode(encoded.substringAfter(",", encoded))
                            val input = input(imageBytes)
                            OnnxTensor.createTensor(env, FloatBuffer.wrap(input), longArrayOf(1, 1, 28, 80)).use { tensor ->
                                model.run(mapOf("image" to tensor)).use { output ->
                                    val digits = output.get("digits").orElseThrow() as OnnxTensor
                                    assertTrue(digits.info.shape.contentEquals(longArrayOf(1, 4, 10)))
                                    val logits = FloatArray(40); digits.floatBuffer.get(logits); decodeCaptcha(logits)
                                }
                            }
                        }
                        assertTrue("Silent login failed; details omitted", result is SilentLoginResult.Success)
                        stage = "pending evaluation listing"
                        val pending = api.evaluations((result as SilentLoginResult.Success).session.text("academic_session_id")).pending()
                        println("Pending evaluation count: ${pending.size}")
                        println("Reference shape valid: ${pending.all { it.teacher.isNotBlank() && it.hour.isNotBlank() && it.questionnaire.isNotBlank() }}")
                    }
                }
            } }
        } catch (_: Throwable) {
            throw AssertionError("Read-only evaluation listing failed at $stage; upstream details omitted")
        } finally {
            api.clear()
            println("OCR attempts: $attempts")
        }
    }
    private fun input(bytes: ByteArray): FloatArray {
        val image = requireNotNull(Class.forName("javax.imageio.ImageIO").getMethod("read", InputStream::class.java).invoke(null, ByteArrayInputStream(bytes)))
        val type = Class.forName("java.awt.image.BufferedImage")
        try {
            val width = type.getMethod("getWidth").invoke(image) as Int
            val height = type.getMethod("getHeight").invoke(image) as Int
            require(width.toLong() * height in 1..1024 * 1024)
            val int = Integer.TYPE
            val pixels = type.getMethod("getRGB", int, int, int, int, IntArray::class.java, int, int).invoke(image, 0, 0, width, height, null, 0, width) as IntArray
            return captchaInput(pixels, width, height)
        } finally { type.getMethod("flush").invoke(image) }
    }
}
