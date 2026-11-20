package de.nanyee.app

import androidx.compose.ui.graphics.compositeOver
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

    @Test fun jewelColoursDependOnlyOnNameAndHaveReadableContrastOnInk() {
        val names = listOf("人体解剖学", "大学英语", "基础化学", "", "Medical English")
        val first = names.associateWith { coursePaletteIndex(it) }
        assertEquals(first, names.reversed().associateWith { coursePaletteIndex(it) })
        assertEquals((0..6).toSet(), (0..6).map { coursePaletteIndex(it.toString()) }.toSet())
        (names + (0..6).map { it.toString() }).forEach { name ->
            assertTrue(coursePaletteIndex(name) in 0..6)
            assertEquals(0.22f, courseFill(name).alpha, 0.001f)
            assertEquals(1f, courseAccent(name).alpha, 0f)
            listOf(InkBase, InkLive.copy(alpha = 0.035f).compositeOver(InkBase)).forEach { surface ->
                val back = courseFill(name).compositeOver(surface).luminance()
                val text = InkText.luminance()
                assertTrue((maxOf(back, text) + 0.05f) / (minOf(back, text) + 0.05f) >= 7f)
            }
        }
    }

    @Test fun fixedPaletteKeepsTextReadableAcrossRaisedSurfaces() {
        assertEquals(InkBase, inkColors.background)
        assertEquals(InkAccent, inkColors.primary)
        listOf(InkBase, InkSurface, InkRaised).forEach { surface ->
            assertTrue((InkText.luminance() + 0.05f) / (surface.luminance() + 0.05f) >= 7f)
            assertTrue((InkMuted.luminance() + 0.05f) / (surface.luminance() + 0.05f) >= 4.5f)
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
