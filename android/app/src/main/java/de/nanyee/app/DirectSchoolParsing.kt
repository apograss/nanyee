package de.nanyee.app

import kotlinx.serialization.json.*
import org.jsoup.Jsoup
import java.security.MessageDigest
import java.time.LocalDate
import java.time.LocalTime

internal const val UIS = "https://uis.smu.edu.cn"
internal const val ACADEMIC = "https://zhjw.smu.edu.cn"

internal fun schoolLoginForm(account: String, password: String, captcha: String): Map<String, String> = linkedMapOf(
    "loginName" to account,
    "password" to MessageDigest.getInstance("MD5").digest(password.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it.toInt() and 255) },
    "randcodekey" to captcha,
    "locationBrowser" to "谷歌浏览器[Chrome]",
    "appid" to "3550176", "redirect" to "$ACADEMIC/new/ssoLogin", "strength" to "3"
)

internal fun schoolLoginTicket(data: JsonObject): String {
    val ticket = (data["ticket"] as? JsonPrimitive)?.takeIf { it.isString }?.content.orEmpty()
    if (ticket.isNotEmpty() && ticket.length <= 2048) return ticket
    val reason = when {
        data.text("msg") == "badRandcodekey" || "验证码" in data.text("message") -> "bad_captcha"
        "密码" in data.text("message") -> "bad_credentials"
        else -> ""
    }
    throw SchoolError(401, "UPSTREAM_REJECTED", schoolErrorText("UPSTREAM_REJECTED", 401, payload("smu_reason" to reason), true), reason)
}

internal fun schoolSemesters(html: String): List<JsonObject> = Jsoup.parse(html).select("select#xnxqdm option")
    .filter { it.attr("value").matches(Regex("\\d{6}")) }.distinctBy { it.attr("value") }
    .map { payload("code" to it.attr("value"), "label" to it.text().ifBlank { it.attr("value") }.take(32)) }

internal fun schoolSemesterStart(data: JsonElement): String {
    val monday = (data as? JsonArray)?.firstOrNull { (it as? JsonObject)?.get("xqmc") == JsonPrimitive(1) }?.obj()?.text("rq")
    val date = runCatching { LocalDate.parse(monday) }.getOrNull()
    if (date == null || date.dayOfWeek.value != 1) throw SchoolError(503, "UPSTREAM_UNAVAILABLE", "学校校历暂时无法读取。")
    return date.toString()
}

internal fun schoolTimetable(rows: List<JsonObject>): List<JsonObject> {
    fun clean(value: String) = value.trim().replace(Regex("\\s+"), " ")
    val ids = linkedMapOf<String, Int>()
    val events = rows.map { row ->
        val name = clean(row.text("kcmc"))
        val start = row.text("qssj").take(5); val end = row.text("jssj").take(5)
        require(name.isNotEmpty() && name.length <= 256 && row.number("xq") in 1..7 && row.number("ps") in 1..60 && row.number("pe") in 1..60 && row.number("zc") in 1..30)
        LocalTime.parse(start); LocalTime.parse(end)
        buildJsonObject {
            put("course_id", ids.getOrPut(name) { ids.size }); put("name", name)
            put("location", clean(row.text("jxcdmc"))); put("activity", clean(row.text("jxhjmc"))); put("teachers", clean(row.text("teaxms")))
            put("credit_hours", row.text("xs")); put("weekday", row.number("xq")); put("start_node", row.number("ps")); put("end_node", row.number("pe"))
            put("start_time", start); put("end_time", end); put("week", row.number("zc"))
            listOf("kcrwdm", "kcbh", "jxbdm").forEach { put(it, row.text(it)) }
            val exam = row.text("jxhjmc").startsWith("考试")
            put("is_exam", exam)
            if (exam) put("date", examDate(row.text("qsrq")))
        }
    }
    return events.groupBy { row -> listOf("name", "location", "activity", "teachers", "start_node", "end_node", "start_time", "end_time", "weekday", "kcrwdm", "kcbh", "jxbdm", "date").map { row[it] } }.values.map { group ->
        JsonObject(group.first().filterKeys { it != "week" } + ("weeks" to JsonArray(group.map { it.number("week") }.distinct().sorted().map(::JsonPrimitive))))
    }
}

internal fun schoolWeeklyRows(data: JsonElement): List<JsonObject> {
    require(data is JsonObject)
    val rows = data["data"] ?: JsonArray(emptyList())
    require(rows is JsonArray)
    return rows.filterIsInstance<JsonObject>()
}

internal fun schoolGrades(data: JsonObject): List<JsonObject> {
    require(data["rows"] is JsonArray)
    return (data["rows"] as JsonArray).filterIsInstance<JsonObject>().map { row ->
        fun number(key: String) = row.text(key).toDoubleOrNull()?.takeIf { it.isFinite() } ?: 0.0
        buildJsonObject {
            listOf("name" to "kcmc", "english_name" to "kcywmc", "raw_score" to "zcj", "study_type" to "xdfsmc", "semester" to "xnxqmc", "department" to "kkbmmc", "exam_type" to "ksxzmc", "grade_id" to "cjdm").forEach { (key, source) -> put(key, row.text(source)) }
            put("course_category", row.text("kcdlmc").ifEmpty { row.text("kcflmc") })
            put("numeric_score", number("zcjfs")); put("grade_point", number("cjjd")); put("credits", number("xf").coerceAtLeast(0.0)); put("total_hours", number("zxs"))
        }
    }
}

internal fun schoolRanking(html: String): JsonObject? {
    val parsed = mutableMapOf<String, List<Int>>()
    Jsoup.parse(html).select("tr").forEach { row ->
        val cells = row.select("th,td").map { it.text() }
        val kind = listOf("课程", "教学班").firstOrNull { cells.firstOrNull()?.contains(it) == true }
        if (kind != null && cells.size >= 9) parsed[kind] = cells.subList(2, 9).map { it.toIntOrNull() ?: 0 }
    }
    val course = parsed["课程"] ?: return null
    val group = parsed["教学班"] ?: return null
    return buildJsonObject {
        put("course_rank", course[6]); put("course_total", course[5]); put("class_rank", group[6]); put("class_total", group[5])
        put("distribution", buildJsonObject { listOf("lt60", "s60to70", "s70to80", "s80to90", "gte90").forEachIndexed { i, key -> put(key, course[i]) } })
    }
}
