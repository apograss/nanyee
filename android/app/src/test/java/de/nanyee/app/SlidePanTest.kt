package de.nanyee.app

import org.junit.Assert.*
import org.junit.Test

class SlidePanTest {
    @Test fun wideSlideInPortraitCannotBePannedIntoLetterboxing() {
        val (width, height) = fittedSlideSize(1080, 2200, 1920, 1080)
        assertEquals(1080f, width, 0f)
        assertEquals(607.5f, height, 0f)
        assertEquals(0f, clampSlidePan(9999f, 2f, 2200, height), 0f)
        assertEquals(115f, clampSlidePan(9999f, 4f, 2200, height), 0f)
        assertEquals(-115f, clampSlidePan(-9999f, 4f, 2200, height), 0f)
        assertEquals(1620f, clampSlidePan(9999f, 4f, 1080, width), 0f)
    }
    @Test fun tallSlideAndMissingBitmapHaveSafeFittedBounds() {
        val (width, height) = fittedSlideSize(1920, 1080, 1080, 1920)
        assertEquals(607.5f, width, 0f)
        assertEquals(1080f, height, 0f)
        assertEquals(0f, clampSlidePan(9999f, 2f, 1920, width), 0f)
        assertEquals(0f to 0f, fittedSlideSize(1920, 1080, 0, 0))
        assertEquals(0f to 0f, fittedSlideSize(0, 0, 1920, 1080))
    }
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
