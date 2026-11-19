package de.nanyee.app

import kotlinx.serialization.json.JsonObject

data class CoursePlacement(val course: JsonObject, val lane: Int, val laneCount: Int)

fun courseGroups(courses: List<JsonObject>): List<List<JsonObject>> {
    val groups = mutableListOf<MutableList<JsonObject>>()
    var end = 0
    courses.filter { it.number("start_node") > 0 && it.number("end_node") >= it.number("start_node") }.sortedBy { it.number("start_node") }.forEach { course ->
        if (groups.isEmpty() || course.number("start_node") > end) { groups.add(mutableListOf()); end = 0 }
        groups.last().add(course)
        end = maxOf(end, course.number("end_node"))
    }
    return groups
}

fun layoutCourses(courses: List<JsonObject>): List<CoursePlacement> {
    val result = mutableListOf<CoursePlacement>()
    val group = mutableListOf<Pair<JsonObject, Int>>()
    val laneEnds = mutableListOf<Int>()
    fun flush() {
        group.forEach { (course, lane) -> result.add(CoursePlacement(course, lane, laneEnds.size)) }
        group.clear(); laneEnds.clear()
    }
    courses.filter { it.number("start_node") >= 1 && it.number("end_node") >= it.number("start_node") }
        .sortedBy { it.number("start_node") }.forEach { course ->
            val start = course.number("start_node")
            if (laneEnds.isNotEmpty() && laneEnds.all { it < start }) flush()
            val available = laneEnds.indexOfFirst { it < start }
            val lane = if (available == -1) laneEnds.size else available
            if (lane == laneEnds.size) laneEnds.add(course.number("end_node")) else laneEnds[lane] = course.number("end_node")
            group.add(course to lane)
        }
    flush()
    return result
}
