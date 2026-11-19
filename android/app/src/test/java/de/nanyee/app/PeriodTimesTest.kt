package de.nanyee.app

import org.junit.Assert.*
import org.junit.Test

class PeriodTimesTest {
    private fun course(node: Int, time: String) = payload("start_node" to "$node", "end_node" to "${node + 1}", "start_time" to time)

    @Test fun conflictingCampusTimesStayAmbiguousDespiteOtherCampusEvidence() {
        val courses = listOf(course(5, "11:20"), course(5, "11:50"), course(6, "14:00"))
        val times = periodStartTimes(courses)
        assertEquals("—", times[4])
        assertEquals("14:00", times[5])
        assertEquals("—", times[0])
        assertEquals(listOf("11:20", "11:50", "14:00"), courses.map { it.text("start_time") })
        assertEquals("—", periodStartTimes(listOf(course(1, "08:00"), course(1, "08:30")))[0])
    }

    @Test fun liveShundeTimesNeverMixWithTheOldNinePeriodTable() {
        val times = periodStartTimes(listOf(course(1, "08:30"), course(6, "14:00"), course(8, "15:45")))
        assertEquals("11:50", times[4])
        assertEquals("14:00", times[5])
        assertEquals("14:45", times[6])
        assertEquals("15:45", times[7])
        assertEquals(times.sorted(), times)
    }

    @Test fun mainCampusUsesItsOwnElevenPeriods() {
        val times = periodStartTimes(listOf(course(1, "08:00")))
        assertEquals(11, times.size)
        assertEquals("11:20", times[4])
        assertEquals("14:30", times[5])
        assertEquals(times.sorted(), times)
    }

    @Test fun unknownAndMalformedTimesAreNotInvented() {
        val times = periodStartTimes(listOf(course(5, "12:10"), course(8, "17:10")))
        assertEquals("12:10", times[4])
        assertEquals("17:10", times[7])
        assertEquals("—", times[5])
        assertEquals("—", periodStartTimes(emptyList())[0])
        assertEquals("—", periodStartTimes(listOf(course(5, "invalid"), course(0, "08:00")))[0])
    }
}
