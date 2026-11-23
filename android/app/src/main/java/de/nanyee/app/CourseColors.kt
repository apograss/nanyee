package de.nanyee.app

import kotlinx.serialization.json.JsonObject

internal val coursePalette = listOf(0xFF466EAD, 0xFFA94D68, 0xFF377E78, 0xFF805AA7, 0xFF9B613C, 0xFF47763E, 0xFFAE4D48, 0xFF5263A3, 0xFF8B577C, 0xFF327C92, 0xFF82702E, 0xFF625DA0, 0xFF9B5360, 0xFF3F7960)

internal fun courseColorKey(course: JsonObject) = course.text("name").trim().ifBlank { course.text("kcbh").trim() }

internal fun courseColors(courses: List<JsonObject>): Map<String, Int> {
    val assigned = mutableMapOf<String, Int>()
    val used = mutableSetOf<Int>()
    courses.map(::courseColorKey).distinct().sorted().forEach { key ->
        val start = Math.floorMod(key.hashCode(), coursePalette.size)
        val index = (coursePalette.indices).map { (start + it) % coursePalette.size }.firstOrNull { it !in used } ?: start
        assigned[key] = index
        used += index
    }
    return assigned
}
