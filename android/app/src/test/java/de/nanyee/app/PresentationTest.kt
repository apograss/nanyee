package de.nanyee.app

import org.junit.Assert.*
import org.junit.Test

class PresentationTest {
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
