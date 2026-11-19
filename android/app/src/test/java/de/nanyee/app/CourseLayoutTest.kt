package de.nanyee.app

import org.junit.Assert.*
import org.junit.Test

class CourseLayoutTest {
    private fun course(start: Int, end: Int) = payload("start_node" to "$start", "end_node" to "$end")

    @Test fun emptyAndInvalidRangesHaveNoBlocks() {
        assertTrue(layoutCourses(emptyList()).isEmpty())
        assertTrue(layoutCourses(listOf(course(0, 2), course(3, 2))).isEmpty())
    }

    @Test fun separateCoursesUseFullWidth() {
        val result = layoutCourses(listOf(course(3, 4), course(1, 2)))
        assertEquals(listOf(1, 1), result.map { it.laneCount })
        assertEquals(listOf(0, 0), result.map { it.lane })
    }

    @Test fun conflictPickerGroupsOnlyConnectedOverlaps() {
        assertTrue(courseGroups(emptyList()).isEmpty())
        assertTrue(courseGroups(listOf(course(3, 1))).isEmpty())
        val groups = courseGroups(listOf(course(1, 2), course(2, 4), course(4, 5), course(6, 7)))
        assertEquals(listOf(3, 1), groups.map { it.size })
    }

    @Test fun nestedAndChainedOverlapsUseDistinctLanes() {
        val result = layoutCourses(listOf(course(1, 4), course(2, 2), course(3, 5), course(5, 6)))
        assertEquals(listOf(2, 2, 2, 2), result.map { it.laneCount })
        result.forEachIndexed { index, left -> result.drop(index + 1).forEach { right ->
            if (left.course.number("start_node") <= right.course.number("end_node") && right.course.number("start_node") <= left.course.number("end_node")) assertNotEquals(left.lane, right.lane)
        } }
    }
}
