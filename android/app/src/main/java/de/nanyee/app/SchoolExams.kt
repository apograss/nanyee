package de.nanyee.app

import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.*
import java.time.LocalDate

internal fun isExam(row: JsonObject) = (row["is_exam"] as? JsonPrimitive)?.booleanOrNull == true

internal fun examDate(value: String): String = runCatching {
    LocalDate.parse(value.trim().take(10).replace('/', '-')).toString()
}.getOrDefault("")

internal suspend fun schoolAllRows(fetch: suspend (Int) -> JsonObject): List<JsonObject> {
    val result = mutableListOf<JsonObject>()
    var page = 1
    while (true) {
        val response = fetch(page)
        val rows = response["rows"] as? JsonArray ?: error("Invalid school list")
        val total = (response["total"] as? JsonPrimitive)?.intOrNull ?: error("Invalid school total")
        require(total >= 0 && rows.all { it is JsonObject })
        result += rows.filterIsInstance<JsonObject>()
        if (result.size >= total) return result
        check(rows.isNotEmpty() && page < 1000) { "Incomplete school list" }
        page++
    }
}

internal suspend fun <T> optionalExamData(fetch: suspend () -> T): T? = try { fetch() }
catch (e: CancellationException) { throw e }
catch (_: Exception) { null }

internal fun schoolExamNumbers(rows: List<JsonObject>): JsonObject = buildJsonObject {
    rows.filter { it.text("xid").isNotBlank() }.forEach { row ->
        if (row.text("kcrwdm").isNotBlank()) put("task:${row.text("kcrwdm")}", row.text("xid"))
    }
    rows.filter { it.text("kcbh").isNotBlank() }.groupBy { it.text("kcbh") }.forEach { (code, group) ->
        val ids = group.map { it.text("xid") }.filter { it.isNotBlank() }.distinct()
        if (ids.size == 1) put("course:$code", ids.single())
    }
}

internal fun schoolExamRows(rows: List<JsonObject>): List<JsonObject> = rows.mapNotNull { row ->
    val name = row.text("kcmc").trim().replace(Regex("\\s+"), " ")
    val date = examDate(row.text("ksrq"))
    if (name.isEmpty() || date.isEmpty()) return@mapNotNull null
    val times = Regex("(?:[01]?\\d|2[0-3]):[0-5]\\d").findAll(row.text("kssj")).map { it.value.padStart(5, '0') }.toList()
    buildJsonObject {
        put("name", name); put("date", date); put("is_exam", true)
        put("start_time", times.firstOrNull().orEmpty()); put("end_time", times.getOrNull(1).orEmpty())
        put("location", row.text("kscdmc").trim()); put("seat", row.text("zwh").trim())
        listOf("kcrwdm", "kcbh", "jxbdm").forEach { put(it, row.text(it)) }
    }
}

internal fun examNumber(row: JsonObject, numbers: JsonObject): String =
    numbers.text("task:${row.text("kcrwdm")}").ifBlank { numbers.text("course:${row.text("kcbh")}") }

internal fun resolveExamDates(courses: List<JsonObject>, semesterStart: String): List<JsonObject> = courses.flatMap { course ->
    if (!isExam(course) || course.text("date").isNotBlank() || course.number("weekday") !in 1..7) listOf(course) else {
        val dated = (course["weeks"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.intOrNull }
            .filter { it in 1..30 }.distinct().mapNotNull { week ->
                teachingWeekMonday(semesterStart, week)?.let { monday ->
                    JsonObject(course + mapOf(
                        "date" to JsonPrimitive(monday.plusDays(course.number("weekday").toLong() - 1).toString()),
                        "weeks" to JsonArray(listOf(JsonPrimitive(week)))
                    ))
                }
            }
        dated.ifEmpty { listOf(course) }
    }
}

internal fun examsOnDate(courses: List<JsonObject>, date: LocalDate): List<JsonObject> =
    courses.filter { isExam(it) && it.text("date") == date.toString() }.sortedBy { it.text("start_time") }

internal fun mergeExamCourses(courses: List<JsonObject>, numbers: JsonObject, exams: List<JsonObject>, semesterStart: String = ""): List<JsonObject> = resolveExamDates(courses, semesterStart).map { course ->
    if (!isExam(course)) course else {
        val matching = exams.firstOrNull { it.text("name") == course.text("name") && it.text("date") == course.text("date") }
        JsonObject(course + buildJsonObject {
            put("exam_number", examNumber(course, numbers).ifBlank { course.text("exam_number") })
            matching?.let { exam -> listOf("start_time", "end_time", "location", "seat").forEach { key ->
                if (exam.text(key).isNotBlank()) put(key, exam.text(key))
            } }
        })
    }
}

internal fun timetableExams(courses: List<JsonObject>, extra: List<JsonObject>, numbers: JsonObject, semesterStart: String): List<JsonObject> {
    val scheduled = mergeExamCourses(courses, numbers, extra, semesterStart).filter { isExam(it) && it.text("date").isNotBlank() }
    val unmatched = extra.filter { exam -> scheduled.none { it.text("name") == exam.text("name") && it.text("date") == exam.text("date") } }
        .map { JsonObject(it + ("exam_number" to JsonPrimitive(examNumber(it, numbers)))) }
    return (scheduled + unmatched).distinctBy { listOf(it.text("name"), it.text("date"), it.text("start_time"), it.text("kcrwdm")) }
        .sortedWith(compareBy({ it.text("date") }, { it.text("start_time") }, { it.text("name") }))
}

internal fun demoExams(today: LocalDate, semesterStart: String): List<JsonObject> = listOf(0L, 2L, -1L).mapIndexed { index, offset ->
    val date = today.plusDays(offset)
    val start = LocalDate.parse(semesterStart)
    val week = Math.floorDiv(java.time.temporal.ChronoUnit.DAYS.between(start, date), 7).toInt() + 1
    buildJsonObject {
        put("name", listOf("神经解剖学", "医学遗传学", "基础化学")[index]); put("is_exam", true)
        put("activity", "考试（理论）"); put("date", date.toString()); put("weekday", date.dayOfWeek.value)
        put("weeks", JsonArray(if (week in 1..20) listOf(JsonPrimitive(week)) else emptyList())); put("start_node", 7); put("end_node", 8)
        put("start_time", "14:00"); put("end_time", "15:30"); put("location", "教学楼 306"); put("seat", "18")
        put("kcrwdm", "demo-task-$index"); put("kcbh", "DEMO-$index"); put("exam_number", "DEMO-000${index + 1}")
    }
}
