package de.nanyee.app

import java.time.LocalDate
import org.junit.Assert.*
import org.junit.Test

class TeachingWeekTest {
    @Test fun computesMondayBoundariesAndSemesterLimits() {
        val start = LocalDate.parse("2026-02-23")
        assertEquals(1, currentTeachingWeek(start.toString(), start, 20))
        assertEquals(1, currentTeachingWeek(start.toString(), start.plusDays(6), 20))
        assertEquals(2, currentTeachingWeek(start.toString(), start.plusWeeks(1), 20))
        assertEquals(20, currentTeachingWeek(start.toString(), start.plusWeeks(19).plusDays(6), 20))
        assertNull(currentTeachingWeek(start.toString(), start.minusDays(1), 20))
        assertNull(currentTeachingWeek(start.toString(), start.plusWeeks(20), 20))
        assertNull(currentTeachingWeek("", start, 20))
        assertNull(currentTeachingWeek("not-a-date", start, 20))
        assertNull(currentTeachingWeek(start.toString(), start, 0))
    }

    @Test fun handlesYearRolloverAndLeapDay() {
        assertEquals(2, currentTeachingWeek("2025-12-29", LocalDate.parse("2026-01-05"), 20))
        assertEquals(1, currentTeachingWeek("2024-02-26", LocalDate.parse("2024-02-29"), 20))
        assertEquals(2, currentTeachingWeek("2024-02-26", LocalDate.parse("2024-03-04"), 20))
    }

    @Test fun prefersSemesterStartOverServerWeekAndRejectsMissingMetadata() {
        val today = LocalDate.parse("2026-03-04")
        assertEquals("2026-02-23", semesterStartFromMetadata(payload("semester_start" to "2026-02-23", "current_week" to "8"), today))
        assertEquals("2026-02-23", semesterStartFromMetadata(payload("current_week" to "2"), today))
        assertNull(semesterStartFromMetadata(payload("current_week" to "0", "start_date" to "invalid"), today))
        assertNull(semesterStartFromMetadata(payload(), today))
    }

    @Test fun readsOnlyCalendarDateFromServerExport() {
        assertEquals("2026-02-23", semesterStartFromExport("version\n[]\n{\"startDate\":\"2026-02-23\",\"tableName\":\"sample\"}\n[]"))
        listOf("", "[]", "{\"startDate\":\"bad\"}").forEach { assertTrue(runCatching { semesterStartFromExport(it) }.isFailure) }
    }
}
