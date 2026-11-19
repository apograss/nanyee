package de.nanyee.app

import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDate

class PresentationTest {
    @Test fun fiveCharacterTitleShrinksFromTwoCharacterCapacityToBalancedLines() {
        val result = fitCjkTitle("人体解剖学", 14f, 11.5f, 3) { size -> (35f / size).toInt() }
        assertEquals("人体解\n剖学", result.text)
        assertEquals(11.5f, result.fontSize, 0.001f)
    }

    @Test fun titleFittingRespectsFloorAndLeavesOtherTitlesUnchanged() {
        val floorReached = fitCjkTitle("人体解剖学", 14f, 12f, 3) { size -> (28f / size).toInt() }
        assertEquals("人体\n解剖\n学", floorReached.text)
        assertEquals(12f, floorReached.fontSize, 0.001f)
        assertEquals(FittedCourseTitle("基础\n化学", 14f), fitCjkTitle("基础化学", 14f, 12f, 3) { 2 })
        listOf("", "Medical English", "医学Ⅱ").forEach { title ->
            assertEquals(FittedCourseTitle(title, 14f), fitCjkTitle(title, 14f, 12f, 3) { error("must not measure") })
        }
        assertEquals(FittedCourseTitle("人体解剖学", 14f), fitCjkTitle("人体解剖学", 14f, 12f, 1) { error("must not measure") })
        assertEquals(10f, fitCjkTitle("人体解剖学", 10f, 12f, 3) { 2 }.fontSize, 0.001f)
        assertTrue(runCatching { fitCjkTitle("人体解剖学", Float.NaN, 12f, 3) { 2 } }.isFailure)
        assertTrue(runCatching { fitCjkTitle("人体解剖学", 14f, 0f, 3) { 2 } }.isFailure)
    }
    @Test fun cjkTitlesBalanceWithoutSingleCharacterOrphansWhenTwoLinesFit() {
        assertEquals("人体解\n剖学", balancedCjkTitle("人体解剖学", 4, 3))
        assertEquals("人体解\n剖学", balancedCjkTitle("人体解剖学", 3, 3))
        assertEquals("基础\n化学", balancedCjkTitle("基础化学", 3, 3))
        assertEquals("基础\n化学", balancedCjkTitle("基础化学", 2, 3))
        assertEquals("医学\n生物\n化学", balancedCjkTitle("医学生物化学", 2, 3))
        assertEquals("人体解剖学", balancedCjkTitle("人体解剖学", 5, 3))
        assertEquals("基础化学", balancedCjkTitle("基础化学", 3, 1))
        assertEquals("基础化学", balancedCjkTitle("基础化学", 0, 3))
        assertEquals("", balancedCjkTitle("", 3, 3))
        assertEquals("Medical English", balancedCjkTitle("Medical English", 3, 3))
        assertEquals("医学Ⅱ", balancedCjkTitle("医学Ⅱ", 2, 3))
    }
    @Test fun timetableScalesTextAndRowsWithinAccessibleBounds() {
        assertEquals(1f, timetableFontScale(1f), 0.001f)
        assertEquals(1.3f, timetableFontScale(1.3f), 0.001f)
        assertEquals(1.4f, timetableFontScale(2f), 0.001f)
        assertEquals(1f, timetableFontScale(Float.NaN), 0.001f)
        assertEquals(1f, timetableFontScale(0f), 0.001f)
        assertEquals(88f, timetablePeriodHeight(1f), 0.001f)
        assertEquals(123.2f, timetablePeriodHeight(2f), 0.001f)
        assertTrue(timetablePeriodHeight(1.3f) > timetablePeriodHeight(1f))
    }
    @Test fun roomsDropOnlyTheGenericTeachingBuildingPrefix() {
        assertEquals("201", compactRoom("教学楼 201"))
        assertEquals("A-201", compactRoom("教学楼A-201"))
        assertEquals("一号楼 201", compactRoom(" 一号楼 201 "))
        assertEquals("第一教学楼201", compactRoom("第一教学楼201"))
        assertEquals("教学楼", compactRoom("教学楼"))
        assertEquals("", compactRoom("  "))
    }
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
