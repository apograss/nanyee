package de.nanyee.app

import org.junit.Assert.*
import org.junit.Test

class AppNavigationTest {
    @Test fun bottomBarHasExactlyTheRequestedDestinationsAndDefaultsToTimetable() {
        assertEquals(listOf("课表", "课堂", "评课", "工具", "我的"), MainTab.entries.map { it.label })
        assertEquals(MainTab.TIMETABLE.ordinal, restoredMainTab(null))
        MainTab.entries.forEach { assertEquals(it.ordinal, restoredMainTab(it.ordinal)) }
    }

    @Test fun invalidSavedTabsFallBackToTimetable() {
        listOf(-1, 5, Int.MAX_VALUE).forEach { assertEquals(0, restoredMainTab(it)) }
    }

    @Test fun classroomPlatformRestoresLastChoiceWithSafeDefault() {
        assertEquals(ClassroomPlatform.XUEXITONG, ClassroomPlatform.restore(null))
        assertEquals(ClassroomPlatform.XUEXITONG, ClassroomPlatform.restore(""))
        assertEquals(ClassroomPlatform.XUEXITONG, ClassroomPlatform.restore("unsupported"))
        ClassroomPlatform.entries.forEach { assertEquals(it, ClassroomPlatform.restore(it.name)) }
    }

    @Test fun independentToolsDoNotRequireSchoolLoginButGradesStillDo() {
        assertTrue(schoolLoginRequired(MainTab.TIMETABLE.ordinal, ""))
        assertTrue(schoolLoginRequired(MainTab.MY.ordinal, ""))
        assertTrue(schoolLoginRequired(MainTab.TOOLS.ordinal, "grades"))
        listOf("", "cabin", "grab").forEach { assertFalse(schoolLoginRequired(MainTab.TOOLS.ordinal, it)) }
        listOf(MainTab.CLASSROOM, MainTab.EVALUATION).forEach { tab ->
            assertFalse(schoolLoginRequired(tab.ordinal, ""))
            assertFalse(schoolLoginRequired(tab.ordinal, "grades"))
        }
    }
}
