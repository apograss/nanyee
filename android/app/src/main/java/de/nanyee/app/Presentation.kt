package de.nanyee.app

import java.math.RoundingMode
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.DayOfWeek
import java.time.temporal.ChronoUnit
import java.time.temporal.TemporalAdjusters
import kotlinx.serialization.json.*

internal fun captchaNeedsRefresh(expires: String, now: Instant): Boolean = runCatching { !now.plusSeconds(15).isBefore(Instant.parse(expires)) }.getOrDefault(false)

internal fun compactRoom(location: String): String = location.trim().replace(Regex("^教学楼\\s*(?=\\S)"), "")

internal fun balancedCjkTitle(title: String, charsPerLine: Int, maxLines: Int): String {
    val points = title.codePoints().toArray()
    if (charsPerLine < 2 || maxLines < 2 || points.size <= charsPerLine || points.any { Character.UnicodeScript.of(it) != Character.UnicodeScript.HAN }) return title
    val lines = (points.size - 1) / charsPerLine + 1
    val length = points.size / lines
    val extra = points.size % lines
    var offset = 0
    return (0 until lines).joinToString("\n") { line ->
        val count = length + if (line < extra) 1 else 0
        String(points, offset, count).also { offset += count }
    }
}

internal fun timetableFontScale(scale: Float): Float = if (scale.isFinite() && scale > 0) scale.coerceAtMost(1.4f) else 1f

internal fun timetablePeriodHeight(scale: Float): Float = 88f * timetableFontScale(scale).coerceAtLeast(1f)

internal fun currentTeachingWeek(semesterStart: String, today: LocalDate, totalWeeks: Int): Int? {
    val start = runCatching { LocalDate.parse(semesterStart).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)) }.getOrNull() ?: return null
    val week = Math.floorDiv(ChronoUnit.DAYS.between(start, today), 7) + 1
    return week.takeIf { it in 1..totalWeeks.toLong() }?.toInt()
}

internal fun weekAfterSwipe(week: Int, totalWeeks: Int, distance: Float, threshold: Float): Int {
    if (totalWeeks < 1 || !distance.isFinite() || !threshold.isFinite() || threshold <= 0) return week
    val delta = when { distance <= -threshold -> 1; distance >= threshold -> -1; else -> 0 }
    return (week + delta).coerceIn(1, totalWeeks)
}

internal fun semesterStartFromMetadata(metadata: JsonObject, today: LocalDate): String? {
    listOf("semester_monday", "semester_start", "start_date", "startDate").forEach { key ->
        runCatching { LocalDate.parse(metadata.text(key)) }.getOrNull()?.let { return it.toString() }
    }
    return metadata.number("current_week").takeIf { it in 1..30 }?.let { week ->
        today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).minusWeeks((week - 1).toLong()).toString()
    }
}

internal fun semesterStartFromExport(content: String): String = content.lineSequence().mapNotNull { line ->
    val metadata = runCatching { Json.parseToJsonElement(line) as? JsonObject }.getOrNull()
    metadata?.text("startDate")?.let { runCatching { LocalDate.parse(it).toString() }.getOrNull() }
}.firstOrNull() ?: throw SchoolError(0, "INVALID_RESPONSE", "暂未取得校历，可手动选择周次。")

internal fun selectedDetail(savedIdentity: String, dataIdentity: String, index: Int, items: List<JsonObject>): JsonObject? =
    if (savedIdentity.isNotEmpty() && savedIdentity == dataIdentity) items.getOrNull(index) else null

