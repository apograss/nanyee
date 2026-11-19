package de.nanyee.app

import kotlinx.serialization.json.*
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.temporal.ChronoUnit

internal enum class ClassPhase { PAST, CURRENT, UPCOMING, UNKNOWN }

internal data class TodayClass(val course: JsonObject, val start: LocalDateTime?, val end: LocalDateTime?, val phase: ClassPhase)

internal data class TodaySchedule(
    val week: Int?,
    val message: String = "",
    val classes: List<TodayClass> = emptyList(),
    val current: List<TodayClass> = emptyList(),
    val next: TodayClass? = null,
    val nextDay: LocalDate? = null,
    val preview: List<TodayClass> = emptyList()
)

internal fun minutesUntil(now: LocalDateTime, target: LocalDateTime): Long =
    ((ChronoUnit.SECONDS.between(now, target).coerceAtLeast(0) + 59) / 60)

internal fun todaySchedule(courses: List<JsonObject>, semesterStart: String, totalWeeks: Int, now: LocalDateTime): TodaySchedule {
    val date = now.toLocalDate()
    val week = currentTeachingWeek(semesterStart, date, totalWeeks)
    if (week == null) return TodaySchedule(null, if (runCatching { LocalDate.parse(semesterStart) }.isFailure) "暂无学期开始日期，请到课表查看并选择周次。" else "当前日期不在本学期教学周内，请到课表查看课程。")
    val periods = periodStartTimes(courses)
    fun onDay(day: LocalDate): List<TodayClass> {
        val teachingWeek = currentTeachingWeek(semesterStart, day, totalWeeks) ?: return emptyList()
        return courses.filter { course ->
            course.number("weekday") == day.dayOfWeek.value && (course["weeks"] as? JsonArray)?.any { (it as? JsonPrimitive)?.intOrNull == teachingWeek } == true
        }.map { course ->
            val startTime = runCatching { LocalTime.parse(course.text("start_time")) }.getOrNull()
                ?: runCatching { LocalTime.parse(periods.getOrNull(course.number("start_node") - 1)) }.getOrNull()
            val endTime = runCatching { LocalTime.parse(course.text("end_time")) }.getOrNull()
            val start = startTime?.atDate(day)
            val end = endTime?.atDate(day)?.let { if (start != null && it.isBefore(start)) it.plusDays(1) else it }
            val phase = when {
                start == null || end == null || start == end -> ClassPhase.UNKNOWN
                !now.isBefore(end) -> ClassPhase.PAST
                !now.isBefore(start) -> ClassPhase.CURRENT
                else -> ClassPhase.UPCOMING
            }
            TodayClass(course, start, end, phase)
        }.sortedWith(compareBy<TodayClass> { it.start ?: day.atTime(LocalTime.MAX) }.thenBy { it.course.text("name") })
    }
    val overnight = onDay(date.minusDays(1)).filter { it.phase == ClassPhase.CURRENT && it.end?.toLocalDate() == date }
    val classes = (overnight + onDay(date)).sortedBy { it.start ?: date.atTime(LocalTime.MAX) }
    val current = classes.filter { it.phase == ClassPhase.CURRENT }
    val next = classes.firstOrNull { it.phase == ClassPhase.UPCOMING }
    val nextDay = if (classes.isEmpty() || classes.all { it.phase == ClassPhase.PAST }) {
        (1..(totalWeeks * 7)).asSequence().map { date.plusDays(it.toLong()) }.firstOrNull { onDay(it).isNotEmpty() }
    } else null
    return TodaySchedule(week, classes = classes, current = current, next = next, nextDay = nextDay, preview = nextDay?.let(::onDay).orEmpty())
}
