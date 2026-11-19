package de.nanyee.app

import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDate

class PresentationTest {
    @Test fun weekTracksMondayBoundariesAndStaysInsideSemester() {
        val sunday = LocalDate.parse("2026-01-04")
        assertEquals(3, weekAfterDateChange(3, 20, sunday, sunday))
        assertEquals(4, weekAfterDateChange(3, 20, sunday, sunday.plusDays(1)))
        assertEquals(20, weekAfterDateChange(20, 20, sunday, sunday.plusWeeks(1)))
        assertEquals(1, weekAfterDateChange(1, 20, sunday, sunday.minusWeeks(1)))
    }
    @Test fun numbersAreRoundedWithoutTrailingZeroes() {
        assertEquals("3.8", displayNumber("3.8000000000000003"))
        assertEquals("88.13", displayNumber("88.125"))
        assertEquals("90", displayNumber("90.00"))
        assertEquals("—", displayNumber(""))
        assertEquals("优秀", displayNumber("优秀"))
    }
    @Test fun weeksAreSortedDeduplicatedAndCompressed() {
        assertEquals("未提供", displayWeeks(emptyList()))
        assertEquals("未提供", displayWeeks(listOf(-1, 0)))
        assertEquals("第 1–8、10–16 周", displayWeeks((1..8).toList() + (10..16).toList()))
        assertEquals("第 1、3–4 周", displayWeeks(listOf(4, 1, 3, 3)))
    }
}
