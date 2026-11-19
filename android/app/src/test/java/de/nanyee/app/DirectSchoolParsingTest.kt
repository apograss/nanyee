package de.nanyee.app

import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class DirectSchoolParsingTest {
    @Test fun loginContractMatchesTheDocumentedSchoolFormAndErrors() {
        val form = schoolLoginForm("not-a-student", "test", "0123")
        assertEquals(mapOf("loginName" to "not-a-student", "password" to "098f6bcd4621d373cade4e832627b4f6", "randcodekey" to "0123", "locationBrowser" to "谷歌浏览器[Chrome]", "appid" to "3550176", "redirect" to "https://zhjw.smu.edu.cn/new/ssoLogin", "strength" to "3"), form)
        assertEquals("example-ticket", schoolLoginTicket(payload("ticket" to "example-ticket")))
        fun reason(response: JsonObject) = (runCatching { schoolLoginTicket(response) }.exceptionOrNull() as SchoolError).reason
        assertEquals("bad_captcha", reason(payload("msg" to "badRandcodekey")))
        assertEquals("bad_captcha", reason(payload("message" to "验证码错误")))
        assertEquals("bad_credentials", reason(payload("message" to "用户名或密码不匹配")))
        assertEquals("", reason(payload("message" to "未知错误")))
        assertEquals("", reason(buildJsonObject { put("ticket", 123) }))
    }

    @Test fun semesterOptionsAndCalendarUseTheSchoolFields() {
        val html = """<select id="xnxqdm"><option value="202601">2026-2027-1</option><option value="202502"> 2025-2026-2 </option><option value="202601">duplicate</option><option value="bad">bad</option></select>"""
        assertEquals(listOf("202601", "202502"), schoolSemesters(html).map { it.text("code") })
        assertEquals("2025-2026-2", schoolSemesters(html)[1].text("label"))
        assertTrue(schoolSemesters("<p>empty</p>").isEmpty())
        assertEquals("2026-11-16", schoolSemesterStart(Json.parseToJsonElement("""[{"xqmc":2,"rq":"2026-11-17"},{"xqmc":1,"rq":"2026-11-16"}]""")))
        assertTrue(runCatching { schoolSemesterStart(JsonArray(emptyList())) }.isFailure)
        assertTrue(runCatching { schoolSemesterStart(Json.parseToJsonElement("""[{"xqmc":1,"rq":"2026-11-17"}]""")) }.isFailure)
    }

    private fun event(week: Int, room: String = "教学楼 201") = buildJsonObject {
        put("kcmc", " 人体解剖学 "); put("jxcdmc", room); put("jxhjmc", "理论"); put("teaxms", "示例教师"); put("xs", 2)
        put("xq", 1); put("qssj", "08:00:00"); put("jssj", "09:25:00"); put("ps", 1); put("pe", 2); put("zc", week)
    }

    @Test fun weeklyEventsAggregateWithoutMixingRoomsOrDroppingWeeks() {
        val courses = schoolTimetable(listOf(event(2), event(1), event(1), event(1, "另一教室")))
        assertEquals(2, courses.size)
        assertEquals("人体解剖学", courses[0].text("name"))
        assertEquals("08:00", courses[0].text("start_time"))
        assertEquals("2", courses[0].text("credit_hours"))
        assertEquals(JsonArray(listOf(JsonPrimitive(1), JsonPrimitive(2))), courses[0]["weeks"])
        assertEquals(courses[0]["course_id"], courses[1]["course_id"])
        assertTrue(schoolTimetable(emptyList()).isEmpty())
        assertTrue(runCatching { schoolTimetable(listOf(payload("kcmc" to "incomplete"))) }.isFailure)
        assertTrue(schoolWeeklyRows(payload()).isEmpty())
        assertEquals(listOf(event(1)), schoolWeeklyRows(buildJsonObject { put("data", JsonArray(listOf(JsonNull, event(1)))) }))
        assertTrue(runCatching { schoolWeeklyRows(payload("data" to "invalid")) }.isFailure)
    }

    @Test fun gradesAndRankingMatchClientPyFixtures() {
        val grades = schoolGrades(Json.parseToJsonElement("""{"rows":[{"kcmc":"基础化学","zcj":"88","zcjfs":"88","cjjd":"3.8","xf":"3","xdfsmc":"必修","kcflmc":"学科基础","xnxqmc":"2026-2027-1","cjdm":"fixture-grade","zxs":48}]}""").jsonObject)
        assertEquals("基础化学", grades.single().text("name")); assertEquals("学科基础", grades.single().text("course_category"))
        assertEquals(3.8, grades.single().text("grade_point").toDouble(), 0.001)
        assertEquals("fixture-grade", grades.single().text("grade_id"))
        val ranking = schoolRanking("""<table><tr><td>课程</td><td>分布</td><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>15</td><td>6</td></tr><tr><td>教学班</td><td>分布</td><td>0</td><td>0</td><td>1</td><td>2</td><td>3</td><td>6</td><td>2</td></tr></table>""")!!
        assertEquals(6, ranking.number("course_rank")); assertEquals(2, ranking.number("class_rank")); assertEquals(5, ranking["distribution"]!!.obj().number("gte90"))
        assertNull(schoolRanking("<p>not available</p>"))
        assertTrue(schoolGrades(buildJsonObject { put("rows", JsonArray(emptyList())) }).isEmpty())
        assertTrue(runCatching { schoolGrades(payload()) }.isFailure)
    }
}
