package de.nanyee.app

import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.launch
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelProvider
import kotlinx.serialization.json.*
import okhttp3.*
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import okio.Timeout
import org.junit.Assert.*
import org.junit.Test
import java.net.URLDecoder
import java.time.LocalDate
import java.time.Instant
import kotlin.random.Random

internal val evaluationReference = EvaluationReference("teacher-1", "hour-1", "questionnaire-1")
internal val evaluationFixture = """<script>entss.post('/new/student/ktpj/savePj', {
 xnxqdm:'202501', pjlxdm:'6', teadm:'teacher-1', teaxm:'演示教师', wjdm:'questionnaire-1',
 kcrwdm:'task-1', kcptdm:'platform-1', kcdm:'演示课程', jxhjdm:'lecture', ignored:'unsafe'
});</script>
<div class='question' data-txdm='5' data-zbdm='quality'><h3>教学质量</h3>
 <div class='raty' data-fz='25.0' data-wtxm='[
 {"zbxmdm":"worst","zbxmmc":"非常不满意"},{"zbxmdm":"bad","zbxmmc":"比较不满意"},
 {"zbxmdm":"average","zbxmmc":"一般"},{"zbxmdm":"good","zbxmmc":"比较满意"},
 {"zbxmdm":"excellent","zbxmmc":"非常满意"}]'></div></div>
<div class='question' data-txdm='1' data-zbdm='attendance'><h3>是否迟到</h3>
 <input type='radio' value='yes' data-fz='0' data-mc='是'>
 <label><input type='radio' value='no' data-fz='0'>否</label></div>
<div class='question' data-txdm='3' data-zbdm='comment'><h3>建议</h3></div>
""".trimIndent()

