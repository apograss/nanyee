package de.nanyee.app

import java.time.LocalDate
import java.time.LocalTime
import kotlinx.serialization.json.*

internal data class TimetableSignal(val course: JsonObject, val current: Boolean, val minutes: Long)

internal fun timetableSignal(courses: List<JsonObject>, week: Int?, date: LocalDate, time: LocalTime): TimetableSignal? {
    if (week == null) return null
    return courses.mapNotNull { course ->
        if (course.number("weekday") != date.dayOfWeek.value || (course["weeks"] as? JsonArray)?.any { (it as? JsonPrimitive)?.intOrNull == week } != true) return@mapNotNull null
        val start = runCatching { LocalTime.parse(course.text("start_time")) }.getOrNull() ?: return@mapNotNull null
        val end = runCatching { LocalTime.parse(course.text("end_time")) }.getOrNull() ?: return@mapNotNull null
        if (end <= start || time >= end) return@mapNotNull null
        Triple(course, start, end)
    }.sortedBy { it.second }.firstOrNull()?.let { (course, start, end) ->
        val current = time >= start
        val seconds = java.time.Duration.between(time, if (current) end else start).seconds
        TimetableSignal(course, current, (seconds + 59) / 60)
    }
}

internal fun timetableNowPosition(starts: List<String>, ends: List<String>, time: LocalTime): Float? {
    starts.forEachIndexed { index, value ->
        val start = runCatching { LocalTime.parse(value) }.getOrNull() ?: return@forEachIndexed
        val end = runCatching { LocalTime.parse(ends.getOrNull(index)) }.getOrNull() ?: return@forEachIndexed
        if (end > start && time >= start && time <= end) return index + (time.toSecondOfDay() - start.toSecondOfDay()).toFloat() / (end.toSecondOfDay() - start.toSecondOfDay())
        val next = runCatching { LocalTime.parse(starts.getOrNull(index + 1)) }.getOrNull()
        if (end > start && next != null && next > end && time > end && time < next) return index + 1f
    }
    return null
}
