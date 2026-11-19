package de.nanyee.app

internal enum class MainTab(val label: String) {
    TIMETABLE("课表"), CLASSROOM("课堂"), EVALUATION("评课"), TOOLS("工具"), MY("我的")
}

internal enum class SchoolOperation(val tab: MainTab) {
    TIMETABLE(MainTab.TIMETABLE), GRADES(MainTab.TOOLS), COURSE_GRAB(MainTab.TOOLS), EVALUATION(MainTab.EVALUATION)
}

internal enum class ClassroomPlatform(val label: String) {
    XUEXITONG("学习通"), RAIN("雨课堂");

    companion object {
        fun restore(value: String?) = entries.firstOrNull { it.name == value } ?: XUEXITONG
    }
}

internal fun restoredMainTab(value: Int?) = MainTab.entries.getOrNull(value ?: -1) ?: MainTab.TIMETABLE
internal fun schoolLoginRequired(tab: MainTab, toolsRoute: String) =
    tab == MainTab.TIMETABLE || tab == MainTab.MY || (tab == MainTab.TOOLS && toolsRoute == "grades")
