package de.nanyee.app

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.*
import org.junit.Test
import java.net.InetAddress

internal fun rainFixture(name: String): JsonObject = Json.parseToJsonElement(requireNotNull(RainContractTest::class.java.getResource("/rain/contracts.json")).readText()).jsonObject[name]!!.jsonObject
internal fun rainTestLesson(host: RainHost = RainHost.WWW) = RainLesson(host, "1001", "33", "fixture-bearer", "fixture-lesson-token")
internal fun rainTestAnswer(type: Int = 1, retry: Boolean = false): RainAction.Answer {
    val p = RainProblem("p1", type, "本人手动题目", listOf(RainOption("A", "甲"), RainOption("B", "乙")), if (type == 4) 2 else 0, if (type == 2) 2 else 1)
    return RainAction.Answer(rainTestLesson(), p, RainUnlock("p1", 90001, 30), RainDraft(if (type == 4) listOf("手填甲", "手填乙") else listOf("B"), "本人手写"), retry)
}
class RainContractTest {
    @Test fun hostsAreExactlyTheFourOfficialServers() {
        assertEquals(setOf("www.yuketang.cn", "pro.yuketang.cn", "changjiang.yuketang.cn", "huanghe.yuketang.cn"), RainHost.entries.map { it.domain }.toSet())
        RainHost.entries.forEach { assertEquals(it.domain, rainRequest(it, "/api/v3/classroom/on-lesson").url.host) }
    }
    @Test fun requestCannotOverrideOriginAndDoesNotDefaultToPosting() {
        listOf("https://evil.example/", "//evil.example/x").forEach { assertTrue(runCatching { rainRequest(RainHost.WWW, it) }.isFailure) }
        val request = rainRequest(RainHost.PRO, "/api/v3/classroom/on-lesson")
        assertEquals("GET", request.method); assertEquals("https", request.url.scheme); assertNull(request.header("Authorization"))
    }
    @Test fun courseAndOnLessonContractsHaveNoImplicitJoin() {
        val courses = rainCourses(rainFixture("courses")); val active = rainOnLesson(rainFixture("onLesson"))
        assertEquals(RainCourse("11", "22", "航海概论", "示例老师", "https://images.example.invalid/teacher.png", "航海一班"), courses.single())
        assertEquals(RainOnLesson("11", "33"), active.single())
        assertTrue(rainCourses(buildJsonObject { put("data", JsonArray(emptyList())) }).isEmpty())
        assertTrue(rainOnLesson(Json.parseToJsonElement("""{"code":0,"data":{"onLessonClassrooms":[]}}""").jsonObject).isEmpty())
    }
    @Test fun malformedAndRejectedListsAreNotTreatedAsEmpty() {
        listOf("{}", """{"code":1,"data":[]}""", """{"code":"invalid","data":[]}""", """{"data":{}}""", """{"data":[{"course_name":"no id"}]}""").forEach { assertTrue(runCatching { rainCourses(Json.parseToJsonElement(it).jsonObject) }.isFailure) }
        assertTrue(runCatching { rainOnLesson(buildJsonObject { put("data", buildJsonObject {}) }) }.isFailure)
    }
    @Test fun liveCoursesAreOnlyTheIntersectionAndChangeWithPolling() {
        val first = rainCourses(rainFixture("courses")).single()
        val second = first.copy(id = "other", name = "其他课程")
        val courses = listOf(first, second)
        val lists = rainCourseLists(courses, listOf(RainOnLesson(first.id, "lesson"), RainOnLesson("not-enrolled", "unknown")))
        assertEquals(listOf(first), lists.live); assertEquals(listOf(second), lists.remaining)
        val updated = rainCourseLists(courses, listOf(RainOnLesson(second.id, "new-lesson")))
        assertEquals(listOf(second), updated.live); assertEquals(listOf(first), updated.remaining)
        assertEquals(RainCourseLists(emptyList(), courses), rainCourseLists(courses, emptyList()))
        assertEquals(RainCourseLists(emptyList(), emptyList()), rainCourseLists(emptyList(), listOf(RainOnLesson(first.id, "lesson"))))
    }
    @Test fun courseSecondaryLineKeepsTeacherAndClassWithoutEmptySeparators() {
        val row = rainCourses(rainFixture("courses")).single()
        assertEquals("示例老师 · 航海一班", rainCourseSubtitle(row))
        assertEquals("示例老师", rainCourseSubtitle(row.copy(classroomName = "")))
        assertEquals("航海一班", rainCourseSubtitle(row.copy(teacher = "")))
        assertEquals("", rainCourseSubtitle(row.copy(teacher = "", classroomName = "")))
        val missing = rainCourses(Json.parseToJsonElement("""{"data":[{"course_id":1,"teacher":null}]}""").jsonObject).single()
        assertEquals("", missing.teacherAvatar); assertEquals("", missing.classroomName); assertEquals("", missing.teacher)
    }
    @Test fun qrKeepsServerImageAlongsideContentFallbackAndToken() {
        val qr = rainQr(rainFixture("qr"))
        assertEquals("fixture-qr-token", qr.token); assertEquals("https://www.yuketang.cn/fixture/login", qr.content)
        assertEquals(rainFixture("qr")["data"]!!.jsonObject.text("qrImage"), qr.image)
        assertEquals("https://unused.example", rainQr(Json.parseToJsonElement("""{"code":0,"data":{"token":"x","qrImage":"https://unused.example"}}""").jsonObject).image)
    }
    @Test fun presentationDropsAnswersRemarksCorrectFlagsAndNotes() {
        val deck = rainPresentation("deck", rainFixture("presentation"))
        val encoded = Json.encodeToString(deck)
        assertFalse(encoded.contains("SERVER-KEY-LEAK")); assertFalse(encoded.contains("correct")); assertFalse(encoded.contains("answers")); assertFalse(encoded.contains("studentAnswer"))
        assertEquals("https://images.example/1-large.png", deck.slides.first().image)
        assertEquals("手动选择", deck.slides.first().problem!!.body); assertEquals(2, deck.slides[1].problem!!.blanks)
        assertEquals(RainDraft(), RainDraft())
    }
    @Test fun emptySlidesRemainReadOnlyAndMissingSlidesIsAnError() {
        assertTrue(rainPresentation("deck", Json.parseToJsonElement("""{"title":"empty","slides":[]}""").jsonObject).slides.isEmpty())
        assertTrue(runCatching { rainPresentation("deck", buildJsonObject {}) }.isFailure)
    }
    @Test fun unknownTypesMediaAndAmbiguousOptionsAreReadOnly() {
        listOf("""{"problemId":"p","problemType":99}""", """{"problemId":"p","problemType":5,"body":"<img src='x'>"}""", """{"problemId":"p","problemType":1,"options":[{"key":"A","value":"<img src='x'>"}]}""", """{"problemId":"p","problemType":1,"options":[]}""", """{"problemId":"p","problemType":1,"options":[{"key":"A"},{"key":"A"}]}""").forEach { assertFalse(rainProblem(Json.parseToJsonElement(it).jsonObject).supported) }
    }
    @Test fun allTextQuestionTypesAreManualAndSupported() {
        (1..6).forEach { type -> val action = rainTestAnswer(type); rainValidate(action, 100000); assertEquals(type, rainAnswerBody(action, 100000).number("problemType")) }
        val poll = rainProblem(Json.parseToJsonElement("""{"problemId":"p","problemType":3,"pollingCount":2,"options":[{"key":"A","value":"甲"},{"key":"B","value":"乙"}]}""").jsonObject)
        assertEquals(2, poll.maximum); assertTrue(poll.supported)
    }
    @Test fun normalAnswerUsesOnlyManualDraftAndCurrentTimestamp() {
        val value = rainAnswerBody(rainTestAnswer(), 100000)
        assertEquals("p1", value.text("problemId")); assertEquals("100000", value.text("dt")); assertEquals(listOf("B"), value["result"]!!.jsonArray.map { it.jsonPrimitive.content })
        assertFalse("retry_times" in value)
    }
    @Test fun retryUsesOriginalUnlockTimestampAndNestedRetryTimes() {
        val root = rainAnswerBody(rainTestAnswer(retry = true), 100000)
        val nested = root["problems"]!!.jsonArray.single().jsonObject
        assertEquals("90001", nested.text("dt")); assertEquals(JsonNull, nested["retry_times"]); assertFalse("retry_times" in root)
    }
    @Test fun shortAnswerHasTextAndNoUploadedAttachments() {
        val result = rainAnswerBody(rainTestAnswer(5), 100000)["result"]!!.jsonObject
        assertEquals("本人手写", result.text("content")); assertTrue(result["videos"]!!.jsonArray.isEmpty()); assertEquals("", result["pics"]!!.jsonArray.single().jsonObject.text("pic"))
    }
    @Test fun blankUnknownDuplicateAndUnopenedAnswersNeverValidate() {
        val a = rainTestAnswer()
        listOf(a.copy(draft = RainDraft()), a.copy(draft = RainDraft(listOf("Z"))), a.copy(draft = RainDraft(listOf("A", "B"))), a.copy(draft = RainDraft(listOf("A", "A"))), a.copy(unlock = RainUnlock("another", 90001, 10)), a.copy(unlock = RainUnlock("p1", 0, 10)), a.copy(problem = a.problem.copy(supported = false)), rainTestAnswer(5).copy(draft = RainDraft(text = " ")), rainTestAnswer(4).copy(draft = RainDraft(listOf("one")))).forEach { assertTrue(runCatching { rainAnswerBody(it, 100000) }.isFailure) }
    }
    @Test fun locationEligibilityDoesNotCopyProvidedCentreCoordinates() {
        assertEquals(RainEligibility(true, false, "活动地址说明"), rainEligibility(rainFixture("eligibility")))
        assertTrue(runCatching { rainEligibility(buildJsonObject {}) }.isFailure)
    }
    @Test fun staleInaccurateInvalidOrNoLongerRequiredPositionsCannotSubmit() {
        val action = RainAction.Location(rainTestLesson(), XxtPosition(20.5, 110.5, 100000, 15f), RainEligibility(true, false, "活动地址"))
        rainValidate(action, 100001)
        listOf(action.copy(position = action.position.copy(obtainedAt = -120000)), action.copy(position = action.position.copy(obtainedAt = 100002)), action.copy(position = action.position.copy(accuracy = 101f)), action.copy(position = action.position.copy(latitude = Double.NaN)), action.copy(position = action.position.copy(longitude = 181.0)), action.copy(eligibility = action.eligibility.copy(signed = true)), action.copy(eligibility = action.eligibility.copy(required = false))).forEach { assertTrue(runCatching { rainValidate(it, 100001) }.isFailure) }
    }
    @Test fun scanAcceptsOnlyHttpsOnTheSelectedHost() {
        val valid = "https://pro.yuketang.cn/lesson?id=fixture"
        assertEquals(valid, rainScanUrl(RainHost.PRO, valid))
        listOf("http://pro.yuketang.cn/lesson", "https://www.yuketang.cn/lesson", "https://pro.yuketang.cn.evil.example/x", "https://pro.yuketang.cn@evil.example/x", "https://pro.yuketang.cn:8443/x", "https://user@pro.yuketang.cn/x", "ykt://lesson/x").forEach { assertTrue(runCatching { rainScanUrl(RainHost.PRO, it) }.isFailure) }
    }
    @Test fun helloPrefersLatestSlideTimelineAndDiscardsKeys() {
        val frame = rainFrame(rainFixture("hello"))
        assertEquals("deck", frame.presentation); assertEquals(2, frame.slide); assertEquals("p1", frame.events.last().problem); assertFalse(frame.toString().contains("SERVER-KEY-LEAK"))
        assertEquals(RainUnlock("p1", 90001, 30), rainFrame(rainFixture("unlock")).unlock)
    }
    @Test fun timelineSupportsNavigationLocationAndLessonEndWithoutInventingAnswers() {
        assertEquals(3, rainFrame(Json.parseToJsonElement("""{"op":"slidenav","slide":{"si":3}}""").jsonObject).slide)
        assertTrue(rainFrame(Json.parseToJsonElement("""{"op":"lessonfinished"}""").jsonObject).finished)
        assertTrue(rainFrame(Json.parseToJsonElement("""{"op":"hello","message":"lesson finished"}""").jsonObject).finished)
        assertTrue(rainFrame(Json.parseToJsonElement("""{"op":"locationcheckinend"}""").jsonObject).refreshLocation)
        assertEquals("unknown", rainFrame(Json.parseToJsonElement("""{"op":"unknown","answers":["SERVER-KEY-LEAK"]}""").jsonObject).op)
    }
    @Test fun socketMessagesContainOnlyOwnRoleTokenAndLesson() {
        val joined = rainTestLesson()
        val hello = Json.parseToJsonElement(rainHello(joined)).jsonObject
        assertEquals(setOf("op", "userid", "role", "auth", "lessonid"), hello.keys); assertEquals("student", hello.text("role")); assertEquals(joined.uid, hello.text("userid"))
        assertEquals("""{"op":"leavelesson","lessonid":"33"}""", rainLeave(joined))
    }
    @Test fun confirmationIsConsumedAndCannotSubmitWithoutANewPreview() {
        val gate = RainGate(); assertTrue(runCatching { gate.begin(100000) }.isFailure)
        gate.preview(rainTestAnswer(), 100000); gate.dismiss(); assertTrue(runCatching { gate.begin(100000) }.isFailure)
        gate.preview(rainTestAnswer(), 100000); assertEquals(rainTestAnswer(), gate.begin(100000)); assertTrue(runCatching { gate.begin(100000) }.isFailure)
        gate.finish(); assertTrue(runCatching { gate.begin(100000) }.isFailure)
    }
    @Test fun positionIsRevalidatedAtConfirmationTime() {
        val gate = RainGate(); gate.preview(RainAction.Location(rainTestLesson(), XxtPosition(20.5, 110.5, 100000, 10f), RainEligibility(true, false, "")), 100000)
        assertTrue(runCatching { gate.begin(220001) }.isFailure)
    }
    @Test fun pendingWritesPersistAcrossRestartAndBlockEvenDifferentWrites() {
        val store = MemoryRainStore(); RainPendingWrites(store, RainHost.WWW, "1001").begin("join:33")
        val restored = RainPendingWrites(store, RainHost.WWW, "1001")
        assertEquals("join:33", restored.pending); assertTrue(runCatching { restored.begin("answer:33:p1") }.isFailure)
        assertEquals("", RainPendingWrites(store, RainHost.PRO, "1001").pending); assertEquals("", RainPendingWrites(store, RainHost.WWW, "1002").pending)
        restored.completed(); restored.begin("answer:33:p1"); assertEquals("answer:33:p1", restored.pending)
    }
    @Test fun assetsRejectPrivateAndNonGlobalNetworkAddresses() {
        listOf("127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.0.1", "100.64.0.1", "198.18.0.1", "::1", "fc00::1", "fe80::1").forEach { assertFalse(rainPublicAddress(InetAddress.getByName(it))) }
        assertTrue(rainPublicAddress(InetAddress.getByName("8.8.8.8"))); assertTrue(rainPublicAddress(InetAddress.getByName("2606:4700:4700::1111")))
        assertTrue(runCatching { rainAssetClient().dns.lookup("127.0.0.1") }.isFailure)
    }
    @Test fun resultMustExplicitlySaySuccess() {
        assertEquals(RainResult.SUCCESS, rainResult(Json.parseToJsonElement("""{"code":0}""").jsonObject)); assertEquals(RainResult.REJECTED, rainResult(Json.parseToJsonElement("""{"code":50001}""").jsonObject)); assertEquals(RainResult.UNKNOWN, rainResult(buildJsonObject {}))
    }
}
