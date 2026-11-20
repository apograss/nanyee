package de.nanyee.app

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDate

class VisualStyleTest {
    @Test fun toolGridAdaptsToPhonesFontScaleAndTablets() {
        assertEquals(2, toolColumnCount(336f, 1f))
        assertEquals(1, toolColumnCount(300f, 1f))
        assertEquals(1, toolColumnCount(336f, 1.6f))
        assertEquals(4, toolColumnCount(744f, 1f))
        assertEquals(5, toolColumnCount(1600f, 1f))
        assertEquals(1, toolColumnCount(0f, 1f))
    }

    @Test fun courseColoursDependOnlyOnNameAndHaveReadableContrastInBothThemes() {
        val names = listOf("人体解剖学", "大学英语", "基础化学", "", "Medical English")
        val first = names.associateWith { coursePaletteIndex(it) }
        assertEquals(first, names.reversed().associateWith { coursePaletteIndex(it) })
        assertEquals((0..5).toSet(), (0..5).map { coursePaletteIndex(it.toString()) }.toSet())
        (names + (0..5).map { it.toString() }).forEach { name ->
            assertTrue(coursePaletteIndex(name) in 0..5)
            listOf(false, true).forEach { dark ->
                val foreground = if (dark) Color(0xFFECEAE3) else Color(0xFF1F1E1D)
                val back = courseFill(name, dark).luminance()
                val text = foreground.luminance()
                assertTrue((maxOf(back, text) + 0.05f) / (minOf(back, text) + 0.05f) >= 7f)
            }
        }
    }

    @Test fun dateHeadersFollowSelectedWeekAndDoNotInventMissingCalendarDates() {
        assertEquals(LocalDate.of(2026, 11, 16), teachingWeekMonday("2026-11-18", 1))
        assertEquals(LocalDate.of(2026, 11, 23), teachingWeekMonday("2026-11-18", 2))
        assertEquals(LocalDate.of(2027, 1, 4), teachingWeekMonday("2026-12-28", 2))
        assertNull(teachingWeekMonday("", 1))
        assertNull(teachingWeekMonday("invalid", 1))
        assertNull(teachingWeekMonday("2026-11-16", 0))
    }

    @Test fun periodEndsUseObservedCourseEndTimesAndKeepUnknownTimesDistinct() {
        val course = Json.parseToJsonElement("""{"start_node":1,"end_node":2,"start_time":"08:00","end_time":"09:25"}""").jsonObject
        assertEquals("09:25", periodEndTimes(listOf(course))[1])
        assertEquals("08:40", periodEndTimes(listOf(course))[0])
        assertEquals("—", periodEndTimes(emptyList())[0])
        val invalid = Json.parseToJsonElement("""{"start_node":1,"end_node":2,"start_time":"invalid"}""").jsonObject
        assertEquals("—", periodEndTimes(listOf(invalid))[0])
        assertEquals("—", periodEndTimes(listOf(invalid))[1])
        val conflicting = JsonObject(course + ("end_time" to JsonPrimitive("09:30")))
        assertEquals("—", periodEndTimes(listOf(course, conflicting))[1])
    }
}
