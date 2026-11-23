package de.nanyee.app

import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import kotlin.math.pow

class CourseColorsTest {
    private fun course(name: String, code: String = "", session: String = "") = buildJsonObject {
        put("name", name); put("kcbh", code); put("course_id", session)
    }

    @Test fun assignmentIsUniqueWithinPaletteAndIndependentOfInputOrder() {
        val courses = (0 until coursePalette.size).map { course("课程$it") }
        val colors = courseColors(courses)
        assertEquals(coursePalette.size, colors.values.toSet().size)
        assertEquals(colors, courseColors(courses.reversed()))
        assertEquals(colors, courseColors(courses + courses))
    }

    @Test fun sessionsAndExamRowsShareCourseIdentityAndOldCachesStillWork() {
        val a = course(" 解剖学 ", "A", "session-1")
        val b = course("解剖学", "A", "exam-1")
        assertEquals(courseColorKey(a), courseColorKey(b))
        assertEquals(1, courseColors(listOf(a, b)).size)
        assertEquals("A", courseColorKey(course("", "A")))
        assertEquals("解剖学", courseColorKey(course("解剖学")))
        assertTrue(courseColors(emptyList()).isEmpty())
    }

    @Test fun overflowIsBoundedAndWhiteTextHasNormalTextContrast() {
        assertTrue(courseColors((0..100).map { course("课程$it") }).values.all { it in coursePalette.indices })
        coursePalette.forEach { color ->
            fun linear(shift: Int): Double {
                val channel = ((color shr shift) and 255).toDouble() / 255
                return if (channel <= 0.04045) channel / 12.92 else ((channel + 0.055) / 1.055).pow(2.4)
            }
            val luminance = 0.2126 * linear(16) + 0.7152 * linear(8) + 0.0722 * linear(0)
            assertTrue(color.toString(16), 1.05 / (luminance + 0.05) >= 4.5)
        }
    }
}
