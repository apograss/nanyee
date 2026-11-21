package de.nanyee.app

import org.junit.Assert.*
import org.junit.Test

class ClassroomDemoTest {
    @Test fun schoolDemoAutomaticallyChoosesBothOfflinePlatforms() {
        for (platform in ClassroomPlatform.entries) {
            assertTrue(ClassroomDemoSelection(true).demo(platform))
            assertFalse(ClassroomDemoSelection(false).demo(platform))
        }
    }

    @Test fun realLoginOverrideOnlyChangesTheSelectedPlatform() {
        val selection = ClassroomDemoSelection(true).toggle(ClassroomPlatform.XUEXITONG)
        assertFalse(selection.demo(ClassroomPlatform.XUEXITONG))
        assertTrue(selection.demo(ClassroomPlatform.RAIN))
        assertTrue(selection.toggle(ClassroomPlatform.XUEXITONG).demo(ClassroomPlatform.XUEXITONG))
        assertEquals(selection, selection.forSchoolMode(true))
    }

    @Test fun leavingSchoolDemoClearsAutomaticFixturesAndOverrides() {
        val normal = ClassroomDemoSelection(true).toggle(ClassroomPlatform.RAIN).forSchoolMode(false)
        ClassroomPlatform.entries.forEach { assertFalse(normal.demo(it)) }
        val nextDemo = normal.toggle(ClassroomPlatform.XUEXITONG).forSchoolMode(true)
        ClassroomPlatform.entries.forEach { assertTrue(nextDemo.demo(it)) }
    }
}
