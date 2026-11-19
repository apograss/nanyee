package de.nanyee.app

import org.junit.Assert.*
import org.junit.Test

class AppNavigationTest {
    @Test fun bottomBarHasExactlyTheRequestedDestinationsAndDefaultsToTimetable() {
        assertEquals(listOf("课表", "课堂", "评课", "工具", "我的"), MainTab.entries.map { it.label })
        assertEquals(MainTab.TIMETABLE, restoredMainTab(null))
        MainTab.entries.forEach { assertEquals(it, restoredMainTab(it.ordinal)) }
    }

    @Test fun invalidSavedTabsFallBackToTimetable() {
        listOf(-1, 5, Int.MAX_VALUE).forEach { assertEquals(MainTab.TIMETABLE, restoredMainTab(it)) }
    }

    @Test fun classroomPlatformRestoresLastChoiceWithSafeDefault() {
        assertEquals(ClassroomPlatform.XUEXITONG, ClassroomPlatform.restore(null))
        assertEquals(ClassroomPlatform.XUEXITONG, ClassroomPlatform.restore(""))
        assertEquals(ClassroomPlatform.XUEXITONG, ClassroomPlatform.restore("unsupported"))
        ClassroomPlatform.entries.forEach { assertEquals(it, ClassroomPlatform.restore(it.name)) }
    }

    @Test fun independentToolsDoNotRequireSchoolLoginButGradesStillDo() {
        assertTrue(schoolLoginRequired(MainTab.TIMETABLE, ""))
        assertTrue(schoolLoginRequired(MainTab.MY, ""))
        assertTrue(schoolLoginRequired(MainTab.TOOLS, "grades"))
        listOf("", "cabin", "grab").forEach { assertFalse(schoolLoginRequired(MainTab.TOOLS, it)) }
        listOf(MainTab.CLASSROOM, MainTab.EVALUATION).forEach { tab ->
            assertFalse(schoolLoginRequired(tab, ""))
            assertFalse(schoolLoginRequired(tab, "grades"))
        }
    }

    @Test fun schoolLoginReturnsToTheOperationSectionWithCompatibleSavedOrdinals() {
        assertEquals(MainTab.TIMETABLE, SchoolOperation.TIMETABLE.tab)
        assertNotEquals(MainTab.CLASSROOM, SchoolOperation.TIMETABLE.tab)
        assertEquals(MainTab.EVALUATION, SchoolOperation.EVALUATION.tab)
        assertEquals(MainTab.TOOLS, SchoolOperation.COURSE_GRAB.tab)
        assertEquals(MainTab.TOOLS, SchoolOperation.GRADES.tab)
        SchoolOperation.entries.forEach { assertEquals(it.tab, restoredMainTab(it.tab.ordinal)) }
    }
}
