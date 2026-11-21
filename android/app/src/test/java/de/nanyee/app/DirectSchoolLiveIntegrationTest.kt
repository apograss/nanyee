package de.nanyee.app

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.nio.FloatBuffer
import java.time.LocalDate
import java.time.ZoneId
import java.util.Base64

class DirectSchoolLiveIntegrationTest {
    private fun jvmCaptchaInput(bytes: ByteArray): FloatArray {
        val image = requireNotNull(Class.forName("javax.imageio.ImageIO").getMethod("read", InputStream::class.java).invoke(null, ByteArrayInputStream(bytes))) { "Captcha image unavailable" }
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

    @Test fun silentLoginThenReadSemestersTimetableAndGrades() {
        val account = System.getenv("NANYEE_LIVE_ACCOUNT").orEmpty()
        val password = System.getenv("NANYEE_LIVE_PASSWORD").orEmpty()
        assumeTrue("Live school test requires both credential environment variables", account.isNotBlank() && password.isNotBlank())

        var attempts = 0
        var stage = "model initialization"
        val source: SchoolDataSource = DirectSchoolApi()
        try {
            runBlocking {
                withContext(Dispatchers.IO) {
                    val environment = OrtEnvironment.getEnvironment()
                    val modelBytes = requireNotNull(javaClass.classLoader!!.getResourceAsStream("captcha_model.onnx")) { "Model asset missing" }.use { it.readBytes() }
                    OrtSession.SessionOptions().use { options ->
                        options.setIntraOpNumThreads(1)
                        environment.createSession(modelBytes, options).use { model ->
                            stage = "silent login"
                            val result = silentLogin(source, account.trim(), password) { encoded ->
                                attempts++
                                val bytes = Base64.getDecoder().decode(encoded.substringAfter(",", encoded))
                                val input = jvmCaptchaInput(bytes)
                                OnnxTensor.createTensor(environment, FloatBuffer.wrap(input), longArrayOf(1, 1, 28, 80)).use { tensor ->
                                    model.run(mapOf("image" to tensor)).use { output ->
                                        val digits = output.get("digits").orElseThrow { IllegalStateException("Model output missing") } as OnnxTensor
                                        assertTrue("Unexpected model output shape", digits.info.shape.contentEquals(longArrayOf(1, 4, 10)))
                                        val logits = FloatArray(40)
                                        digits.floatBuffer.get(logits)
                                        decodeCaptcha(logits)
                                    }
                                }
                            }
                            assertTrue("Silent login fell back to manual; details omitted", result is SilentLoginResult.Success)
                            val session = (result as SilentLoginResult.Success).session
                            fun body(semester: String? = null): JsonObject = buildJsonObject {
                                put("academic_session_id", session.text("academic_session_id"))
                                if (semester != null) put("semester_code", semester)
                                put("total_weeks", 20)
                            }

                            stage = "semesters"
                            val semesters = source.request("timetable.semesters", body())
                            val optionsList = semesters.items("semesters")
                            println("Semesters: ${optionsList.size}")
                            assertTrue("No semester models", optionsList.isNotEmpty())
                            val currentSemester = semesters.text("default_code")
                            assertTrue("Current semester missing from options", optionsList.any { it.text("code") == currentSemester })

                            stage = "timetable"
                            val timetable = source.request("timetable", body(currentSemester))
                            val courses = timetable.items("courses")
                            println("Courses: ${courses.size}")
                            assertTrue("No course models", courses.isNotEmpty())
                            assertTrue("Incomplete course models", courses.all { it.text("name").isNotBlank() && it.number("weekday") in 1..7 && (it["weeks"] as? JsonArray)?.isNotEmpty() == true })
                            val numbers = timetable["exam_numbers"] as? JsonObject
                            assertTrue("Task enrichment failed", numbers != null)
                            assertTrue("Exam list enrichment failed", timetable["exam_rows"] is JsonArray)
                            val exams = mergeExamCourses(courses, numbers!!, timetable.items("exam_rows")).filter(::isExam)
                            val attached = exams.count { it.text("exam_number").isNotBlank() }
                            println("Timetable exams: ${exams.size}; with exam number: $attached")
                            assertTrue("No timetable exam components", exams.isNotEmpty())
                            assertTrue("Exam number join incomplete", attached == exams.size)

                            stage = "calendar"
                            val startDate = source.timetableSemesterStart(body(currentSemester))
                            val validStart = runCatching { LocalDate.parse(startDate) }.isSuccess
                            val currentWeek = currentTeachingWeek(startDate, LocalDate.now(ZoneId.of("Asia/Shanghai")), 20)
                            println("Calendar start-date present: $validStart")
                            println("Current teaching-week present: ${currentWeek != null}")
                            assertTrue("Calendar start-date missing", validStart)

                            stage = "grades"
                            val grades = source.request("grades", body())
                            val records = grades.items("grades")
                            val summaryPresent = (grades["summary"] as? JsonObject)?.isNotEmpty() == true
                            println("Grade records: ${records.size}")
                            println("Summary present: $summaryPresent")
                            assertTrue("No grade models", records.isNotEmpty())
                            assertTrue("Grade summary missing", summaryPresent)
                        }
                    }
                }
            }
        } catch (_: Throwable) {
            throw AssertionError("Read-only live school test failed at $stage; upstream details omitted")
        } finally {
            source.clear()
            println("OCR attempts: $attempts")
            println("Model input shape: [1, 1, 28, 80]; output shape: [1, 4, 10]")
        }
    }
}
