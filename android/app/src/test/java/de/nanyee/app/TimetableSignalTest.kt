package de.nanyee.app

import java.time.LocalDate
import java.time.LocalTime
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class TimetableSignalTest {
    private val monday = LocalDate.of(2026, 11, 16)
    private val course = Json.parseToJsonElement("""{"name":"人体解剖学","location":"教学楼 201","weekday":1,"weeks":[1,3],"start_time":"08:00","end_time":"09:25"}""").jsonObject
    private fun signal(time: String, courses: List<JsonObject> = listOf(course), week: Int? = 1) = timetableSignal(courses, week, monday, LocalTime.parse(time))

    @Test fun nextAndNowKeepTheCourseAndRoundUpTheCountdown() {
        assertEquals(TimetableSignal(course, false, 5), signal("07:55:01"))
        assertEquals(TimetableSignal(course, true, 85), signal("08:00"))
        assertEquals(TimetableSignal(course, true, 45), signal("08:40"))
        assertEquals(TimetableSignal(course, true, 1), signal("09:24:59"))
        assertNull(signal("09:25"))
        assertNull(signal("20:00"))
    }

    @Test fun schedulesAreSortedAndAnOngoingCourseComesBeforeTheNextOne() {
        val later = JsonObject(course + mapOf("name" to JsonPrimitive("英语"), "start_time" to JsonPrimitive("10:00"), "end_time" to JsonPrimitive("11:00")))
        assertEquals(course, signal("08:40", listOf(later, course))?.course)
        assertEquals(TimetableSignal(later, false, 30), signal("09:30", listOf(later, course)))
    }

    @Test fun emptyOtherWeekAndInvalidMetadataNeverInventAClass() {
        assertNull(signal("08:40", emptyList()))
        assertNull(signal("08:40", week = 2))
        assertNull(signal("08:40", week = null))
        assertNull(timetableSignal(listOf(course), 1, monday.plusDays(1), LocalTime.of(8, 40)))
        listOf("start_time" to "invalid", "end_time" to "07:00", "end_time" to "", "weeks" to "invalid").forEach { (key, value) ->
            assertNull(signal("08:40", listOf(JsonObject(course + (key to JsonPrimitive(value))))))
        }
        assertNull(signal("08:40", listOf(buildJsonObject {})))
    }

    @Test fun nowLineFollowsPeriodsAndRestsOnTheBoundaryDuringBreaks() {
        val starts = listOf("08:00", "08:45")
        val ends = listOf("08:40", "09:25")
        assertEquals(0f, timetableNowPosition(starts, ends, LocalTime.of(8, 0))!!, 0.001f)
        assertEquals(0.5f, timetableNowPosition(starts, ends, LocalTime.of(8, 20))!!, 0.001f)
        assertEquals(1f, timetableNowPosition(starts, ends, LocalTime.of(8, 42))!!, 0.001f)
        assertEquals(1.5f, timetableNowPosition(starts, ends, LocalTime.of(9, 5))!!, 0.001f)
        assertNull(timetableNowPosition(starts, ends, LocalTime.of(7, 0)))
        assertNull(timetableNowPosition(starts, ends, LocalTime.of(10, 0)))
        assertNull(timetableNowPosition(emptyList(), emptyList(), LocalTime.NOON))
        assertNull(timetableNowPosition(listOf("invalid"), listOf("13:00"), LocalTime.NOON))
        assertNull(timetableNowPosition(listOf("11:00"), emptyList(), LocalTime.NOON))
        assertNull(timetableNowPosition(listOf("13:00"), listOf("11:00"), LocalTime.NOON))
    }
}
