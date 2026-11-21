package de.nanyee.app

import androidx.compose.runtime.saveable.listSaver

internal data class ClassroomDemoSelection(val schoolDemo: Boolean, private val choices: Map<ClassroomPlatform, Boolean> = emptyMap()) {
    fun demo(platform: ClassroomPlatform) = choices[platform] ?: schoolDemo
    fun toggle(platform: ClassroomPlatform) = copy(choices = choices + (platform to !demo(platform)))
    fun forSchoolMode(value: Boolean) = if (schoolDemo == value) this else ClassroomDemoSelection(value)
}

internal val classroomDemoSaver = listSaver<ClassroomDemoSelection, Boolean>(
    save = { listOf(it.schoolDemo, it.demo(ClassroomPlatform.XUEXITONG), it.demo(ClassroomPlatform.RAIN)) },
    restore = { ClassroomDemoSelection(it[0], mapOf(ClassroomPlatform.XUEXITONG to it[1], ClassroomPlatform.RAIN to it[2])) }
)
