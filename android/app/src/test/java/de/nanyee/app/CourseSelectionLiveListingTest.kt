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

class CourseSelectionLiveListingTest {
    @Test fun onlyDiscoverCategoriesAndListFirstPage() {
        val account = System.getenv("NANYEE_LIVE_ACCOUNT").orEmpty()
        val password = System.getenv("NANYEE_LIVE_PASSWORD").orEmpty()
        assumeTrue("Read-only listing requires both live credential variables", account.isNotBlank() && password.isNotBlank())
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
                        val login = silentLogin(api, account.trim(), password) { encoded ->
                            attempts++
                            val imageBytes = Base64.getDecoder().decode(encoded.substringAfter(",", encoded))
                            OnnxTensor.createTensor(env, FloatBuffer.wrap(input(imageBytes)), longArrayOf(1, 1, 28, 80)).use { tensor ->
                                model.run(mapOf("image" to tensor)).use { output ->
                                    val digits = output.get("digits").orElseThrow() as OnnxTensor
                                    assertTrue(digits.info.shape.contentEquals(longArrayOf(1, 4, 10)))
                                    val logits = FloatArray(40); digits.floatBuffer.get(logits); decodeCaptcha(logits)
                                }
                            }
                        }
                        assertTrue("Silent login failed; details omitted", login is SilentLoginResult.Success)
                        val listing: CourseGrabListing = api.courseGrab((login as SilentLoginResult.Success).session.text("academic_session_id")) { diagnostic ->
                            println("Discovery HTTP status: ${diagnostic.status ?: "no response"}")
                            println("Discovery redirect paths: ${diagnostic.paths.joinToString(" -> ")}")
                            println("Discovery final path: ${diagnostic.finalPath}")
                            println("Discovery page <title> (public vocabulary only): ${diagnostic.title}")
                            println("Discovery link counts: /xklx/{code}=${diagnostic.pathLinks}; xklxdm={code}=${diagnostic.queryLinks}")
                            println("Discovery visible 选课 context (public vocabulary only, <=200 chars): ${diagnostic.notice}")
                        }
                        stage = "category discovery"
                        val categories = try { listing.categories() } catch (_: GrabSelectionClosed) {
                            println("Discovery outcome: 当前不在选课时间")
                            emptyList()
                        }
                        println("Course category count: ${categories.size}")
                        if (categories.isEmpty()) println("Discovery observation: 没有可选类别")
                        stage = "first-page listing"
                        categories.forEachIndexed { index, category ->
                            val page = listing.courses(category.code, 1)
                            println("Category index: ${index + 1}; first-page count: ${page.courses.size}; reported total: ${page.total}")
                        }
                    }
                }
            } }
        } catch (_: Throwable) {
            throw AssertionError("Read-only course listing failed at $stage; upstream details omitted")
        } finally { api.clear(); println("OCR attempts: $attempts") }
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
