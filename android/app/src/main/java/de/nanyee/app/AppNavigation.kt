package de.nanyee.app

internal enum class MainTab(val label: String) {
    TIMETABLE("课表"), CLASSROOM("课堂"), EVALUATION("评课"), TOOLS("工具"), MY("我的")
}

internal enum class ClassroomPlatform(val label: String) {
    XUEXITONG("学习通"), RAIN("雨课堂");

    companion object {
        fun restore(value: String?) = entries.firstOrNull { it.name == value } ?: XUEXITONG
    }
}

internal fun restoredMainTab(value: Int?) = value?.takeIf { it in MainTab.entries.indices } ?: 0
internal fun schoolLoginRequired(tab: Int, toolsRoute: String) =
    tab == MainTab.TIMETABLE.ordinal || tab == MainTab.MY.ordinal || (tab == MainTab.TOOLS.ordinal && toolsRoute == "grades")
