package de.nanyee.app

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import java.nio.FloatBuffer
import org.junit.Assert.*
import org.junit.Test

class CaptchaOcrTest {
    @Test fun bundledModelRecognizesTheOfflineReferenceCaptcha() {
        val loader = javaClass.classLoader!!
        val rgb = loader.getResourceAsStream("captcha-fixture.rgb")!!.use { it.readBytes() }
        assertEquals(80 * 28 * 3, rgb.size)
        val pixels = IntArray(80 * 28) { i ->
            (0xff shl 24) or ((rgb[i * 3].toInt() and 255) shl 16) or
                ((rgb[i * 3 + 1].toInt() and 255) shl 8) or (rgb[i * 3 + 2].toInt() and 255)
        }
        val input = captchaInput(pixels, 80, 28)
        val environment = OrtEnvironment.getEnvironment()
        val bytes = loader.getResourceAsStream("captcha_model.onnx")!!.use { it.readBytes() }
        OrtSession.SessionOptions().use { options ->
            options.setIntraOpNumThreads(1)
            environment.createSession(bytes, options).use { model ->
                OnnxTensor.createTensor(environment, FloatBuffer.wrap(input), longArrayOf(1, 1, 28, 80)).use { tensor ->
                    model.run(mapOf("image" to tensor)).use { output ->
                        val result = output.get("digits").get() as OnnxTensor
                        assertArrayEquals(longArrayOf(1, 4, 10), result.info.shape)
                        val logits = FloatArray(40)
                        result.floatBuffer.get(logits)
                        assertEquals("7464", decodeCaptcha(logits))
                    }
                }
            }
        }
    }
    @Test fun luminanceUsesTrainingWeightsAndRowMajorLayout() {
        val pixels = IntArray(80 * 28) { 0xFF000000.toInt() }
        pixels[0] = 0xFFFF0000.toInt(); pixels[1] = 0xFF00FF00.toInt(); pixels[80] = 0xFF0000FF.toInt(); pixels[81] = 0xFFFFFFFF.toInt()
        val input = captchaInput(pixels, 80, 28)
        assertEquals(2240, input.size)
        assertEquals(0.299f, input[0], 0.00001f)
        assertEquals(0.587f, input[1], 0.00001f)
        assertEquals(0.114f, input[80], 0.00001f)
        assertEquals(1f, input[81], 0.00001f)
        assertEquals(0f, input[79], 0f)
    }

    @Test fun resizingIsBilinearAndKeepsNormalizedBounds() {
        val input = captchaInput(intArrayOf(0xFF000000.toInt(), 0xFFFFFFFF.toInt()), 2, 1)
        assertEquals(0f, input.first(), 0f)
        assertEquals(1f, input.last(), 0.00001f)
        assertEquals(0.4875f, input[39], 0.00001f)
        assertTrue(input.all { it in 0f..1f })
        assertTrue(captchaInput(intArrayOf(0xFFFFFFFF.toInt()), 1, 1).all { kotlin.math.abs(it - 1f) < 0.00001f })
    }

    @Test fun argmaxPreservesLeadingZerosAndUsesFourPositionsOfTen() {
        val logits = FloatArray(40) { -10f }
        listOf(0, 7, 3, 9).forEachIndexed { position, digit -> logits[position * 10 + digit] = 2f }
        assertEquals("0739", decodeCaptcha(logits))
        assertEquals("0000", decodeCaptcha(FloatArray(40)))
    }

    @Test fun invalidPixelsAndOutputsAreRejected() {
        assertTrue(runCatching { captchaInput(intArrayOf(), 0, 28) }.isFailure)
        assertTrue(runCatching { captchaInput(intArrayOf(), 80, 28) }.isFailure)
        assertTrue(runCatching { decodeCaptcha(FloatArray(39)) }.isFailure)
        assertTrue(runCatching { decodeCaptcha(FloatArray(40) { Float.NaN }) }.isFailure)
    }
}
