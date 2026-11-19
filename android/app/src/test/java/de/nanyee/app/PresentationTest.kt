package de.nanyee.app

import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDate

class PresentationTest {
    @Test fun horizontalSwipesChangeOneWeekAndRespectBounds() {
        assertEquals(4, weekAfterSwipe(3, 20, -100f, 64f))
        assertEquals(2, weekAfterSwipe(3, 20, 100f, 64f))
        assertEquals(3, weekAfterSwipe(3, 20, 20f, 64f))
        assertEquals(1, weekAfterSwipe(1, 20, 100f, 64f))
        assertEquals(20, weekAfterSwipe(20, 20, -100f, 64f))
        assertEquals(1, weekAfterSwipe(1, 1, -100f, 64f))
        assertEquals(1, weekAfterSwipe(1, 0, -100f, 64f))
        assertEquals(3, weekAfterSwipe(3, 20, Float.NaN, 64f))
        assertEquals(3, weekAfterSwipe(3, 20, -100f, 0f))
    }
    @Test fun detailsRestoreOnlyForTheSameLoadedList() {
        val items = listOf(payload("name" to "示例课程"))
        assertEquals(items.single(), selectedDetail("list-a", "list-a", 0, items))
        assertNull(selectedDetail("old-session-list", "new-session-list", 0, items))
        assertNull(selectedDetail("list-a", "refreshed-list", 0, items))
        assertNull(selectedDetail("list-a", "list-a", 0, emptyList()))
        assertNull(selectedDetail("list-a", "list-a", -1, items))
        assertNull(selectedDetail("", "", 0, items))
    }
    @Test fun weekTracksMondayBoundariesAndStaysInsideSemester() {
        val sunday = LocalDate.parse("2026-01-04")
        assertEquals(3, weekAfterDateChange(3, 20, sunday, sunday))
        assertEquals(4, weekAfterDateChange(3, 20, sunday, sunday.plusDays(1)))
        assertEquals(3, weekAfterDateChange(3, 20, sunday, sunday.plusDays(1), userPicked = true))
        assertEquals(3, weekAfterDateChange(3, 20, sunday, sunday.minusWeeks(1), userPicked = true))
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
