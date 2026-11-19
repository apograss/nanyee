package de.nanyee.app

import kotlinx.coroutines.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import okhttp3.FormBody
import okhttp3.Request
import okio.Buffer
import org.junit.Assert.*
import org.junit.Test

internal fun xxtClassFixture(name: String) = Json.parseToJsonElement(requireNotNull(XxtClassroomTest::class.java.getResource("/xuexitong/classroom-$name.json")).readText()).jsonObject
internal val xxtClassUser = XxtUser("12345", "示例本人")
internal val xxtClassCourse = XxtCourse("101", "201", "301", "示例课程", "示例老师")
internal fun xxtClassActivity(type: Int) = XxtActivity("401", "示例活动", "摘要", type, true, 1000, topicId = "topic-id")
internal fun Request.formValues(key: String) = (body as FormBody).let { form -> (0 until form.size).filter { form.name(it) == key }.map { form.value(it) } }
internal fun Request.bodyText() = Buffer().also { requireNotNull(body).writeTo(it) }.readUtf8()
internal fun xxtQuestionData(vararg types: Int): JsonObject {
    val data = xxtClassFixture("questions").getValue("data").jsonObject
    return JsonObject(data + ("questionlist" to JsonArray(data.getValue("questionlist").jsonArray.filter { it.jsonObject.number("type") in types })))
}
internal fun xxtManualDraft(page: XxtClassPage) = XxtClassDraft(answers = page.questions.associate { question -> question.id to when {
    question.options.isNotEmpty() -> listOf(question.options.last().key)
    question.type == 2 -> List(question.blanks) { "本人填写第${it + 1}空" }
    else -> listOf("本人手动填写的回答 & + 中文")
} }, text = "这是本人手动填写的讨论与建议。", scores = page.norms.map { (it.maximum / 2).toString() }, total = "80")

class XxtClassroomTest {
    private fun submission(type: Int, page: XxtClassPage) = XxtClassSubmission(xxtClassUser, xxtClassCourse, xxtClassActivity(type), page, xxtManualDraft(page))
    private fun quizPage() = xxtParseQuestions(xxtClassActivity(42), xxtClassFixture("questions").getValue("data").jsonObject)

