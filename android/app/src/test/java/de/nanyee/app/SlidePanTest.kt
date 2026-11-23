package de.nanyee.app

import org.junit.Assert.*
import org.junit.Test

class SlidePanTest {
    @Test fun reachesBothEdgesAtFourTimesZoomForEachActualDimension() {
        assertEquals(2160f, clampSlidePan(9999f, 4f, 1440), 0f)
        assertEquals(-2160f, clampSlidePan(-9999f, 4f, 1440), 0f)
        assertEquals(3840f, clampSlidePan(9999f, 4f, 2560), 0f)
        assertEquals(420f, clampSlidePan(420f, 4f, 1440), 0f)
    }
    @Test fun zoomingOutAndResizingClampToTheNewBounds() {
        assertEquals(720f, clampSlidePan(2160f, 2f, 1440), 0f)
        assertEquals(-360f, clampSlidePan(-2160f, 2f, 720), 0f)
        assertEquals(0f, clampSlidePan(500f, 1f, 1440), 0f)
    }
    @Test fun emptyOrInvalidBoundsDoNotAllowPanning() {
        assertEquals(0f, clampSlidePan(500f, 4f, 0), 0f)
        assertEquals(0f, clampSlidePan(-500f, 4f, -1), 0f)
        assertEquals(0f, clampSlidePan(500f, 0.5f, 1440), 0f)
    }
}