class EvaluationTest {
    @Test fun schoolSessionChangeClearsIdleCoursesAndPreviewWithoutCallingOldSource() = runBlocking {
        val state = EvaluationState()
        var oldDrafts = 0
        val old = object : EvaluationSource by DemoEvaluationSource() {
            override suspend fun draft(reference: EvaluationReference): EvaluationDraft {
                oldDrafts++
                return DemoEvaluationSource().draft(reference)
            }
        }
        state.loadForSession({ "session-a" }) { old }
        state.prepareForSession()
        assertEquals(3, oldDrafts); assertEquals(3, state.run.preview.size)
        state.onSessionChanged("session-a")
        assertEquals(3, state.run.preview.size)
        state.onSessionChanged("")
        state.onSessionChanged("session-b")
        assertTrue(state.pending.isEmpty()); assertTrue(state.selected.isEmpty()); assertFalse(state.listed)
        assertTrue(state.run.preview.isEmpty())
        state.prepareForSession()
        assertEquals(3, oldDrafts)
        val fresh = DemoEvaluationSource()
        state.loadForSession({ "session-b" }) { fresh }
        state.prepareForSession()
        assertEquals(3, state.run.preview.size)
    }
    @Test fun sessionChangeRetainsInFlightResultsAndMarksCompletedBatchStale() = runBlocking {
        val state = EvaluationState()
        val started = CompletableDeferred<Unit>()
        val finish = CompletableDeferred<Unit>()
        var submissions = 0
        val source = object : EvaluationSource by DemoEvaluationSource() {
            override suspend fun submit(preview: EvaluationPreview): Int {
                submissions++; started.complete(Unit); finish.await(); return 20
            }
        }
        state.loadForSession({ "session-a" }) { source }
        state.prepareForSession()
        val task = launch { state.run.submit(source) }
        started.await()
        state.onSessionChanged("session-b")
        assertTrue(state.run.stale)
        finish.complete(Unit); task.join()
        assertEquals(1, submissions)
        assertTrue(state.run.results.first().contains("提交成功"))
        assertTrue(state.run.results.last().contains("学校会话已变更"))
        val retained = state.run.results.toList()
        state.onSessionChanged("session-c")
        assertEquals(retained, state.run.results)
        assertTrue(state.run.confirmed); assertTrue(state.run.stale)
    }
    @Test fun lateListingAndPreviewCannotRestoreCoursesFromOldSession() = runBlocking {
        val state = EvaluationState()
        val listed = CompletableDeferred<Unit>()
        val finish = CompletableDeferred<Unit>()
        val slow = object : EvaluationSource by DemoEvaluationSource() {
            override suspend fun pending(): List<EvaluationReference> { listed.complete(Unit); finish.await(); return DemoEvaluationSource().pending() }
        }
        val task = launch { state.loadForSession({ "session-a" }) { slow } }
        listed.await(); state.onSessionChanged("session-b"); finish.complete(Unit); task.join()
        assertTrue(state.pending.isEmpty()); assertFalse(state.listed)
        val drafting = CompletableDeferred<Unit>()
        val draftFinish = CompletableDeferred<Unit>()
        val slowDraft = object : EvaluationSource by DemoEvaluationSource() {
            override suspend fun draft(reference: EvaluationReference): EvaluationDraft { drafting.complete(Unit); draftFinish.await(); return DemoEvaluationSource().draft(reference) }
        }
        state.loadForSession({ "session-b" }) { slowDraft }
        val preparing = launch { state.prepareForSession() }
        drafting.await(); state.onSessionChanged("session-c"); draftFinish.complete(Unit); preparing.join()
        assertTrue(state.run.preview.isEmpty()); assertTrue(state.pending.isEmpty())
    }
    @Test fun evaluationReconciliationIgnoresServerDefaultsAndNormalizesAbsentToNull() = runBlocking {
        val sent = Instant.parse("2030-01-01T00:00:00Z")
        val body = evaluationJob("fixture", 30, "")
        val pending = CabinSubmission(body, now = { sent })
        val backend = object : PlatformBackend {
            override suspend fun clearLocal() {}
            override suspend fun call(method: String, path: String, body: JsonObject?, key: String?): JsonElement = JsonNull
        }
        pending.send(backend)
        val payload = body["payload"]!!.jsonObject
        fun job(p: JsonElement) = JsonObject(body + mapOf("payload" to p, "created_at" to JsonPrimitive(sent.toString()), "state" to JsonPrimitive("queued")))
        val defaults = job(JsonObject(payload + mapOf("retry_until" to JsonNull, "server_default" to JsonPrimitive(true))))
        assertEquals(defaults, pending.matchingJob(listOf(defaults)))
        val explicitNull = CabinSubmission(JsonObject(body + ("payload" to JsonObject(payload + ("retry_until" to JsonNull)))), now = { sent })
        explicitNull.send(backend)
        assertEquals(job(payload), explicitNull.matchingJob(listOf(job(payload))))
        assertNull(pending.matchingJob(listOf(job(JsonObject(payload + ("max_courses" to JsonPrimitive(31)))))))
        assertNull(pending.matchingJob(listOf(job(JsonObject(payload - "strategy")))))
        assertNull(pending.matchingJob(listOf(job(JsonNull))))
        assertNull(pending.matchingJob(emptyList()))
    }
    @Test fun screenRecreationRetainsRunningAndCompletedBatchInSameViewModelStore() = runBlocking {
        val store = ViewModelStore()
        val provider = ViewModelProvider.create(store, ViewModelProvider.NewInstanceFactory())
        val state = provider["manual-evaluation-live", EvaluationState::class.java]
        val started = CompletableDeferred<Unit>()
        val finish = CompletableDeferred<Unit>()
        val source = object : EvaluationSource by DemoEvaluationSource() {
            override suspend fun submit(preview: EvaluationPreview): Int { started.complete(Unit); finish.await(); return 20 }
        }
        state.run.prepare(source, source.pending().take(1))
        val task = launch { state.run.submit(source) }
        started.await()
        val recreated = ViewModelProvider.create(store, ViewModelProvider.NewInstanceFactory())["manual-evaluation-live", EvaluationState::class.java]
        assertSame(state, recreated)
        assertTrue(recreated.run.confirmed); assertEquals(1, recreated.run.progress)
        finish.complete(Unit); task.join()
        assertEquals(1, recreated.run.results.size)
        assertTrue(recreated.run.results.single().contains("提交成功"))
        assertSame(recreated, provider["manual-evaluation-live", EvaluationState::class.java])
        assertNotSame(state, provider["manual-evaluation-demo", EvaluationState::class.java])
        store.clear()
    }
    @Test fun interruptedBatchPreservesPriorResultsAndUnknownInFlightCourse() = runBlocking {
        val started = CompletableDeferred<Unit>()
        var count = 0
        val source = object : EvaluationSource by DemoEvaluationSource() {
            override suspend fun submit(preview: EvaluationPreview): Int {
                if (++count == 2) { started.complete(Unit); awaitCancellation() }
                return 20
            }
        }
        val run = ManualEvaluationRun()
        run.prepare(source, source.pending())
        val task = launch { run.submit(source) }
        started.await(); task.cancel(); task.join()
        assertEquals(2, count); assertEquals(2, run.results.size)
        assertTrue(run.results.first().contains("提交成功"))
        assertTrue(run.results.last().contains("演示课程 2：提交已中断，结果未知"))
        assertTrue(run.confirmed); assertTrue(run.preview.isEmpty())
        assertTrue(runCatching { run.submit(source) }.isFailure)
    }
    @Test fun whitespaceNormalizationUsesPortableCharacterClassesWithoutInlineFlags() {
        assertFalse(evaluationWhitespace.pattern.contains("(?"))
        val row = payload("teadm" to " teacher-1\t", "dgksdm" to "hour-1", "ktpj" to "questionnaire-1", "kcmc" to "\u3000演示\u00a0\u0085\n课程\u3000")
        val parsed = pendingEvaluations(buildJsonObject { put("rows", JsonArray(listOf(row))) }).single()
        assertEquals("teacher-1", parsed.teacher)
        assertEquals("演示 课程", parsed.courseName)
    }
    @Test fun pendingFiltersCompletedMissingAndDuplicateRowsAndNormalizesText() {
        val row = payload("pjdm" to "", "teadm" to " teacher-1 ", "dgksdm" to "hour-1", "ktpj" to "questionnaire-1", "kcmc" to "演示  课程")
        val rows = JsonArray(listOf(row, row, JsonObject(row + ("pjdm" to JsonPrimitive("done"))), payload("teadm" to "missing"), JsonNull))
        val parsed = pendingEvaluations(buildJsonObject { put("rows", rows) })
        assertEquals(1, parsed.size); assertEquals("teacher-1", parsed.single().teacher); assertEquals("演示 课程", parsed.single().courseName)
        assertTrue(pendingEvaluations(buildJsonObject { put("rows", JsonArray(emptyList())) }).isEmpty())
        assertTrue(runCatching { pendingEvaluations(JsonArray(emptyList())) }.isFailure)
    }
    @Test fun draftMirrorsStarsRadioHiddenAllowlistAndSkipsUnsupportedText() {
        val draft = evaluationDraft(evaluationFixture, evaluationReference)
        assertEquals(2, draft.questions.size)
        assertEquals(listOf(5, 10, 15, 20, 25), draft.questions.first().options.map { it.score })
        assertEquals("否", draft.questions.last().options.last().label)
        assertEquals(setOf("xnxqdm", "pjlxdm", "teaxm", "kcrwdm", "kcptdm", "kcdm", "jxhjdm"), draft.hidden.keys)
        assertTrue(runCatching { evaluationDraft("<html>评课未开放</html>", evaluationReference) }.isFailure)
        assertTrue(runCatching { evaluationDraft(evaluationFixture.replace("teadm:'teacher-1'", "teadm:'other'"), evaluationReference) }.isFailure)
        assertTrue(runCatching { evaluationDraft(evaluationFixture.replace("wjdm:'questionnaire-1'", "wjdm:'other'"), evaluationReference) }.isFailure)
        assertTrue(runCatching { evaluationDraft(evaluationFixture, evaluationReference.copy(teacher = "bad&code")) }.isFailure)
    }
    @Test fun duplicateIndicatorsOptionsAndPythonBankersRoundingArePreserved() {
        val html = evaluationFixture.replace("25.0", "12.5") + "<div class='question' data-txdm='1' data-zbdm='quality'><input type='radio' value='extra'></div>"
        val draft = evaluationDraft(html, evaluationReference)
        assertEquals(2, draft.questions.size)
        assertEquals(listOf(2, 5, 8, 10, 12), draft.questions.first().options.map { it.score })
    }
    @Test fun legacyProfilesProduceValidPositiveTiersAndFallbackToLastUnscoredOption() {
        val original = evaluationDraft(evaluationFixture, evaluationReference)
        val rating = original.questions.first()
        val expanded = original.copy(questions = (0..7).map { rating.copy(indicator = "q$it") } + original.questions.last())
        val validProfiles = setOf(listOf(0, 0, 1, 1), listOf(0, 1, 1, 2), listOf(1, 1, 1, 1), listOf(0, 1, 1, 1))
        repeat(100) { seed ->
            val answers = evaluationAnswers(expanded, Random(seed))
            val ranks = expanded.questions.take(8).map { q -> q.options.sortedByDescending { it.score }.indexOfFirst { it.code == answers[q.indicator] } }
            assertTrue(ranks.take(4).sorted() in validProfiles)
            assertEquals(ranks.take(4), ranks.drop(4))
            assertEquals("no", answers["attendance"])
            evaluationSubmission(EvaluationPreview(expanded, answers))
        }
    }
    @Test fun exactSubmissionFieldsStarsTotalAndCompleteSelectionValidation() {
        val draft = evaluationDraft(evaluationFixture, evaluationReference)
        val preview = EvaluationPreview(draft, mapOf("quality" to "excellent", "attendance" to "no"))
        val fields = evaluationSubmission(preview)
        assertEquals("25", fields["wtpf"]); assertEquals("teacher-1", fields["teabh"]); assertEquals("", fields["pfsm"])
        val answers = Json.parseToJsonElement(fields.getValue("dt")).jsonArray
        assertEquals("★★★★★", answers.first().jsonObject.text("dtjg")); assertEquals("否", answers.last().jsonObject.text("dtjg"))
        assertTrue(runCatching { evaluationSubmission(preview.copy(selections = emptyMap())) }.isFailure)
        assertTrue(runCatching { evaluationSubmission(preview.copy(selections = preview.selections + ("quality" to "not-an-option"))) }.isFailure)
    }
    @Test fun buildsOnlyDocumentedSchoolRequestsWithExactHeadersAndFields() {
        val pending = evaluationPendingRequest(LocalDate.of(2030, 1, 2))
        assertEquals("https://zhjw.smu.edu.cn/new/student/ktpj/xsktpjData", pending.url.toString())
        assertEquals("POST", pending.method)
        assertEquals(mapOf("jsrq" to "2030-01-02", "page" to "1", "rows" to "60", "sort" to "jsrq, jcdm2", "order" to "desc"), form(pending))
        assertEquals("XMLHttpRequest", pending.header("X-Requested-With")); assertEquals(ACADEMIC, pending.header("Origin"))
        assertEquals("$ACADEMIC/new/student/ktpj", pending.header("Referer"))
        assertEquals("application/x-www-form-urlencoded; charset=UTF-8", pending.body!!.contentType().toString())
        val draft = evaluationDraftRequest(evaluationReference)
        assertEquals("GET", draft.method); assertEquals("/new/student/ktpj/showXsktpjwj.page", draft.url.encodedPath)
        assertEquals(setOf("pjlxdm", "teadm", "dgksdm", "wjdm"), draft.url.queryParameterNames)
        assertEquals("6", draft.url.queryParameter("pjlxdm")); assertEquals(pending.header("Referer"), draft.header("Referer"))
        val value = evaluationDraft(evaluationFixture, evaluationReference)
        val preview = EvaluationPreview(value, evaluationAnswers(value, Random(1)))
        val submission = evaluationSubmitRequest(preview)
        assertEquals("/new/student/ktpj/savePj", submission.url.encodedPath); assertEquals("POST", submission.method)
        assertEquals(evaluationSubmission(preview), form(submission))
    }
    @Test fun resultsMatchPythonIncludingTextSuccessAndUnknownResponses() {
        listOf("""{"code":0}""", """{"code":"0"}""", """{"success":true}""", "保存成功").forEach { assertTrue(evaluationResult(it)) }
        listOf("", "保存失败", "成功但失败", "[]", "null", "<html>登录</html>", """{"success":false,"code":1}""").forEach { assertFalse(evaluationResult(it)) }
    }
    @Test fun automaticJobHasExactConfirmationAndNoSecretsAndValidatesLimits() {
        val body = evaluationJob("fixture-credential", 30, "")
        assertEquals("evaluation", body.text("tool_id")); assertEquals("submit", body.text("operation")); assertEquals("evaluation:submit:v1", body.text("confirmation_version"))
        assertEquals(setOf("strategy", "max_courses"), body["payload"]!!.jsonObject.keys)
        assertEquals("2099-01-01T00:00:00Z", evaluationJob("fixture", 1, "2099-01-01T00:00:00Z")["payload"]!!.jsonObject.text("retry_until"))
        assertEquals("legacy_positive_random", body["payload"]!!.jsonObject.text("strategy"))
        assertFalse(body.toString().contains("password")); assertFalse(body.toString().contains("secret"))
        listOf(0, 61).forEach { assertTrue(runCatching { evaluationJob("fixture", it, "") }.isFailure) }
        listOf("2030-01-01", "2000-01-01T00:00:00Z").forEach { assertTrue(runCatching { evaluationJob("fixture", 1, it) }.isFailure) }
        val request = platformRequest("POST", "/jobs", body, "fixture-csrf", "fixture-key")
        assertEquals("fixture-csrf", request.header("X-CSRF-Token")); assertEquals("fixture-key", request.header("Idempotency-Key"))
        assertTrue(runCatching { platformRequest("GET", "/notices", null, null, null) }.isSuccess)
    }
    @Test fun manualRunRequiresPreviewDoesNotSubmitUntilConfirmedAndStopsOnFirstError() = runBlocking {
        val source = FakeEvaluationSource()
        val run = ManualEvaluationRun()
        assertTrue(runCatching { run.submit(source) }.isFailure)
        run.prepare(source, source.pending())
        assertEquals(0, source.submitted.size)
        val frozen = run.preview.toList()
        source.failAt = 2
        assertTrue(runCatching { run.submit(source) }.isFailure)
        assertEquals(frozen.take(2), source.submitted); assertEquals(2, run.progress); assertEquals(2, run.results.size)
        assertTrue(run.confirmed); assertTrue(run.preview.isEmpty())
        assertTrue(runCatching { run.submit(source) }.isFailure)
    }
    @Test fun manualRunEmptyDraftErrorAndSuccessfulDemoFlow() = runBlocking {
        val run = ManualEvaluationRun()
        val fake = FakeEvaluationSource()
        assertTrue(runCatching { run.prepare(fake, emptyList()) }.isFailure)
        fake.failDraft = true
        assertTrue(runCatching { run.prepare(fake, fake.pending()) }.isFailure)
        assertTrue(run.preview.isEmpty()); assertTrue(fake.submitted.isEmpty())
        val demo = DemoEvaluationSource()
        run.prepare(demo, demo.pending().take(2)); run.submit(demo)
        assertEquals(2, run.results.size); assertEquals(1, demo.pending().size)
    }
    @Test fun automaticDemoSeparatesCredentialsDeduplicatesShowsRoundReceiptAndCancels() = runBlocking {
        val backend = DemoCabinBackend()
        backend.call("POST", "/auth/login", payload("username" to "demo", "password" to "demo-only"))
        val credential = backend.call("POST", "/credentials", cabinSecret("demo-only", "demo-only", true, "evaluation")).jsonObject
        assertEquals("academic", credential.text("upstream")); assertEquals("evaluation", credential.text("purpose"))
        assertTrue(cabinCredentials(backend.call("GET", "/credentials")).isEmpty())
        assertEquals(1, cabinCredentials(backend.call("GET", "/credentials"), "evaluation").size)
        val request = evaluationJob(credential.text("id"), 60, "")
        val first = CabinSubmission(request).send(backend).jsonObject
        val second = CabinSubmission(request).send(backend).jsonObject
        assertEquals(first, second); assertTrue(backend.jobDeduplicated)
        backend.advance(first.text("id"), "succeeded")
        val resident = backend.call("GET", "/jobs").jsonArray.single().jsonObject
        assertEquals("queued", resident.text("state")); assertEquals(3, resident["receipt"]!!.jsonObject.number("submitted_count"))
        backend.call("POST", "/jobs/${first.text("id")}/cancel")
        assertEquals("cancelled", backend.call("GET", "/jobs").jsonArray.single().jsonObject.text("state"))
        assertTrue(backend.call("GET", "/notices").jsonArray.isEmpty())
        val next = CabinSubmission(request).send(backend).jsonObject
        backend.advance(next.text("id"), "failed")
        assertEquals("credential_invalid", backend.call("GET", "/notices").jsonArray.single().jsonObject.text("kind"))
        val updated = backend.call("PUT", "/credentials/${credential.text("id")}/secret", cabinSecret("demo-only", "updated-demo", false, "evaluation")).jsonObject
        assertEquals(next.text("id"), updated.text("resumed_job_id"))
        assertTrue(backend.call("GET", "/notices").jsonArray.isEmpty())
    }
    @Test fun productionDedupHeaderIsReadForHttp200AndResetForCreatedResponse() = runBlocking {
        var dedup = true
        var stored = "nanyee_csrf=fixture; path=/; secure"
        val backend = PlatformApi(object : PlatformCookieStorage {
            override fun read() = stored
            override fun write(value: String) {}
        }, FixtureTransport { request ->
            assertEquals(if (dedup) "fixture" else "updated-from-other-tool", request.header("X-CSRF-Token"))
            Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(if (dedup) 200 else 201).message("Fixture")
                .header("X-Job-Deduplicated", dedup.toString()).body("""{"id":"fixture"}""".toResponseBody()).build()
        })
        val body = evaluationJob("fixture", 60, "")
        backend.call("POST", "/jobs", body, "fixture-key"); assertTrue(backend.jobDeduplicated)
        dedup = false
        stored = "nanyee_csrf=updated-from-other-tool; path=/; secure"
        backend.call("POST", "/jobs", body, "next-key"); assertFalse(backend.jobDeduplicated)
    }
    private fun form(request: Request): Map<String, String> {
        val buffer = Buffer(); request.body!!.writeTo(buffer)
        return buffer.readUtf8().split('&').associate { field -> val parts = field.split('=', limit = 2); URLDecoder.decode(parts[0], "UTF-8") to URLDecoder.decode(parts[1], "UTF-8") }
    }
    private class FakeEvaluationSource : EvaluationSource {
        var failAt = 0
        var failDraft = false
        val submitted = mutableListOf<EvaluationPreview>()
        override suspend fun pending() = (1..3).map { evaluationReference.copy(hour = "hour-$it") }
        override suspend fun draft(reference: EvaluationReference): EvaluationDraft {
            check(!failDraft)
            return evaluationDraft(evaluationFixture, reference)
        }
        override suspend fun submit(preview: EvaluationPreview): Int {
            submitted += preview
            if (submitted.size == failAt) throw SchoolError(422, "UPSTREAM_REJECTED", "fixture rejection")
            return evaluationSubmission(preview).getValue("wtpf").toInt()
        }
    }
    private class FixtureTransport(val respond: (Request) -> Response) : Call.Factory {
        override fun newCall(request: Request): Call = object : Call {
            override fun request() = request
            override fun execute(): Response = error("enqueue only")
            override fun enqueue(callback: Callback) = callback.onResponse(this, respond(request))
            override fun cancel() {}
            override fun isCanceled() = false
            override fun isExecuted() = true
            override fun clone(): Call = newCall(request)
            override fun timeout() = Timeout.NONE
        }
    }
}