internal fun periodStartTimes(courses: List<JsonObject>): List<String> {
    val campusTimes = listOf(
        listOf("08:00", "08:45", "09:50", "10:35", "11:20", "14:30", "15:15", "16:15", "17:00", "19:30", "20:30"),
        listOf("08:30", "09:15", "10:20", "11:05", "11:50", "14:00", "14:45", "15:45", "16:30", "19:30", "20:30")
    )
    val observed = courses.filter { it.number("start_node") in 1..60 }
        .groupBy { it.number("start_node") }.mapValues { (_, items) ->
            items.mapNotNull { runCatching { LocalTime.parse(it.text("start_time")).toString() }.getOrNull() }.distinct()
        }
    val known = observed.mapValues { (_, times) -> times.singleOrNull() }.filterValues { it != null }
    val conflicts = observed.filterValues { it.size > 1 }.keys
    val matching = if (conflicts.isNotEmpty()) emptyList() else campusTimes.filter { times -> known.all { (node, time) -> times.getOrNull(node - 1) == time } }
    val count = maxOf(11, courses.maxOfOrNull { it.number("end_node").coerceIn(1, 60) } ?: 11)
    return (1..count).map { node -> if (node in conflicts) "—" else known[node] ?: matching.mapNotNull { it.getOrNull(node - 1) }.distinct().singleOrNull() ?: "—" }
}

internal fun weekAfterDateChange(week: Int, totalWeeks: Int, previous: LocalDate, current: LocalDate, userPicked: Boolean = false): Int {
    if (userPicked) return week.coerceIn(1, totalWeeks)
    val monday = TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)
    val delta = ChronoUnit.WEEKS.between(previous.with(monday), current.with(monday))
    return (week + delta).coerceIn(1, totalWeeks.toLong()).toInt()
}

internal fun gradeSummary(grades: List<JsonObject>): JsonObject {
    fun value(grade: JsonObject, key: String) = grade.text(key).toDoubleOrNull()?.takeIf { it.isFinite() } ?: 0.0
    val required = grades.filter { it.text("study_type") == "必修" }
    fun weighted(items: List<JsonObject>, key: String): Double {
        val credits = items.sumOf { value(it, "credits") }
        return if (credits <= 0) 0.0 else items.sumOf { value(it, key) * value(it, "credits") } / credits
    }
    return buildJsonObject {
        put("total_credits", grades.sumOf { value(it, "credits") }); put("total_courses", grades.size)
        put("weighted_gpa", weighted(grades, "grade_point")); put("required_gpa", weighted(required, "grade_point"))
        put("average_score", weighted(grades, "numeric_score")); put("required_average_score", weighted(required, "numeric_score"))
        put("failed_count", grades.count { value(it, "grade_point") == 0.0 && value(it, "numeric_score") < 60 })
    }
}

internal fun schoolErrorText(code: String, status: Int, details: JsonObject, login: Boolean): String = when {
    details.text("smu_reason") == "bad_captcha" -> "验证码错误"
    details.text("smu_reason") == "bad_credentials" || code == "INVALID_CREDENTIALS" -> "学号或密码错误"
    status == 410 -> if (login) "验证码已过期，请重新输入" else "学校会话已过期，请重新登录"
    code == "RATE_LIMITED" -> "请求过于频繁，请稍后重试"
    code == "RATE_LIMIT_CHALLENGE_REQUIRED" -> "请稍后重试，或使用网站 nanyee.de 完成人机验证"
    code == "UPSTREAM_REJECTED" && login -> "登录失败，请检查学号、密码和验证码"
    code == "INVALID_REQUEST" -> "输入信息有误，请检查后重试"
    code == "UPSTREAM_UNAVAILABLE" -> "学校系统暂时无法连接，请稍后重试"
    else -> "请求失败，请稍后重试"
}

fun displayNumber(value: String): String = value.toBigDecimalOrNull()?.setScale(2, RoundingMode.HALF_UP)?.stripTrailingZeros()?.toPlainString() ?: value.ifEmpty { "—" }

fun displayWeeks(weeks: List<Int>): String {
    val sorted = weeks.filter { it > 0 }.distinct().sorted()
    if (sorted.isEmpty()) return "未提供"
    val ranges = mutableListOf<String>()
    var start = sorted.first()
    var end = start
    fun addRange() { ranges.add(if (start == end) "$start" else "$start–$end") }
    sorted.drop(1).forEach { week ->
        if (week == end + 1) end = week else { addRange(); start = week; end = week }
    }
    addRange()
    return "第 ${ranges.joinToString("、")} 周"
}
