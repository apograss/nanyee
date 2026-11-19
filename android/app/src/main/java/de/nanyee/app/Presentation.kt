package de.nanyee.app

import java.math.RoundingMode
import java.time.Instant
import java.time.LocalDate
import java.time.DayOfWeek
import java.time.temporal.ChronoUnit
import java.time.temporal.TemporalAdjusters
import kotlinx.serialization.json.*

internal fun captchaNeedsRefresh(expires: String, now: Instant): Boolean = runCatching { !now.plusSeconds(15).isBefore(Instant.parse(expires)) }.getOrDefault(false)

internal fun selectedDetail(savedIdentity: String, dataIdentity: String, index: Int, items: List<JsonObject>): JsonObject? =
    if (savedIdentity.isNotEmpty() && savedIdentity == dataIdentity) items.getOrNull(index) else null

internal fun weekAfterDateChange(week: Int, totalWeeks: Int, previous: LocalDate, current: LocalDate): Int {
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
