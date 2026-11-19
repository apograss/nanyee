package de.nanyee.app

import java.time.Instant
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class GradeSummaryTest {
    @Test fun summaryMatchesEachDemoSemesterAndCombinedCourses() {
        val data = demoGrades()
        val grades = data.items("grades")
        assertEquals(gradeSummary(grades), data["summary"])
        (listOf(grades) + grades.groupBy { it.text("semester") }.values).forEach { items ->
            val summary = gradeSummary(items)
            assertEquals(items.size, summary.number("total_courses"))
            assertEquals(items.size * 3.0, summary.text("total_credits").toDouble(), 0.001)
            assertEquals(items.map { it.text("numeric_score").toDouble() }.average(), summary.text("average_score").toDouble(), 0.001)
            val required = items.filter { it.text("study_type") == "必修" }
            assertEquals(required.map { it.text("grade_point").toDouble() }.average(), summary.text("required_gpa").toDouble(), 0.001)
        }
        grades.forEach { grade ->
            val ranking = grade["ranking"]!!.obj()
            val distribution = ranking["distribution"]!!.obj()
            assertEquals(ranking.number("course_total"), distribution.values.sumOf { it.jsonPrimitive.int })
            val score = grade.number("numeric_score")
            val above = if (score < 90) distribution.number("gte90") else 0
            assertTrue(ranking.number("course_rank") > above)
            assertTrue(ranking.number("course_rank") <= if (score < 90) above + distribution.number("s80to90") else distribution.number("gte90"))
        }
    }
    @Test fun emptyAndInvalidSummaryValuesAreSafe() {
        assertEquals("0", gradeSummary(emptyList()).text("total_courses"))
        val summary = gradeSummary(listOf(payload("credits" to "invalid", "grade_point" to "NaN")))
        assertEquals(0.0, summary.text("weighted_gpa").toDouble(), 0.0)
        assertEquals(0.0, summary.text("required_average_score").toDouble(), 0.0)
    }
    @Test fun structuredReasonsOverrideAmbiguousServerErrors() {
        assertEquals("验证码错误", schoolErrorText("UPSTREAM_UNAVAILABLE", 502, payload("smu_reason" to "bad_captcha"), true))
        assertEquals("学号或密码错误", schoolErrorText("UPSTREAM_REJECTED", 401, payload("smu_reason" to "bad_credentials"), true))
        assertEquals("请求失败，请稍后重试", schoolErrorText("UNKNOWN", 500, payload(), false))
        assertEquals("验证码已过期，请重新输入", schoolErrorText("INVALID_REQUEST", 410, payload(), true))
    }
    @Test fun captchaRefreshesBeforeExpiryAndHandlesMissingExpiry() {
        val now = Instant.parse("2026-01-01T00:00:00Z")
        assertTrue(captchaNeedsRefresh("2026-01-01T00:00:14Z", now))
        assertFalse(captchaNeedsRefresh("2026-01-01T00:05:00Z", now))
        assertFalse(captchaNeedsRefresh("invalid", now))
        assertFalse(captchaNeedsRefresh("", now))
    }
}
