package de.nanyee.app

import org.junit.Assert.*
import org.junit.Test

class DemoDataTest {
    @Test fun semestersHaveDistinctTimetablesAndGrades() {
        val current = demoCourses("202501")
        val previous = demoCourses("202402")
        assertTrue(current.isNotEmpty())
        assertTrue(previous.isNotEmpty())
        assertNotEquals(current, previous)
        assertTrue(current.none { course -> previous.any { it.text("name") == course.text("name") } })
        val grades = demoGrades().items("grades")
        assertEquals(setOf("2025-2026-1", "2024-2025-2"), grades.map { it.text("semester") }.toSet())
        assertEquals(current.size + previous.size, grades.size)
    }
}
