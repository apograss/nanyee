package de.nanyee.app

import org.junit.Assert.*
import org.junit.Test

class SlideWindowTest {
    @Test fun preloadsTwoNeighboursInEachDirection() {
        assertEquals(listOf(5, 6, 7, 8, 9), slideWindow(7, 166))
        assertEquals(listOf(0, 1, 2), slideWindow(0, 166))
        assertEquals(listOf(163, 164, 165), slideWindow(165, 166))
        assertEquals(listOf(0), slideWindow(0, 1))
    }
    @Test fun emptyAndInvalidPagesHaveNoWork() {
        assertTrue(slideWindow(0, 0).isEmpty())
        assertTrue(slideWindow(-1, 10).isEmpty())
        assertTrue(slideWindow(10, 10).isEmpty())
    }
}