    @Test fun quizParserRetainsPromptsAndOptionsButDiscardsAllReturnedAnswersAndCorrectness() {
        val page = quizPage()
        assertTrue(page.writable); assertEquals(5, page.questions.size); assertEquals(2, page.questions[2].blanks)
        assertEquals("选择课堂形式", page.questions[0].text); assertEquals(listOf("A", "B"), page.questions[0].options.map { it.key })
        val safe = Json.encodeToString(page)
        assertFalse(safe.contains("secret")); assertFalse(safe.contains("isanswer")); assertFalse(safe.contains("personAnswer")); assertFalse(safe.contains("analysis"))
        assertTrue(XxtClassDraft().answers.isEmpty())
    }
    @Test fun questionnairesSupportSingleMultipleJudgementAndShortText() {
        val page = xxtParseQuestions(xxtClassActivity(14), xxtQuestionData(0, 1, 4, 16))
        assertTrue(page.writable); assertEquals(listOf(0, 1, 4, 16), page.questions.map { it.type })
        xxtValidateClassroom(submission(14, page), 2000)
    }
    @Test fun emptyUnsupportedDuplicateAndMediaQuestionsAreReadOnly() {
        val row = xxtQuestionData(0).getValue("questionlist").jsonArray.first().jsonObject
        val variants = listOf(JsonArray(emptyList()), JsonArray(listOf(JsonObject(row + ("type" to JsonPrimitive(99))))), JsonArray(listOf(row, row)), JsonArray(listOf(JsonObject(row + ("content" to JsonPrimitive("<img src='https://example.invalid/question'>"))))))
        variants.forEach { rows ->
            val page = xxtParseQuestions(xxtClassActivity(42), buildJsonObject { put("questionlist", rows) })
            assertFalse(page.writable); assertTrue(page.notice.isNotBlank())
            assertThrows(IllegalArgumentException::class.java) { xxtClassroomRequest(submission(42, page), 2000, "nonce") }
        }
        assertThrows(XxtFailure::class.java) { xxtParseQuestions(xxtClassActivity(42), buildJsonObject {}) }
    }
    @Test fun alreadySubmittedDoesNotExposePreviousStudentAnswers() {
        val data = xxtQuestionData(0)
        val row = data.getValue("questionlist").jsonArray.single().jsonObject
        val returned = JsonObject(data + ("questionlist" to JsonArray(listOf(JsonObject(row + ("studentAnswer" to JsonPrimitive("secret-submitted")))))))
        val page = xxtParseQuestions(xxtClassActivity(42), returned)
        assertTrue(page.submitted); assertFalse(page.writable); assertFalse(Json.encodeToString(page).contains("secret"))
        assertFalse(xxtParseQuestions(xxtClassActivity(43), JsonObject(data + ("pptUserAttend" to buildJsonObject { put("answer", "secret-vote") }))).writable)
    }
    @Test fun quizRequestContainsOnlyUserEnteredAnswersAndNeverAnswerKeysOrReceipt() {
        val page = quizPage(); val request = xxtClassroomRequest(submission(42, page), 2000, "nonce")
        assertEquals("POST", request.method); assertEquals("/v2/apis/studentQuestion/doQuestionAnswering", request.url.encodedPath)
        assertEquals("401", request.url.queryParameter("activeId")); assertEquals("101", request.url.queryParameter("courseId")); assertEquals("201", request.url.queryParameter("classId"))
        assertEquals("PRIMARY_KEY", request.url.queryParameter("DB_STRATEGY")); assertEquals("activeId", request.url.queryParameter("STRATEGY_PARA"))
        assertTrue(request.body!!.contentType().toString().startsWith("application/json"))
        val raw = request.bodyText(); val rows = Json.parseToJsonElement(raw).jsonArray
        assertTrue(rows.all { it.jsonObject.keys == setOf("id", "type", "personAnswer") })
        assertEquals("B", rows[0].jsonObject.getValue("personAnswer").jsonObject.text("myoption"))
        assertEquals("本人填写第1空", rows[2].jsonObject.getValue("personAnswer").jsonObject.getValue("blankAnswer").jsonArray[0].jsonObject.text("content"))
        assertFalse(raw.contains("secret")); assertFalse(raw.contains("isanswer")); assertFalse(raw.contains("analysis")); assertFalse(request.url.toString().contains("answerReceipt"))
    }
    @Test fun noAutofillAndInvalidOrMissingManualAnswersPreventSubmission() {
        val value = submission(42, quizPage())
        val cases = listOf(XxtClassDraft(), value.draft.copy(answers = value.draft.answers + ("single" to listOf("X"))), value.draft.copy(answers = value.draft.answers + ("single" to listOf("A", "B"))), value.draft.copy(answers = value.draft.answers + ("blank" to listOf("one"))), value.draft.copy(answers = value.draft.answers + ("short" to listOf(" "))), value.draft.copy(answers = value.draft.answers + ("injected-id" to listOf("text"))))
        cases.forEach { draft -> assertThrows(IllegalArgumentException::class.java) { xxtClassroomRequest(value.copy(draft = draft), 2000, "nonce") } }
    }
    @Test fun voteHasExactOwnActivityFormAndRequiresManualSelection() {
        val value = submission(43, xxtParseQuestions(xxtClassActivity(43), xxtQuestionData(0)))
        val request = xxtClassroomRequest(value, 2000, "nonce")
        assertEquals("POST", request.method); assertEquals("/widget/quickvote/doQuestion", request.url.encodedPath)
        assertEquals(listOf("101"), request.formValues("courseId")); assertEquals(listOf("201"), request.formValues("classId")); assertEquals(listOf("401"), request.formValues("activeId"))
        assertEquals(listOf("single"), request.formValues("questionId")); assertEquals(listOf("B"), request.formValues("option")); assertEquals(5, (request.body as FormBody).size)
        assertThrows(IllegalArgumentException::class.java) { xxtClassroomRequest(value.copy(draft = XxtClassDraft()), 2000, "nonce") }
    }
    @Test fun questionnaireRepeatsIdsAndMultipleAnswersWithSafeFormEncoding() {
        val page = xxtParseQuestions(xxtClassActivity(14), xxtQuestionData(0, 1, 4, 16)); val value = submission(14, page)
        val request = xxtClassroomRequest(value.copy(draft = value.draft.copy(answers = value.draft.answers + ("multi" to listOf("A", "B")))), 2000, "nonce")
        assertEquals("/v2/apis/studentQuestion/doQuestion", request.url.encodedPath)
        assertEquals(listOf("1"), request.formValues("preventsubmit")); assertEquals(listOf("single", "multi", "short", "judge"), request.formValues("questionId"))
        assertEquals(listOf("A", "B"), request.formValues("answermulti")); assertEquals(listOf("本人手动填写的回答 & + 中文"), request.formValues("answershort"))
    }
    @Test fun optionalQuestionsCanBeSkippedButRequiredOnesCannot() {
        val page = xxtParseQuestions(xxtClassActivity(14), xxtQuestionData(0))
        assertThrows(IllegalArgumentException::class.java) { xxtValidateClassroom(submission(14, page).copy(draft = XxtClassDraft()), 2000) }
        val optional = page.copy(questions = page.questions.map { it.copy(required = false) })
        val request = xxtClassroomRequest(submission(14, optional).copy(draft = XxtClassDraft()), 2000, "nonce")
        assertTrue(request.formValues("questionId").isEmpty())
    }
    @Test fun topicParsesThreadAndRepliesAndHandlesEmptyList() {
        val page = xxtParseTopic(xxtClassActivity(5), xxtClassFixture("topic"), xxtClassFixture("replies"))
        assertEquals("课堂讨论", page.title); assertEquals("分享你的实践经历。", page.text); assertEquals("topic-uuid", page.topicUuid)
        assertEquals(XxtReply("示例同学", "我喜欢实践。", "今天"), page.replies.single()); assertTrue(page.writable)
        val empty = buildJsonObject { put("data", buildJsonObject { put("list", JsonArray(emptyList())) }) }
        assertTrue(xxtParseTopic(xxtClassActivity(5), xxtClassFixture("topic"), empty).replies.isEmpty())
        assertThrows(XxtFailure::class.java) { xxtParseTopic(xxtClassActivity(5), buildJsonObject {}, empty) }
        assertThrows(XxtFailure::class.java) { xxtParseTopic(xxtClassActivity(5), xxtClassFixture("topic"), buildJsonObject {}) }
    }
    @Test fun topicReadRequestsSignQueryAndPostPaginationAndCurrentUser() {
        val topic = xxtTopicRequest(false, "12345", "topic-id", "device", 2000)
        val replies = xxtTopicRequest(true, "12345", "topic-uuid", "device", 2000)
        listOf(topic, replies).forEach { assertEquals("POST", it.method); assertEquals("groupyd.chaoxing.com", it.url.host); assertEquals("2000", it.url.queryParameter("_time")); assertNotNull(it.url.queryParameter("inf_enc")); assertEquals(listOf("12345"), it.formValues("puid")) }
        assertEquals("/apis/topic/getTopic", topic.url.encodedPath); assertEquals(listOf("topic-id"), topic.formValues("topicId"))
        assertEquals("/apis/invitation/getReplys2", replies.url.encodedPath); assertEquals(listOf("topic-uuid"), replies.formValues("uuid")); assertEquals(listOf(""), replies.formValues("lastValue")); assertEquals(listOf("0"), replies.formValues("order"))
    }
    @Test fun topicReplyIsSignedRealNameAndOnlyManuallyEnteredBody() {
        val page = xxtParseTopic(xxtClassActivity(5), xxtClassFixture("topic"), xxtClassFixture("replies")); val value = submission(5, page)
        val request = xxtClassroomRequest(value, 2000, "fixed-nonce")
        assertEquals("/apis/invitation/addReply", request.url.encodedPath); assertEquals("POST", request.method)
        assertEquals("12345", request.url.queryParameter("puid")); assertEquals("topic-uuid", request.url.queryParameter("topicUUID")); assertEquals("fixed-nonce", request.url.queryParameter("uuid")); assertEquals("0", request.url.queryParameter("anonymous"))
        assertEquals(listOf(value.draft.text), request.formValues("content")); assertEquals(1, (request.body as FormBody).size)
        val fields = linkedMapOf("puid" to "12345", "uuid" to "fixed-nonce", "maxW" to "1080", "topicUUID" to "topic-uuid", "anonymous" to "0")
        assertEquals(xxtSigned(fields, "fixednonce", 2000)["inf_enc"], request.url.queryParameter("inf_enc"))
        assertThrows(IllegalArgumentException::class.java) { xxtClassroomRequest(value.copy(draft = XxtClassDraft()), 2000, "nonce") }
    }
    @Test fun ratingsParseBoundsAndConstructIndividualAndTotalOnlyRequests() {
        val page = xxtParseRating(xxtClassActivity(23), xxtClassFixture("rating").getValue("data").jsonObject); val value = submission(23, page)
        assertEquals(listOf(XxtNorm("课程内容", 60), XxtNorm("课堂互动", 40)), page.norms)
        val request = xxtClassroomRequest(value, 2000, "nonce")
        assertEquals("/v2/apis/score/stuSubmitAnswer", request.url.encodedPath); assertEquals(listOf("50"), request.formValues("score")); assertEquals(listOf("[30,20]"), request.formValues("scoreList"))
        assertEquals(listOf(value.draft.text), request.formValues("content"))
        val total = xxtParseRating(xxtClassActivity(23), buildJsonObject {})
        val totalRequest = xxtClassroomRequest(submission(23, total), 2000, "nonce")
        assertEquals(listOf("80"), totalRequest.formValues("score")); assertEquals(listOf("[]"), totalRequest.formValues("scoreList"))
        listOf("", "-1", "101", "bad").forEach { bad -> assertThrows(IllegalArgumentException::class.java) { xxtClassroomRequest(submission(23, total).copy(draft = XxtClassDraft(total = bad)), 2000, "nonce") } }
        assertThrows(IllegalArgumentException::class.java) { xxtClassroomRequest(value.copy(draft = value.draft.copy(scores = listOf("61", "10"))), 2000, "nonce") }
        assertThrows(IllegalArgumentException::class.java) { xxtClassroomRequest(value.copy(draft = XxtClassDraft()), 2000, "nonce") }
        assertFalse(xxtParseRating(xxtClassActivity(23), buildJsonObject { put("normList", buildJsonArray { add(buildJsonObject { put("score", "bad") }) }) }).writable)
        assertThrows(XxtFailure::class.java) { xxtParseRating(xxtClassActivity(23), buildJsonObject { put("normList", buildJsonObject {}) }) }
        val read = xxtRatingRequest(xxtClassCourse, xxtClassActivity(23))
        assertEquals("GET", read.method); assertEquals("/v2/apis/score/getStuScoreDetail", read.url.encodedPath); assertEquals("101", read.url.queryParameter("courseId"))
    }
    @Test fun endedUnknownAndReadOnlyActivitiesCannotProduceWriteRequests() {
        val value = submission(42, quizPage())
        listOf(value.copy(activity = value.activity.copy(ongoing = false)), value.copy(activity = value.activity.copy(end = 1500)), value.copy(activity = value.activity.copy(type = 999)), value.copy(page = value.page.copy(writable = false)), value.copy(user = value.user.copy(uid = ""))).forEach { invalid -> assertThrows(IllegalArgumentException::class.java) { xxtClassroomRequest(invalid, 2000, "nonce") } }
    }
    @Test fun everyWriteRequiresANewConfirmationAndUnknownOrSuccessfulOutcomesBlockReplay() {
        val demo = XxtClassroomDemo()
        xxtClassroomWrites.forEach { type ->
            val activity = demo.activities().first { it.type == type }; val page = demo.page(activity)
            val value = XxtClassSubmission(xxtClassUser, xxtClassCourse, activity, page, xxtManualDraft(page))
            XxtClassResult.entries.forEach { result ->
                val flow = XxtClassFlow()
                assertThrows(IllegalStateException::class.java) { flow.begin(2000) }
                flow.preview(value, 2000); assertEquals(value, flow.confirmation)
                flow.dismiss(); assertNull(flow.confirmation); assertThrows(IllegalStateException::class.java) { flow.begin(2000) }
                flow.preview(value, 2000); assertEquals(value, flow.begin(2000)); assertNull(flow.confirmation)
                assertThrows(IllegalStateException::class.java) { flow.begin(2000) }
                flow.finish(result)
                if (result == XxtClassResult.REJECTED) { assertThrows(IllegalStateException::class.java) { flow.begin(2000) }; flow.preview(value, 2000) }
                else assertThrows(IllegalStateException::class.java) { flow.preview(value, 2000) }
            }
        }
    }
    @Test fun journalPersistsManualDraftAndPendingMarkerButNeverRestoresAConfirmation() {
        val value = XxtJournal(classroom = xxtManualDraft(quizPage()), writePending = true)
        val raw = Json.encodeToString(value); assertFalse(raw.contains("secret")); assertFalse(raw.contains("confirmation"))
        val restored = Json.decodeFromString<XxtJournal>(raw); assertEquals(value, restored); assertTrue(restored.writePending)
        assertEquals(XxtClassStage.EDIT, XxtClassFlow().stage)
        assertEquals(XxtClassDraft(), Json.decodeFromString<XxtJournal>("{}").classroom)
    }
    @Test fun picksRetainOnlyOwnSelectionCountAndValidateResponses() {
        assertEquals(XxtPickStatus(1, true), xxtParsePicked(xxtClassFixture("pick"), "12345"))
        assertEquals(0, xxtParsePicked(xxtClassFixture("pick"), "unknown").count)
        assertEquals(XxtPickStatus(0, true), xxtParsePicked(buildJsonObject { put("result", 0) }, "12345"))
        assertThrows(XxtFailure::class.java) { xxtParsePicked(buildJsonObject { put("result", 1) }, "12345") }
        assertThrows(XxtFailure::class.java) { xxtParsePicked(buildJsonObject { put("result", -1) }, "12345") }
        assertThrows(XxtFailure::class.java) { xxtParsePicked(buildJsonObject {}, "12345") }
        val request = xxtPickRequest(xxtClassActivity(11), 2000)
        assertEquals("GET", request.method); assertEquals("/widget/webcache/pick/stu/pickAttend", request.url.encodedPath); assertEquals("401", request.url.queryParameter("webCacheId")); assertEquals("2000", request.url.queryParameter("_")); assertEquals("0", request.url.queryParameter("qasort"))
    }
    @Test fun pickedAlertOnlyChangesForNewOwnSelectionsAndForegroundVisibilityIsRequired() {
        val tracker = XxtPickTracker()
        assertFalse(tracker.observe(XxtPickStatus(0, true))); assertTrue(tracker.observe(XxtPickStatus(1, true))); assertFalse(tracker.observe(XxtPickStatus(1, true))); assertTrue(tracker.observe(XxtPickStatus(2, true)))
        assertFalse(tracker.observe(XxtPickStatus(0, true))); assertTrue(tracker.observe(XxtPickStatus(1, true)))
        val row = xxtClassActivity(11)
        assertTrue(xxtPickVisible(row, true)); assertFalse(xxtPickVisible(row, false)); assertFalse(xxtPickVisible(null, true)); assertFalse(xxtPickVisible(row.copy(type = 43), true)); assertFalse(xxtPickVisible(row.copy(ongoing = false), true))
    }
    @Test fun pollingCancelsImmediatelyWithoutUpdatingAfterAnInFlightRead() = runBlocking {
        var reads = 0; var updates = 0; val entered = CompletableDeferred<Unit>()
        val job = launch(start = CoroutineStart.UNDISPATCHED) { xxtPollPicked(read = { reads++; entered.complete(Unit); awaitCancellation() }, update = { updates++ }) }
        entered.await(); job.cancelAndJoin(); assertEquals(1, reads); assertEquals(0, updates)
    }
    @Test fun pollingStopsWhenEndedAndPropagatesFailureWithoutRetry() = runBlocking {
        var reads = 0; val updates = mutableListOf<XxtPickStatus>()
        xxtPollPicked(read = { XxtPickStatus(++reads, reads < 2) }, update = { updates.add(it) }, pause = {})
        assertEquals(2, reads); assertEquals(2, updates.size)
        reads = 0
        val error = runCatching { xxtPollPicked(read = { reads++; throw XxtFailure("UPSTREAM", "fixture") }, update = {}) }.exceptionOrNull()
        assertTrue(error is XxtFailure); assertEquals(1, reads)
    }
    @Test fun demoCoversEveryClassroomActivityWithSuccessFailureAndReadOnlyFallback() = runBlocking<Unit> {
        val backend = DemoXxtBackend(); val user = backend.user(); val course = backend.courses().single(); val activities = backend.activities(course)
        xxtClassroomWrites.forEach { type ->
            val rows = activities.filter { it.type == type }; assertEquals(2, rows.size)
            rows.forEach { activity ->
                val page = backend.classroom(course, activity, user); val value = XxtClassSubmission(user, course, activity, page, xxtManualDraft(page))
                assertEquals(if (activity.id.endsWith("fail")) XxtClassResult.REJECTED else XxtClassResult.SUCCESS, backend.submitClassroom(value))
                assertThrows(IllegalArgumentException::class.java) { runBlocking { backend.submitClassroom(value.copy(user = user.copy(uid = "other"))) } }
            }
        }
        val unknown = activities.single { it.type == 999 }; assertFalse(backend.classroom(course, unknown, user).writable)
        val picks = activities.filter { it.type == 11 }; assertEquals(2, picks.size)
        val pick = picks.single { it.id.endsWith("ok") }
        assertEquals(0, backend.picked(pick, user.uid).count); assertEquals(1, backend.picked(pick, user.uid).count)
        assertThrows(XxtFailure::class.java) { runBlocking { backend.picked(picks.single { it.id.endsWith("fail") }, user.uid) } }
        backend.clear()
        assertFalse(backend.classroom(course, activities.first { it.type == 43 }, user).submitted)
    }
    @Test fun successFailureAndAmbiguousResultsRemainDistinctWithoutRenderingServerMessages() {
        listOf("1", "true").forEach { assertEquals(XxtClassResult.SUCCESS, xxtClassResult(Json.parseToJsonElement("{\"result\":$it}").jsonObject)) }
        listOf("0", "false", "-1").forEach { assertEquals(XxtClassResult.REJECTED, xxtClassResult(Json.parseToJsonElement("{\"result\":$it,\"errorMsg\":\"secret\"}").jsonObject)) }
        assertEquals(XxtClassResult.UNKNOWN, xxtClassResult(buildJsonObject {}))
        assertEquals("只读 文本", xxtPlain("<script>secret</script><b>只读</b> 文本"))
    }
}
