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

    @Test fun courseColoursDependOnlyOnNameAndKeepWhiteTextReadable() {
        val names = listOf("人体解剖学", "大学英语", "基础化学", "", "Medical English")
        val first = names.associateWith { coursePaletteIndex(it) }
        assertEquals(first, names.reversed().associateWith { coursePaletteIndex(it) })
        assertEquals((0..6).toSet(), (0..6).map { coursePaletteIndex(it.toString()) }.toSet())
        (names + (0..6).map { it.toString() }).forEach { name ->
            assertTrue(coursePaletteIndex(name) in 0..6)
            assertEquals(0.85f, courseFill(name).alpha, 0.001f)
            assertEquals(1f, courseAccent(name).alpha, 0f)
            listOf(TimetableTop, TimetableBottom).forEach { surface ->
                val back = courseFill(name).compositeOver(surface).luminance()
                val text = androidx.compose.ui.graphics.Color.White.luminance()
                assertTrue((maxOf(back, text) + 0.05f) / (minOf(back, text) + 0.05f) >= 3f)
            }
        }
    }

    @Test fun secondaryTypographyInheritsItsSurfaceColour() {
        assertEquals(androidx.compose.ui.graphics.Color.Unspecified, AppSecondaryTextStyle.color)
        assertEquals(13f, AppSecondaryTextStyle.fontSize.value, 0f)
        assertEquals(16f, AppSecondaryTextStyle.lineHeight.value, 0f)
    }

    @Test fun neutralCourseFallbackIconHasAccessibleContrast() {
        assertTrue((AppBackground.luminance() + 0.05f) / (AppMuted.luminance() + 0.05f) >= 4.5f)
    }

    @Test fun fixedPaletteKeepsTextReadableAcrossRaisedSurfaces() {
        assertEquals(AppBackground, appColors.background)
        assertEquals(AppPrimary, appColors.primary)
        assertEquals(AppCard, appColors.surfaceContainerHighest)
        listOf(AppBackground, AppSurface, AppCard).forEach { surface ->
            assertTrue((surface.luminance() + 0.05f) / (AppText.luminance() + 0.05f) >= 7f)
            assertTrue((surface.luminance() + 0.05f) / (AppMuted.luminance() + 0.05f) >= 4.5f)
        }
    }

    @Test fun calendarUnavailableIsNotAnAllClearStatus() {
        assertEquals("校历不可用", timetableCalendarStatus("", null, "加载失败"))
        assertEquals("校历不可用", timetableCalendarStatus("", null, "离线课表"))
        assertEquals("校历不可用", timetableCalendarStatus("invalid", null, ""))
        assertEquals("本机课表", timetableCalendarStatus("2026-11-16", 1, ""))
        assertEquals("本机 · 更新于 09:22", timetableCalendarStatus("2026-11-16", 1, "本机 · 更新于 09:22"))
    }

    @Test fun validCalendarOutsideTeachingWeeksIsNotUnavailable() {
        val start = "2026-02-23"
        listOf("2026-02-22", "2026-07-13", "2026-11-20").forEach { date ->
            val week = currentTeachingWeek(start, LocalDate.parse(date), 20)
            assertNull(week)
            listOf("", "离线课表", "更新于 09:22").forEach { hint ->
                assertEquals("当前日期不在本学期教学周内", timetableCalendarStatus(start, week, hint))
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
