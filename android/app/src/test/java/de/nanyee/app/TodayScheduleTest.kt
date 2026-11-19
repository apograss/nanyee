package de.nanyee.app

import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDateTime

class TodayScheduleTest {
    private val start = "2026-11-16"
    private fun now(time: String) = LocalDateTime.parse("2026-11-19T$time")
    private fun course(name: String, from: String, to: String, day: Int = 4, weeks: List<Int> = listOf(1, 2)) = buildJsonObject {
        put("name", name); put("weekday", day); put("start_time", from); put("end_time", to); put("start_node", 1); put("end_node", 2)
        put("weeks", JsonArray(weeks.map(::JsonPrimitive)))
    }
    private val classes = listOf(course("早课", "08:00", "09:25"), course("午课", "14:30", "15:55"))

    @Test fun beforeFirstDuringBetweenAndAfterLast() {
        val before = todaySchedule(classes, start, 20, now("07:35"))
        assertEquals("早课", before.next!!.course.text("name")); assertEquals(25, minutesUntil(now("07:35"), before.next.start!!).toInt())
        assertTrue(before.current.isEmpty())
        val during = todaySchedule(classes, start, 20, now("08:30"))
        assertEquals("早课", during.current.single().course.text("name")); assertEquals(55, minutesUntil(now("08:30"), during.current.single().end!!).toInt())
        val between = todaySchedule(classes, start, 20, now("09:25"))
        assertTrue(between.current.isEmpty()); assertEquals("午课", between.next!!.course.text("name")); assertEquals(ClassPhase.PAST, between.classes[0].phase)
        val after = todaySchedule(classes, start, 20, now("16:00"))
        assertNull(after.next); assertTrue(after.current.isEmpty()); assertTrue(after.classes.all { it.phase == ClassPhase.PAST })
        assertEquals("2026-11-26", after.nextDay.toString())
    }

    @Test fun emptyDayPreviewsNextTeachingDayAndRespectsWeeks() {
        val friday = listOf(course("周五课", "08:00", "09:25", 5, listOf(2)))
        val result = todaySchedule(friday, start, 2, now("10:00"))
        assertTrue(result.classes.isEmpty()); assertEquals("2026-11-27", result.nextDay.toString())
        assertEquals("周五课", result.preview.single().course.text("name"))
        assertTrue(todaySchedule(emptyList(), start, 2, now("10:00")).preview.isEmpty())
    }

    @Test fun midnightAndOvernightCoursesRecomputeTheirDateAndWeek() {
        val events = listOf(course("夜课", "23:30", "00:30", 7), course("周一课", "08:00", "09:25", 1))
        val sunday = todaySchedule(events, start, 20, LocalDateTime.parse("2026-11-22T23:45"))
        assertEquals(1, sunday.week); assertEquals("夜课", sunday.current.single().course.text("name"))
        val monday = todaySchedule(events, start, 20, LocalDateTime.parse("2026-11-23T00:15"))
        assertEquals(2, monday.week); assertEquals("夜课", monday.current.single().course.text("name")); assertEquals("周一课", monday.next!!.course.text("name"))
        assertEquals(15, minutesUntil(LocalDateTime.parse("2026-11-23T00:15"), monday.current.single().end!!).toInt())
    }

    @Test fun overlappingClassesRemainVisibleAndSorted() {
        val result = todaySchedule(listOf(course("B", "08:30", "10:00"), course("A", "08:00", "09:25")), start, 20, now("09:00"))
        assertEquals(listOf("A", "B"), result.current.map { it.course.text("name") })
        assertEquals(listOf("A", "B"), result.classes.map { it.course.text("name") })
    }

    @Test fun missingDatesOutsideTermAndUnknownTimesAreExplicit() {
        assertTrue(todaySchedule(classes, "", 20, now("08:00")).message.contains("开始日期"))
        assertTrue(todaySchedule(classes, "2027-01-01", 20, now("08:00")).message.contains("不在"))
        assertTrue(todaySchedule(classes, "2025-01-01", 20, now("08:00")).message.contains("不在"))
        val result = todaySchedule(listOf(course("未知时间", "", "")), start, 20, now("08:00"))
        assertEquals(ClassPhase.UNKNOWN, result.classes.single().phase); assertNull(result.next); assertTrue(result.current.isEmpty())
        assertEquals(1L, minutesUntil(now("07:59:30"), now("08:00")))
    }
}
