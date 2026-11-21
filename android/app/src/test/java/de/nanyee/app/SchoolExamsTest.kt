package de.nanyee.app

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDate

class SchoolExamsTest {
    private fun fixture(name: String) = Json.parseToJsonElement(javaClass.getResource("/exams/$name.json")!!.readText()).jsonObject
    private fun courses() = schoolTimetable(schoolWeeklyRows(fixture("timetable")))
    private fun numbers() = schoolExamNumbers(fixture("tasks").items("rows"))

    @Test fun demoExamsDoNotPlaceThePreviousSundayIntoTheFirstTeachingWeek() {
        val monday = LocalDate.parse("2026-11-16")
        val exams = demoExams(monday, monday.toString())
        assertEquals(3, exams.size)
        assertTrue(exams.last().items("weeks").isEmpty())
        assertEquals(JsonArray(emptyList()), exams.last()["weeks"])
        assertEquals("2026-11-15", exams.last().text("date"))
        assertEquals(JsonArray(listOf(JsonPrimitive(1))), exams.first()["weeks"])
        assertTrue(exams.all { it.text("exam_number").startsWith("DEMO-") })
    }

    @Test fun fixtureRetainsOfferingKeysAndMarksOnlyExamActivities() {
        val courses = courses()
        assertEquals(13, courses.count(::isExam))
        assertTrue(courses.any { !isExam(it) })
        assertTrue(courses.all { it.text("kcrwdm").isNotBlank() && it.text("kcbh").isNotBlank() && it.text("jxbdm").isNotBlank() })
    }

    @Test fun taskJoinCoversAllThreeGroupedExamClassMismatches() {
        val tasks = fixture("tasks").items("rows")
        val exams = mergeExamCourses(courses(), numbers(), emptyList()).filter(::isExam)
        assertEquals(13, exams.size)
        assertTrue(exams.all { it.text("exam_number").startsWith("900000") })
        val grouped = exams.filter { exam -> tasks.single { it.text("kcrwdm") == exam.text("kcrwdm") }.text("jxbdm") != exam.text("jxbdm") }
        assertEquals(setOf("生物化学", "生理学", "医学免疫学"), grouped.map { it.text("name") }.toSet())
        assertEquals(3, grouped.size)
        assertTrue(mergeExamCourses(courses(), numbers(), emptyList()).filterNot(::isExam).all { it.text("exam_number").isEmpty() })
    }

    @Test fun courseCodeFallbackIsOnlyUsedForAnUnambiguousNumber() {
        val map = numbers()
        val task = fixture("tasks").items("rows").first()
        assertEquals(task.text("xid"), examNumber(payload("kcbh" to task.text("kcbh")), map))
        assertEquals(task.text("xid"), examNumber(task, map))
        val ambiguous = schoolExamNumbers(listOf(payload("kcbh" to "C", "xid" to "DEMO-1"), payload("kcbh" to "C", "xid" to "DEMO-2")))
        assertEquals("", examNumber(payload("kcbh" to "C"), ambiguous))
        assertTrue(schoolExamNumbers(emptyList()).isEmpty())
    }

    @Test fun emptyExamListAndFailedEnrichmentDoNotErasePreviousNumbers() = runBlocking {
        assertTrue(schoolExamRows(schoolAllRows { fixture("empty") }).isEmpty())
        val previous = numbers()
        val refreshed = optionalExamData<JsonObject> { error("offline") } ?: previous
        assertEquals(previous, refreshed)
        assertEquals(13, mergeExamCourses(courses(), refreshed, emptyList()).count { isExam(it) && it.text("exam_number").isNotBlank() })
        assertTrue(runCatching { optionalExamData<JsonObject> { throw CancellationException() } }.exceptionOrNull() is CancellationException)
    }

    @Test fun pagingCollectsEveryPageAndRejectsTruncationOrInvalidData() = runBlocking {
        val pages = mutableListOf<Int>()
        val result = schoolAllRows { page ->
            pages += page
            buildJsonObject { put("rows", JsonArray(listOf(payload("xid" to "DEMO-$page")))); put("total", 3) }
        }
        assertEquals(listOf(1, 2, 3), pages); assertEquals(3, result.size)
        assertTrue(runCatching { schoolAllRows { payload("total" to "2", "rows" to "invalid") } }.isFailure)
        assertTrue(runCatching { schoolAllRows { buildJsonObject { put("total", 1); put("rows", JsonArray(emptyList())) } } }.isFailure)
    }

    @Test fun datesArePreservedAndDedicatedRowsOverrideOnlyMatchingExams() {
        val course = JsonObject(payload("name" to "示例课程", "date" to "2027-01-08", "start_time" to "14:00", "end_time" to "15:30", "location" to "旧地点", "kcrwdm" to "T") + ("is_exam" to JsonPrimitive(true)))
        val raw = listOf(payload("kcmc" to "示例课程", "ksrq" to "2027-01-08", "kssj" to "15:00-17:00", "kscdmc" to "新地点", "zwh" to "21"), payload("kcmc" to "另一课程", "ksrq" to "2027-01-09", "kssj" to "9:00～10:30"))
        val extra = schoolExamRows(raw)
        val merged = mergeExamCourses(listOf(course), payload("task:T" to "DEMO-1"), extra)
        assertEquals("15:00", merged.single().text("start_time")); assertEquals("17:00", merged.single().text("end_time"))
        assertEquals("新地点", merged.single().text("location")); assertEquals("21", merged.single().text("seat"))
        assertEquals("DEMO-1", merged.single().text("exam_number"))
        assertEquals(2, timetableExams(merged, extra, payload(), "").size)
        assertEquals("09:00", extra[1].text("start_time"))
        assertEquals("2027-01-08", examDate("2027/01/08 00:00:00")); assertEquals("", examDate("invalid"))
        assertTrue(schoolExamRows(listOf(payload("kcmc" to "invalid"))).isEmpty())
        val differentDate = mergeExamCourses(listOf(JsonObject(course + ("date" to JsonPrimitive("2027-01-07")))), payload(), extra).single()
        assertEquals("旧地点", differentDate.text("location"))
    }

    @Test fun weeklyRawDatesAndEnrichedCacheSurviveRoundTripWhileOldCachesStillLoad() {
        val raw = schoolWeeklyRows(fixture("timetable")).first { it.text("jxhjmc").startsWith("考试") }
        val dated = schoolTimetable(listOf(JsonObject(raw + ("qsrq" to JsonPrimitive("2027-01-08"))))).single()
        assertEquals("2027-01-08", dated.text("date"))
        val table = CachedTimetable(mergeExamCourses(listOf(dated), numbers(), emptyList()), "2026-11-21T00:00:00Z", 20, "2026-08-31", numbers(), schoolExamRows(listOf(payload("kcmc" to "示例", "ksrq" to "2027-01-09"))))
        val snapshot = TimetableSnapshot("synthetic-owner", emptyList(), "202601", mapOf("202601" to table))
        assertEquals(snapshot, TimetableCacheCodec.decode(TimetableCacheCodec.encode(snapshot)))
        val old = TimetableCacheCodec.decode(fixture("old-cache").toString()).tables.getValue("202601")
        assertTrue(old.examNumbers.isEmpty()); assertTrue(old.examRows.isEmpty()); assertEquals("旧课程", old.courses.single().text("name"))
        assertFalse(isExam(old.courses.single()))
    }
}
